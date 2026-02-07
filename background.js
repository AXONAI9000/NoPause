// Background service worker for NoPause extension

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['whitelist', 'settings'], (result) => {
    if (!result.whitelist) {
      chrome.storage.sync.set({ whitelist: [] });
    }
    // 初始化或升级 settings
    const defaults = { blockBlur: false, blockMiniVideos: false };
    if (!result.settings) {
      chrome.storage.sync.set({ settings: defaults });
    } else if (result.settings.blockMiniVideos === undefined) {
      result.settings.blockMiniVideos = false;
      chrome.storage.sync.set({ settings: result.settings });
    }
  });
});

// The injection function that runs in page context
function injectionFunction(settings) {
  if (window.__noPauseInjected) return;
  window.__noPauseInjected = true;

  // Store original methods FIRST
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  const originalDispatchEvent = EventTarget.prototype.dispatchEvent;

  // Events to block (always include blur events)
  const blockedEvents = ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'blur', 'focusout'];

  // Add our interceptors BEFORE overriding (use original method)
  blockedEvents.forEach(eventType => {
    originalAddEventListener.call(window, eventType, function(e) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);
    originalAddEventListener.call(document, eventType, function(e) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);
  });

  // Override document.hidden
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    enumerable: true,
    get: function() { return false; }
  });

  // Override document.visibilityState
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    enumerable: true,
    get: function() { return 'visible'; }
  });

  // Also handle webkitHidden for older browsers
  Object.defineProperty(document, 'webkitHidden', {
    configurable: true,
    enumerable: true,
    get: function() { return false; }
  });

  Object.defineProperty(document, 'webkitVisibilityState', {
    configurable: true,
    enumerable: true,
    get: function() { return 'visible'; }
  });

  // Override addEventListener to block visibility-related events
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (blockedEvents.includes(type)) {
      return; // Block
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // Block dispatchEvent for visibility-related events
  EventTarget.prototype.dispatchEvent = function(event) {
    if (event && blockedEvents.includes(event.type)) {
      return true;
    }
    return originalDispatchEvent.call(this, event);
  };

  // Override onvisibilitychange property
  let dummyVisHandler = null;
  Object.defineProperty(document, 'onvisibilitychange', {
    configurable: true,
    enumerable: true,
    get: function() { return dummyVisHandler; },
    set: function(handler) { dummyVisHandler = handler; }
  });

  // Override onpagehide
  let dummyPageHideHandler = null;
  Object.defineProperty(window, 'onpagehide', {
    configurable: true,
    enumerable: true,
    get: function() { return dummyPageHideHandler; },
    set: function(handler) { dummyPageHideHandler = handler; }
  });

  // Block blur-related (always enabled now)
  Document.prototype.hasFocus = function() { return true; };

  let dummyBlurHandler = null;
  Object.defineProperty(window, 'onblur', {
    configurable: true,
    enumerable: true,
    get: function() { return dummyBlurHandler; },
    set: function(handler) { dummyBlurHandler = handler; }
  });

  // Override requestAnimationFrame to prevent frame-based detection
  const originalRAF = window.requestAnimationFrame;
  let lastTime = 0;
  window.requestAnimationFrame = function(callback) {
    return originalRAF.call(window, function(time) {
      // Ensure time always progresses (prevents detection via frozen timestamps)
      if (time <= lastTime) {
        time = lastTime + 16.67;
      }
      lastTime = time;
      callback(time);
    });
  };

  // Intercept video.pause() calls triggered by visibility detection
  const originalPause = HTMLVideoElement.prototype.pause;
  let userInitiatedPause = false;

  // Track user interactions
  document.addEventListener('click', () => {
    userInitiatedPause = true;
    setTimeout(() => { userInitiatedPause = false; }, 200);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
      userInitiatedPause = true;
      setTimeout(() => { userInitiatedPause = false; }, 200);
    }
  }, true);

  HTMLVideoElement.prototype.pause = function() {
    if (!userInitiatedPause) {
      console.log('[NoPause] Blocked automatic video.pause()');
      return;
    }
    return originalPause.call(this);
  };

  // Auto-resume: Monitor all videos and resume if paused unexpectedly
  function setupVideoMonitor() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (video.__noPauseMonitored) return;
      video.__noPauseMonitored = true;

      let wasPlaying = false;
      let lastUserAction = 0;

      video.addEventListener('play', () => {
        wasPlaying = true;
      });

      video.addEventListener('pause', () => {
        const now = Date.now();
        // If video was playing and paused without recent user action, resume it
        if (wasPlaying && (now - lastUserAction > 300)) {
          console.log('[NoPause] Auto-resuming video');
          setTimeout(() => {
            if (video.paused && wasPlaying) {
              video.play().catch(() => {});
            }
          }, 50);
        }
        wasPlaying = false;
      });

      // Track user interactions on video
      video.addEventListener('click', () => {
        lastUserAction = Date.now();
        wasPlaying = !video.paused;
      });
    });
  }

  // Run monitor periodically to catch dynamically added videos
  setupVideoMonitor();
  setInterval(setupVideoMonitor, 2000);

  // Also use MutationObserver for faster detection
  const observer = new MutationObserver(() => {
    setupVideoMonitor();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // === Block ad redirects on first click ===
  const originalWindowOpen = window.open;
  let recentClick = false;
  let recentClickTime = 0;

  // Track all clicks for popup blocking
  originalAddEventListener.call(document, 'click', (e) => {
    recentClick = true;
    recentClickTime = Date.now();
    setTimeout(() => {
      recentClick = false;
    }, 500);
  }, true);

  // Override window.open to block popups triggered by clicks
  window.open = function(url, target, features) {
    if (recentClick && (Date.now() - recentClickTime < 500)) {
      console.log('[NoPause] Blocked ad popup:', url);
      return null;
    }
    return originalWindowOpen.call(window, url, target, features);
  };

  // Block click events that try to navigate away from video area
  originalAddEventListener.call(document, 'click', (e) => {
    const target = e.target;
    const link = target.closest('a');

    // Check if clicking on or near a video element
    const isNearVideo = target.closest('video') ||
                        target.closest('[class*="player"]') ||
                        target.closest('[class*="video"]') ||
                        target.closest('[id*="player"]') ||
                        target.closest('[id*="video"]');

    if (isNearVideo && link && link.target === '_blank') {
      const linkHost = new URL(link.href, location.href).hostname;
      if (linkHost !== location.hostname) {
        console.log('[NoPause] Blocked ad link:', link.href);
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  // === Mini-Video / Ad iframe Blocker ===
  if (settings && settings.blockMiniVideos) {
    console.log('[NoPause] Mini-video/iframe blocker enabled');

    // 常见广告尺寸 (宽x高)
    const adSizes = [
      [300, 250], [336, 280], [728, 90], [160, 600],
      [320, 50], [300, 600], [970, 250], [970, 90],
      [468, 60], [234, 60], [120, 600], [120, 240],
      [250, 250], [200, 200], [180, 150], [125, 125]
    ];

    function isAdSize(w, h) {
      return adSizes.some(([aw, ah]) => Math.abs(w - aw) < 5 && Math.abs(h - ah) < 5);
    }

    function isMiniAdIframe(iframe) {
      if (iframe.__noPauseMiniChecked) return false;

      const rect = iframe.getBoundingClientRect();
      const w = rect.width || parseInt(iframe.getAttribute('width')) || 0;
      const h = rect.height || parseInt(iframe.getAttribute('height')) || 0;

      // 尺寸为 0（未完成布局）→ 跳过
      if (w === 0 && h === 0) return false;

      // 大尺寸 iframe 不拦截（可能是主内容/播放器）
      if (w > 400 && h > 400) {
        iframe.__noPauseMiniChecked = true;
        return false;
      }

      // 检查 src / data-link
      const src = iframe.src || iframe.getAttribute('data-src') || '';
      const dataLink = iframe.getAttribute('data-link') || '';
      const allUrls = src + ' ' + dataLink;

      // javascript: 协议 + 有 data-link 指向外部 → 高度可疑
      if (src.startsWith('javascript:') && dataLink) {
        return true;
      }

      // 标准广告尺寸匹配
      if (isAdSize(w, h)) {
        // 额外检查：是否有追踪/广告域名特征
        const adPatterns = [
          'trck', 'track', 'click', 'ad', 'banner', 'popup',
          'snaptrckr', 'doubleclick', 'googlesyndication',
          'adserver', 'adnxs', 'adsrv', 'adform'
        ];
        const urlLower = allUrls.toLowerCase();
        for (const pattern of adPatterns) {
          if (urlLower.includes(pattern)) {
            return true;
          }
        }

        // 标准广告尺寸 + scrolling=no + frameborder=0 → 很可能是广告
        const noScroll = iframe.getAttribute('scrolling') === 'no';
        const noBorder = iframe.getAttribute('frameborder') === '0' || iframe.style.border === 'none' || iframe.style.border === '0';
        if (noScroll && noBorder) {
          return true;
        }
      }

      // 小尺寸 iframe（宽 ≤ 400）在侧边栏中
      if (w <= 400) {
        const sidebarSelectors = [
          'aside',
          '[class*="sidebar"]', '[class*="Sidebar"]',
          '[class*="side-bar"]', '[class*="SideBar"]',
          '[class*="recommend"]', '[class*="Recommend"]',
          '[class*="related"]', '[class*="Related"]',
          '[class*="widget"]', '[class*="Widget"]',
          '[id*="sidebar"]', '[id*="Sidebar"]',
          '[id*="side-bar"]', '[id*="SideBar"]',
          '[id*="secondary"]', '[id*="Secondary"]',
          '[role="complementary"]'
        ];

        for (const sel of sidebarSelectors) {
          try {
            if (iframe.closest(sel)) {
              // 在侧边栏中的小 iframe，检查是否有广告特征
              const noScroll = iframe.getAttribute('scrolling') === 'no';
              if (noScroll || src.startsWith('javascript:') || isAdSize(w, h)) {
                return true;
              }
            }
          } catch (e) {}
        }
      }

      iframe.__noPauseMiniChecked = true;
      return false;
    }

    function removeAdIframe(iframe) {
      try {
        const rect = iframe.getBoundingClientRect();
        console.log('[NoPause] Removing ad iframe:', iframe.src?.substring(0, 80) || '(no src)',
          'size:', rect.width + 'x' + rect.height,
          'data-link:', (iframe.getAttribute('data-link') || '').substring(0, 60));
        iframe.src = 'about:blank';
        iframe.remove();
      } catch (e) {
        console.error('[NoPause] Error removing ad iframe:', e);
      }
    }

    function scanAdIframes() {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        if (iframe.__noPauseMiniChecked) return;
        if (isMiniAdIframe(iframe)) {
          removeAdIframe(iframe);
        }
      });
    }

    // 初始扫描延迟 500ms 等待布局完成
    setTimeout(scanAdIframes, 500);

    // MutationObserver 监控动态添加的节点
    const adIframeObserver = new MutationObserver((mutations) => {
      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }
      if (hasNewNodes) {
        setTimeout(scanAdIframes, 500);
      }
    });
    adIframeObserver.observe(document.documentElement, { childList: true, subtree: true });

    // 每 3 秒兜底扫描
    setInterval(scanAdIframes, 3000);
  }

  console.log('[NoPause] Protection enabled (blocking: ' + blockedEvents.join(', ') + ')');
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getWhitelist') {
    chrome.storage.sync.get(['whitelist'], (result) => {
      sendResponse({ whitelist: result.whitelist || [] });
    });
    return true;
  }

  if (message.action === 'addToWhitelist') {
    chrome.storage.sync.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      if (!whitelist.includes(message.domain)) {
        whitelist.push(message.domain);
        chrome.storage.sync.set({ whitelist }, () => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }

  if (message.action === 'removeFromWhitelist') {
    chrome.storage.sync.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      const index = whitelist.indexOf(message.domain);
      if (index > -1) {
        whitelist.splice(index, 1);
        chrome.storage.sync.set({ whitelist }, () => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }

  if (message.action === 'getSettings') {
    chrome.storage.sync.get(['settings'], (result) => {
      sendResponse({ settings: result.settings || { blockBlur: false, blockMiniVideos: false } });
    });
    return true;
  }

  if (message.action === 'updateSettings') {
    chrome.storage.sync.set({ settings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'injectScript') {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return true;
    }

    // 先读取 settings，再通过 args 传入
    chrome.storage.sync.get(['settings'], (result) => {
      const settings = result.settings || { blockBlur: false, blockMiniVideos: false };
      const target = frameId !== undefined ? { tabId: tabId, frameIds: [frameId] } : { tabId: tabId };

      chrome.scripting.executeScript({
        target: target,
        world: 'MAIN',
        func: injectionFunction,
        args: [settings]
      }).then(() => {
        console.log('[NoPause] Script injected successfully to frame:', frameId);
        sendResponse({ success: true });
      }).catch((error) => {
        console.error('[NoPause] Injection failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    });
    return true;
  }

  // Check if the tab's main URL is whitelisted (for iframes)
  if (message.action === 'checkTabWhitelist') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ whitelisted: false });
      return true;
    }

    chrome.tabs.get(tabId, (tab) => {
      if (!tab || !tab.url) {
        sendResponse({ whitelisted: false });
        return;
      }

      try {
        const hostname = new URL(tab.url).hostname;
        const domain = extractDomain(hostname);

        chrome.storage.sync.get(['whitelist', 'settings'], (result) => {
          const whitelist = result.whitelist || [];
          const settings = result.settings || { blockBlur: false, blockMiniVideos: false };
          const whitelisted = whitelist.includes(domain);

          sendResponse({
            whitelisted: whitelisted,
            blockBlur: settings.blockBlur,
            blockMiniVideos: settings.blockMiniVideos || false
          });
        });
      } catch (e) {
        sendResponse({ whitelisted: false });
      }
    });
    return true;
  }
});

// Update badge when tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    updateBadge(tabId, tab.url);
  }
});

// Update badge when tab is activated
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) {
      updateBadge(activeInfo.tabId, tab.url);
    }
  });
});

function updateBadge(tabId, url) {
  try {
    const hostname = new URL(url).hostname;
    const domain = extractDomain(hostname);

    chrome.storage.sync.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      if (whitelist.includes(domain)) {
        chrome.action.setBadgeText({ tabId, text: '✓' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#10b981' });
      } else {
        chrome.action.setBadgeText({ tabId, text: '' });
      }
    });
  } catch (e) {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

function extractDomain(hostname) {
  return hostname.replace(/^www\./, '');
}

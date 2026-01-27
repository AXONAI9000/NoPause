// Background service worker for NoPause extension

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['whitelist'], (result) => {
    if (!result.whitelist) {
      chrome.storage.sync.set({ whitelist: [] });
    }
  });
});

// The injection function that runs in page context
function injectionFunction() {
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
      sendResponse({ settings: result.settings || { blockBlur: false } });
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

    // Use chrome.scripting.executeScript with MAIN world to bypass CSP
    // Target specific frame if frameId is provided
    const target = frameId !== undefined ? { tabId: tabId, frameIds: [frameId] } : { tabId: tabId };

    chrome.scripting.executeScript({
      target: target,
      world: 'MAIN',
      func: injectionFunction,
      args: []
    }).then(() => {
      console.log('[NoPause] Script injected successfully to frame:', frameId);
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('[NoPause] Injection failed:', error);
      sendResponse({ success: false, error: error.message });
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
          const settings = result.settings || { blockBlur: false };
          const whitelisted = whitelist.includes(domain);

          sendResponse({
            whitelisted: whitelisted,
            blockBlur: settings.blockBlur
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
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#4CAF50' });
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

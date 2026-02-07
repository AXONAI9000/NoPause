// Core injection script - runs in page context
(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__noPauseInjected) return;
  window.__noPauseInjected = true;

  console.log('[NoPause] Initializing video anti-pause protection...');

  // Override document.hidden to always return false
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    enumerable: true,
    get: function() {
      return false;
    }
  });

  // Override document.visibilityState to always return 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    enumerable: true,
    get: function() {
      return 'visible';
    }
  });

  // Store original methods
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

  // Track blocked listeners for potential cleanup
  const blockedListeners = new WeakMap();

  // Override addEventListener to block visibilitychange
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'visibilitychange') {
      console.log('[NoPause] Blocked visibilitychange listener');
      // Store the blocked listener in case we need to reference it
      if (!blockedListeners.has(this)) {
        blockedListeners.set(this, []);
      }
      blockedListeners.get(this).push({ type, listener, options });
      return;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // Intercept dispatchEvent to block visibilitychange events
  const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function(event) {
    if (event && event.type === 'visibilitychange') {
      console.log('[NoPause] Blocked visibilitychange event dispatch');
      return true;
    }
    return originalDispatchEvent.call(this, event);
  };

  // Override onvisibilitychange property
  let dummyHandler = null;
  Object.defineProperty(document, 'onvisibilitychange', {
    configurable: true,
    enumerable: true,
    get: function() {
      return dummyHandler;
    },
    set: function(handler) {
      console.log('[NoPause] Blocked onvisibilitychange assignment');
      dummyHandler = handler; // Store but don't actually use it
    }
  });

  // Prevent the browser's native visibilitychange event from firing
  // by capturing it at the window level
  window.addEventListener('visibilitychange', function(e) {
    e.stopImmediatePropagation();
    e.preventDefault();
    console.log('[NoPause] Intercepted native visibilitychange event');
  }, true);

  document.addEventListener('visibilitychange', function(e) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);

  // Check if blur blocking is enabled
  if (window.__noPauseBlockBlur) {
    console.log('[NoPause] Blur blocking enabled');

    // Block window blur/focus events
    const blurEvents = ['blur', 'focusout'];
    blurEvents.forEach(eventType => {
      window.addEventListener(eventType, function(e) {
        if (e.target === window) {
          e.stopImmediatePropagation();
          console.log(`[NoPause] Blocked ${eventType} event`);
        }
      }, true);
    });

    // Override document.hasFocus to always return true
    const originalHasFocus = Document.prototype.hasFocus;
    Document.prototype.hasFocus = function() {
      return true;
    };

    // Override window.onblur
    Object.defineProperty(window, 'onblur', {
      configurable: true,
      enumerable: true,
      get: function() { return null; },
      set: function(handler) {
        console.log('[NoPause] Blocked window.onblur assignment');
      }
    });
  }

  // === Mini-Video / Ad iframe Blocker ===
  if (window.__noPauseBlockMiniVideos) {
    console.log('[NoPause] Mini-video/iframe blocker enabled (inject.js)');

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

      if (w === 0 && h === 0) return false;

      if (w > 400 && h > 400) {
        iframe.__noPauseMiniChecked = true;
        return false;
      }

      const src = iframe.src || iframe.getAttribute('data-src') || '';
      const dataLink = iframe.getAttribute('data-link') || '';
      const allUrls = src + ' ' + dataLink;

      if (src.startsWith('javascript:') && dataLink) {
        return true;
      }

      if (isAdSize(w, h)) {
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

        const noScroll = iframe.getAttribute('scrolling') === 'no';
        const noBorder = iframe.getAttribute('frameborder') === '0' || iframe.style.border === 'none' || iframe.style.border === '0';
        if (noScroll && noBorder) {
          return true;
        }
      }

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
          'size:', rect.width + 'x' + rect.height);
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

    setTimeout(scanAdIframes, 500);

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

    setInterval(scanAdIframes, 3000);
  }

  // For pages that use Page Visibility API through other means
  // Override the PageVisibility API if it exists
  if (typeof PageVisibilityAPI !== 'undefined') {
    PageVisibilityAPI = {
      hidden: false,
      visibilityState: 'visible'
    };
  }

  // === Block ad redirects on first click ===
  const originalWindowOpen = window.open;
  let recentClick = false;
  let recentClickTime = 0;

  // Track all clicks
  document.addEventListener('click', (e) => {
    recentClick = true;
    recentClickTime = Date.now();
    // Reset after 500ms
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

  // Block click events that try to navigate away
  document.addEventListener('click', (e) => {
    const target = e.target;
    const link = target.closest('a');

    // Check if clicking on or near a video element
    const isNearVideo = target.closest('video') ||
                        target.closest('[class*="player"]') ||
                        target.closest('[class*="video"]') ||
                        target.closest('[id*="player"]') ||
                        target.closest('[id*="video"]');

    if (isNearVideo && link && link.target === '_blank') {
      // Block external links that open in new tab when clicking video area
      const linkHost = new URL(link.href, location.href).hostname;
      if (linkHost !== location.hostname) {
        console.log('[NoPause] Blocked ad link:', link.href);
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  console.log('[NoPause] Video anti-pause protection enabled successfully!');
})();

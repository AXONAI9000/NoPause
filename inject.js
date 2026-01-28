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

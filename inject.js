// Core injection script - runs in page context
(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__noPauseInjected) return;
  window.__noPauseInjected = true;

  // Store original values
  const originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const originalVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');

  // Override document.hidden to always return false
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: function() {
      return false;
    }
  });

  // Override document.visibilityState to always return 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: function() {
      return 'visible';
    }
  });

  // Block visibilitychange events
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'visibilitychange') {
      // Don't add the listener, effectively blocking the event
      return;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // Also override document.addEventListener specifically
  const originalDocAddEventListener = document.addEventListener;
  document.addEventListener = function(type, listener, options) {
    if (type === 'visibilitychange') {
      return;
    }
    return originalDocAddEventListener.call(this, type, listener, options);
  };

  // Block existing visibilitychange listeners by preventing the event dispatch
  const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function(event) {
    if (event && event.type === 'visibilitychange') {
      return true;
    }
    return originalDispatchEvent.call(this, event);
  };

  // Check if blur blocking is enabled
  if (window.__noPauseBlockBlur) {
    // Block window blur events
    window.addEventListener = function(type, listener, options) {
      if (type === 'blur' || type === 'focusout') {
        return;
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    // Override document.hasFocus to always return true
    Document.prototype.hasFocus = function() {
      return true;
    };
  }

  console.log('[NoPause] Video anti-pause protection enabled');
})();

// Content script - runs at document_start in isolated world (including iframes)

(function() {
  'use strict';

  function extractDomain(hostname) {
    return hostname.replace(/^www\./, '');
  }

  const currentDomain = extractDomain(window.location.hostname);
  const isIframe = window !== window.top;

  // Request background to inject script (bypasses CSP)
  function requestInjection() {
    chrome.runtime.sendMessage({
      action: 'injectScript'
    });
  }

  // For iframes, ask background to check if the TAB's main URL is whitelisted
  if (isIframe) {
    chrome.runtime.sendMessage({ action: 'checkTabWhitelist' }, (response) => {
      if (response && response.whitelisted) {
        requestInjection();
      }
    });
  } else {
    // Main frame - check whitelist normally
    chrome.storage.sync.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];

      if (whitelist.includes(currentDomain)) {
        requestInjection();
      }
    });
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'enableNow') {
      requestInjection();
      sendResponse({ success: true });
    }

    if (message.action === 'getDomain') {
      sendResponse({ domain: currentDomain });
    }

    return true;
  });
})();

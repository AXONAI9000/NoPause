// Content script - runs in isolated world, manages injection

(function() {
  'use strict';

  // Extract domain from hostname
  function extractDomain(hostname) {
    return hostname.replace(/^www\./, '');
  }

  // Get current domain
  const currentDomain = extractDomain(window.location.hostname);

  // Inject the script into page context
  function injectScript(blockBlur = false) {
    // Set blur blocking flag before injection
    if (blockBlur) {
      const flagScript = document.createElement('script');
      flagScript.textContent = 'window.__noPauseBlockBlur = true;';
      (document.head || document.documentElement).appendChild(flagScript);
      flagScript.remove();
    }

    // Inject main script
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // Check whitelist and inject if needed
  function checkAndInject() {
    chrome.storage.sync.get(['whitelist', 'settings'], (result) => {
      const whitelist = result.whitelist || [];
      const settings = result.settings || { blockBlur: false };

      if (whitelist.includes(currentDomain)) {
        injectScript(settings.blockBlur);
      }
    });
  }

  // Run check on page load
  checkAndInject();

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'enableNow') {
      injectScript(message.blockBlur || false);
      sendResponse({ success: true });
    }

    if (message.action === 'getDomain') {
      sendResponse({ domain: currentDomain });
    }

    return true;
  });
})();

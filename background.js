// Background service worker for NoPause extension

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['whitelist', 'settings'], (result) => {
    if (!result.whitelist) {
      chrome.storage.sync.set({ whitelist: [] });
    }
    if (!result.settings) {
      chrome.storage.sync.set({ settings: { blockBlur: false } });
    }
  });
});

// Listen for messages from popup or content scripts
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
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      files: ['inject.js']
    }).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
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
  // Remove www. prefix if present
  return hostname.replace(/^www\./, '');
}

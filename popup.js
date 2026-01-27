// Popup script - handles UI interactions

document.addEventListener('DOMContentLoaded', async () => {
  const currentDomainEl = document.getElementById('currentDomain');
  const enableToggle = document.getElementById('enableToggle');
  const toggleLabel = document.getElementById('toggleLabel');
  const statusMessage = document.getElementById('statusMessage');
  const refreshHint = document.getElementById('refreshHint');
  const refreshBtn = document.getElementById('refreshBtn');

  let currentDomain = '';
  let isEnabled = false;
  let needsRefresh = false;

  // Extract domain from hostname
  function extractDomain(hostname) {
    return hostname.replace(/^www\./, '');
  }

  // Get current tab info
  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // Update UI based on state
  function updateUI() {
    if (isEnabled) {
      toggleLabel.textContent = '已启用';
      toggleLabel.classList.add('enabled');
      statusMessage.classList.add('visible');
    } else {
      toggleLabel.textContent = '未启用';
      toggleLabel.classList.remove('enabled');
      statusMessage.classList.remove('visible');
    }

    if (needsRefresh) {
      refreshHint.classList.add('visible');
    } else {
      refreshHint.classList.remove('visible');
    }
  }

  // Initialize popup
  async function init() {
    try {
      const tab = await getCurrentTab();

      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        currentDomainEl.textContent = '不支持此页面';
        enableToggle.disabled = true;
        return;
      }

      const url = new URL(tab.url);
      currentDomain = extractDomain(url.hostname);
      currentDomainEl.textContent = currentDomain;

      // Get whitelist
      const result = await chrome.storage.sync.get(['whitelist']);
      const whitelist = result.whitelist || [];

      isEnabled = whitelist.includes(currentDomain);
      enableToggle.checked = isEnabled;

      updateUI();
    } catch (error) {
      console.error('Init error:', error);
      currentDomainEl.textContent = '加载失败';
      enableToggle.disabled = true;
    }
  }

  // Handle toggle change
  enableToggle.addEventListener('change', async () => {
    const enabled = enableToggle.checked;

    if (enabled) {
      // Add to whitelist
      await chrome.runtime.sendMessage({
        action: 'addToWhitelist',
        domain: currentDomain
      });

      // Try to inject immediately
      const tab = await getCurrentTab();

      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'enableNow',
          blockBlur: true  // Always enable blur blocking
        });
        // Even if injection succeeds, page scripts may have already added listeners
        // So we should refresh to ensure full protection
        needsRefresh = true;
      } catch (e) {
        // Content script might not be ready, show refresh hint
        needsRefresh = true;
      }
    } else {
      // Remove from whitelist
      await chrome.runtime.sendMessage({
        action: 'removeFromWhitelist',
        domain: currentDomain
      });
      needsRefresh = true;
    }

    isEnabled = enabled;
    updateUI();

    // Update badge
    const tab = await getCurrentTab();
    if (enabled) {
      chrome.action.setBadgeText({ tabId: tab.id, text: '✓' });
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#4CAF50' });
    } else {
      chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    }
  });

  // Handle refresh button
  refreshBtn.addEventListener('click', async () => {
    const tab = await getCurrentTab();
    chrome.tabs.reload(tab.id);
    window.close();
  });

  // Initialize
  init();
});

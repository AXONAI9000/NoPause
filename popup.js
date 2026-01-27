// Popup script - handles UI interactions

document.addEventListener('DOMContentLoaded', async () => {
  const currentDomainEl = document.getElementById('currentDomain');
  const enableToggle = document.getElementById('enableToggle');
  const toggleLabel = document.getElementById('toggleLabel');
  const statusMessage = document.getElementById('statusMessage');
  const refreshHint = document.getElementById('refreshHint');
  const advancedToggle = document.getElementById('advancedToggle');
  const advancedArrow = document.getElementById('advancedArrow');
  const advancedOptions = document.getElementById('advancedOptions');
  const blockBlurCheckbox = document.getElementById('blockBlurCheckbox');

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

      // Get whitelist and settings
      const result = await chrome.storage.sync.get(['whitelist', 'settings']);
      const whitelist = result.whitelist || [];
      const settings = result.settings || { blockBlur: false };

      isEnabled = whitelist.includes(currentDomain);
      enableToggle.checked = isEnabled;
      blockBlurCheckbox.checked = settings.blockBlur;

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
      const settings = await chrome.storage.sync.get(['settings']);
      const blockBlur = settings.settings?.blockBlur || false;

      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'enableNow',
          blockBlur: blockBlur
        });
        needsRefresh = false;
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

  // Handle advanced toggle
  advancedToggle.addEventListener('click', () => {
    advancedOptions.classList.toggle('visible');
    advancedArrow.classList.toggle('expanded');
  });

  // Handle block blur checkbox
  blockBlurCheckbox.addEventListener('change', async () => {
    const settings = { blockBlur: blockBlurCheckbox.checked };
    await chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: settings
    });

    if (isEnabled) {
      needsRefresh = true;
      updateUI();
    }
  });

  // Initialize
  init();
});

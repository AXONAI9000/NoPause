// Popup script - handles UI interactions

document.addEventListener('DOMContentLoaded', async () => {
  const currentDomainEl = document.getElementById('currentDomain');
  const enableToggle = document.getElementById('enableToggle');
  const toggleLabel = document.getElementById('toggleLabel');
  const statusDesc = document.getElementById('statusDesc');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const actionBar = document.getElementById('actionBar');
  const refreshBtn = document.getElementById('refreshBtn');
  const siteCard = document.getElementById('siteCard');
  const toggleCard = document.getElementById('toggleCard');
  const miniVideoToggle = document.getElementById('miniVideoToggle');
  const miniVideoDesc = document.getElementById('miniVideoDesc');
  const miniVideoCard = document.getElementById('miniVideoCard');

  let currentDomain = '';
  let isEnabled = false;

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
  function updateUI(showRefresh = false) {
    if (isEnabled) {
      toggleLabel.textContent = '防暂停保护';
      statusDesc.textContent = '已为此网站启用';
      statusIndicator.classList.remove('inactive');
      statusIndicator.classList.add('active');
      statusText.textContent = '保护已启用';
    } else {
      toggleLabel.textContent = '防暂停保护';
      statusDesc.textContent = '点击开关启用';
      statusIndicator.classList.remove('active');
      statusIndicator.classList.add('inactive');
      statusText.textContent = '保护未启用';
    }

    if (showRefresh) {
      actionBar.classList.add('visible');
    } else {
      actionBar.classList.remove('visible');
    }
  }

  // Show unsupported state
  function showUnsupported(message) {
    currentDomainEl.textContent = message;
    document.querySelector('.toggle-wrapper').classList.add('disabled');
    enableToggle.disabled = true;
    statusDesc.textContent = '无法在此页面使用';
    statusIndicator.classList.remove('active');
    statusIndicator.classList.add('inactive');
    statusText.textContent = '不支持此页面';
    toggleCard.classList.add('disabled');
    miniVideoToggle.disabled = true;
    miniVideoCard.classList.add('disabled');
  }

  // Initialize popup
  async function init() {
    try {
      const tab = await getCurrentTab();

      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        showUnsupported('系统页面');
        return;
      }

      const url = new URL(tab.url);
      currentDomain = extractDomain(url.hostname);
      currentDomainEl.textContent = currentDomain;

      // Get whitelist and settings
      const result = await chrome.storage.sync.get(['whitelist', 'settings']);
      const whitelist = result.whitelist || [];
      const settings = result.settings || { blockBlur: false, blockMiniVideos: false };

      isEnabled = whitelist.includes(currentDomain);
      enableToggle.checked = isEnabled;

      // Initialize mini-video toggle
      miniVideoToggle.checked = settings.blockMiniVideos || false;
      miniVideoDesc.textContent = settings.blockMiniVideos ? '已启用拦截' : '屏蔽侧边栏小视频';

      updateUI(false);
    } catch (error) {
      console.error('Init error:', error);
      showUnsupported('加载失败');
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
          action: 'enableNow'
        });
      } catch (e) {
        // Content script might not be ready
      }

      // Update badge
      chrome.action.setBadgeText({ tabId: tab.id, text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#10b981' });
    } else {
      // Remove from whitelist
      await chrome.runtime.sendMessage({
        action: 'removeFromWhitelist',
        domain: currentDomain
      });

      // Update badge
      const tab = await getCurrentTab();
      chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    }

    isEnabled = enabled;
    updateUI(true); // Show refresh button
  });

  // Handle mini-video toggle change
  miniVideoToggle.addEventListener('change', async () => {
    const enabled = miniVideoToggle.checked;

    // Read current settings, update blockMiniVideos, save
    const result = await chrome.storage.sync.get(['settings']);
    const settings = result.settings || { blockBlur: false, blockMiniVideos: false };
    settings.blockMiniVideos = enabled;

    await chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: settings
    });

    // Update description text
    miniVideoDesc.textContent = enabled ? '已启用拦截' : '屏蔽侧边栏小视频';

    // Show refresh button
    actionBar.classList.add('visible');
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

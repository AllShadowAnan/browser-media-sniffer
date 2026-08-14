/**
 * MediaSniffer Popup Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  const sourceTitleEl = document.getElementById('source-title');
  const btnStartPicker = document.getElementById('btn-start-picker');
  const btnScanPage = document.getElementById('btn-scan-page');
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnOpenInGallery = document.getElementById('btn-open-in-gallery');
  const quickSection = document.getElementById('quick-section');
  const thumbnailStrip = document.getElementById('thumbnail-strip');
  const totalCountEl = document.getElementById('total-count');
  const imgCountEl = document.getElementById('img-count');
  const videoCountEl = document.getElementById('video-count');
  const audioCountEl = document.getElementById('audio-count');
  const liveCountEl = document.getElementById('live-count');
  const badgeLiveWrapper = document.getElementById('badge-live-wrapper');
  const badgeAudioWrapper = document.getElementById('badge-audio-wrapper');
  const statusMsg = document.getElementById('status-msg');

  let currentTab = null;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      currentTab = tabs[0];
      sourceTitleEl.textContent = currentTab.title || currentTab.url || '当前网页';
      sourceTitleEl.title = currentTab.url || '';

      if (currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('chrome-extension://') || currentTab.url.startsWith('edge://')) {
        showStatus('⚠️ 浏览器内部页面无法注入脚本抓取，请在普通网页上使用');
        btnStartPicker.disabled = true;
        btnScanPage.disabled = true;
        return;
      }

      await ensureContentScript(currentTab.id);
      triggerScan(false);
    }
  } catch (err) {
    console.error(err);
    sourceTitleEl.textContent = '无法读取当前标签页';
  }

  async function ensureContentScript(tabId) {
    try {
      const pong = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (pong && pong.status === 'PONG') return true;
    } catch {
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ['content/selector.css']
        });
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content/content.js']
        });
      } catch (e) {
        console.warn('Script injection notice:', e);
      }
    }
    return true;
  }

  function showStatus(text, duration = 3000) {
    statusMsg.style.display = 'block';
    statusMsg.textContent = text;
    if (duration > 0) {
      setTimeout(() => {
        statusMsg.style.display = 'none';
      }, duration);
    }
  }

  // Start Picker Action
  btnStartPicker.addEventListener('click', async () => {
    if (!currentTab) return;
    try {
      await ensureContentScript(currentTab.id);
      await chrome.tabs.sendMessage(currentTab.id, { action: 'START_PICKER' });
      window.close();
    } catch (e) {
      showStatus('启动选取模式失败：' + e.message);
    }
  });

  // Scan Full Page Action
  async function triggerScan(openDashboardOnComplete = true) {
    if (!currentTab) return;
    try {
      await ensureContentScript(currentTab.id);
      const res = await chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_FULL_PAGE' });

      let items = (res && res.items) || [];

      // Query background for additional network-sniffed live streams and audio
      try {
        const netRes = await chrome.runtime.sendMessage({ action: 'GET_TAB_LIVE_STREAMS', tabId: currentTab.id });
        if (netRes && netRes.streams) {
          netRes.streams.forEach(ns => {
            if (!items.some(i => i.url === ns.url)) items.unshift(ns);
          });
        }
      } catch {}

      if (items.length > 0) {
        const images = items.filter(i => i.type === 'image');
        const videos = items.filter(i => i.type === 'video');
        const audios = items.filter(i => i.type === 'audio');
        const lives = items.filter(i => i.type === 'live' || i.isLive);

        totalCountEl.textContent = items.length;
        imgCountEl.textContent = images.length;
        videoCountEl.textContent = videos.length;

        if (audios.length > 0) {
          badgeAudioWrapper.style.display = 'inline-flex';
          audioCountEl.textContent = audios.length;
        } else {
          badgeAudioWrapper.style.display = 'none';
        }

        if (lives.length > 0) {
          badgeLiveWrapper.style.display = 'inline-flex';
          liveCountEl.textContent = lives.length;
        } else {
          badgeLiveWrapper.style.display = 'none';
        }

        // Render thumbnails strip
        thumbnailStrip.innerHTML = '';
        const previewItems = items.slice(0, 12);
        previewItems.forEach(item => {
          const div = document.createElement('div');
          div.className = 'strip-item';
          if (item.type === 'audio') {
            div.innerHTML = `
              <div style="width:100%;height:100%;background:#064e3b;display:flex;align-items:center;justify-content:center;color:#34d399;font-size:20px;">🎵</div>
              <span class="strip-badge" style="background:#059669;color:#fff;">${item.format || 'AUDIO'}</span>
            `;
          } else if (item.type === 'live' || item.isLive) {
            div.innerHTML = `
              <div style="width:100%;height:100%;background:#1e1b4b;display:flex;align-items:center;justify-content:center;color:#ef4444;font-size:18px;">📡</div>
              <span class="strip-badge" style="background:#dc2626;color:#fff;">LIVE</span>
            `;
          } else if (item.type === 'video') {
            div.innerHTML = `
              <video src="${item.url}" preload="metadata"></video>
              <span class="strip-badge">🎬 视频</span>
            `;
          } else {
            div.innerHTML = `
              <img src="${item.url}" loading="lazy" onerror="this.src='../icons/icon48.png'">
              <span class="strip-badge">${item.format || 'img'}</span>
            `;
          }
          thumbnailStrip.appendChild(div);
        });

        quickSection.style.display = 'flex';

        await chrome.storage.local.set({
          'ms_latest_capture': {
            items: items,
            title: res?.title || currentTab.title,
            url: res?.url || currentTab.url,
            label: '全页面扫描',
            timestamp: Date.now()
          }
        });

        if (openDashboardOnComplete) {
          chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
          window.close();
        }
      }
    } catch (e) {
      console.warn('Scan error:', e);
    }
  }

  btnScanPage.addEventListener('click', () => {
    triggerScan(true);
  });

  btnOpenDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    window.close();
  });

  btnOpenInGallery.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    window.close();
  });
});

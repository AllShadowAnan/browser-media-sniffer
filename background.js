/**
 * MediaSniffer Background Service Worker
 * Manages downloading, webRequest stream & audio monitoring, context menus, and storage.
 */

// Tab-level dynamic media cache (streams + audio)
const tabStreamsMap = new Map(); // tabId -> Array of stream/audio items

// Initialize Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ms-scan-page',
    title: '🔍 抓取此页面的音视频、图片与直播 (MediaSniffer)',
    contexts: ['page', 'image', 'video', 'audio', 'link']
  });

  chrome.contextMenus.create({
    id: 'ms-inspect-element',
    title: '🎯 开启鼠标选区抓取模式',
    contexts: ['page', 'image', 'video', 'audio', 'link']
  });
});

// Network live stream & Audio sniffer via webRequest
if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  const STREAM_URL_FILTER = {
    urls: [
      "*://*/*.m3u8*",
      "*://*/*.flv*",
      "*://*/*.mpd*",
      "*://*/hls/*",
      "*://*/live/*",
      "*://*/*.mp3*",
      "*://*/*.m4a*",
      "*://*/*.aac*",
      "*://*/*.flac*",
      "*://*/*.wav*",
      "*://*/*.ogg*",
      "*://*/*.opus*"
    ]
  };

  const AUDIO_REGEX = /\.(mp3|m4a|aac|flac|wav|ogg|opus)(\?.*)?$/i;

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId <= 0) return;
      const url = details.url;

      let isAudio = AUDIO_REGEX.test(url);
      let format = 'm3u8';
      let type = 'live';

      if (isAudio) {
        type = 'audio';
        format = url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp3';
      } else if (url.includes('.flv')) {
        format = 'flv';
      } else if (url.includes('.mpd')) {
        format = 'mpd';
      }

      const mediaItem = {
        url: url,
        type: type,
        format: format,
        isLive: type === 'live',
        filename: isAudio ? `audio_${Date.now().toString().slice(-4)}.${format}` : `live_stream_${Date.now().toString().slice(-4)}.${format}`,
        title: isAudio ? '网络抓取音频' : '网络直播媒体流',
        width: 0,
        height: 0,
        sourceElement: 'network-request',
        timestamp: Date.now()
      };

      if (!tabStreamsMap.has(details.tabId)) {
        tabStreamsMap.set(details.tabId, []);
      }
      const list = tabStreamsMap.get(details.tabId);
      if (!list.some(item => item.url === url)) {
        list.push(mediaItem);
      }
    },
    STREAM_URL_FILTER
  );
}

// Clean up tab stream cache when tab closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStreamsMap.delete(tabId);
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'ms-scan-page') {
    try {
      await ensureContentScriptInjected(tab.id);
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_FULL_PAGE' });
      let items = (res && res.items) || [];

      // Merge webRequest live streams & audios
      if (tabStreamsMap.has(tab.id)) {
        const netStreams = tabStreamsMap.get(tab.id);
        netStreams.forEach(ns => {
          if (!items.some(i => i.url === ns.url)) items.unshift(ns);
        });
      }

      await saveMediaAndOpenDashboard(items, res?.title || tab.title, res?.url || tab.url, '全页面扫描');
    } catch (err) {
      console.error('Failed to scan page from context menu:', err);
    }
  } else if (info.menuItemId === 'ms-inspect-element') {
    try {
      await ensureContentScriptInjected(tab.id);
      await chrome.tabs.sendMessage(tab.id, { action: 'START_PICKER' });
    } catch (err) {
      console.error('Failed to start picker from context menu:', err);
    }
  }
});

// Helper: Ensure content script is injected
async function ensureContentScriptInjected(tabId) {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (pong && pong.status === 'PONG') return true;
  } catch {
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['content/selector.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/content.js']
    });
  }
  return true;
}

// Helper: Save captured media to storage and open/focus Dashboard tab
async function saveMediaAndOpenDashboard(items, title, url, label = '捕获媒体') {
  await chrome.storage.local.set({
    'ms_latest_capture': {
      items: items,
      title: title || '未知页面',
      url: url || '',
      label: label,
      timestamp: Date.now()
    }
  });

  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
  const existingTabs = await chrome.tabs.query({ url: dashboardUrl + '*' });

  if (existingTabs.length > 0) {
    await chrome.tabs.update(existingTabs[0].id, { active: true });
    await chrome.tabs.sendMessage(existingTabs[0].id, { action: 'RELOAD_MEDIA_DATA' });
  } else {
    await chrome.tabs.create({ url: dashboardUrl });
  }
}

// Runtime messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'MEDIA_ITEM_DISCOVERED' || request.action === 'LIVE_STREAM_DISCOVERED') {
    const tabId = sender.tab?.id;
    const item = request.stream || request.item;
    if (tabId && item) {
      if (!tabStreamsMap.has(tabId)) tabStreamsMap.set(tabId, []);
      const list = tabStreamsMap.get(tabId);
      if (!list.some(s => s.url === item.url)) {
        list.push(item);
      }
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'GET_TAB_LIVE_STREAMS') {
    const tabId = request.tabId;
    const streams = (tabId && tabStreamsMap.get(tabId)) || [];
    sendResponse({ streams });
    return true;
  }

  if (request.action === 'MEDIA_CAPTURED_FROM_PICKER') {
    const tabId = sender.tab?.id;
    let items = request.mediaItems || [];
    if (tabId && tabStreamsMap.has(tabId)) {
      const netStreams = tabStreamsMap.get(tabId);
      netStreams.forEach(ns => {
        if (!items.some(i => i.url === ns.url)) items.unshift(ns);
      });
    }

    saveMediaAndOpenDashboard(
      items,
      request.sourceTitle,
      request.sourceUrl,
      request.pickerLabel
    ).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'OPEN_DASHBOARD') {
    const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
    chrome.tabs.create({ url: dashboardUrl }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'DOWNLOAD_SINGLE_FILE') {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename || 'download',
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }

  if (request.action === 'DOWNLOAD_BATCH_SEQUENTIAL') {
    const list = request.items || [];
    (async () => {
      for (const item of list) {
        try {
          await new Promise((resolve) => {
            chrome.downloads.download({
              url: item.url,
              filename: item.filename || `media_${Date.now()}`,
              saveAs: false,
              conflictAction: 'uniquify'
            }, () => {
              setTimeout(resolve, 150);
            });
          });
        } catch (e) {
          console.warn('Download item failed:', item, e);
        }
      }
    })();
    sendResponse({ success: true, count: list.length });
    return true;
  }

  return true;
});

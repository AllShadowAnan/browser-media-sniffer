/**
 * MediaSniffer Dashboard Logic
 * Advanced filtering, audio extraction & player, unified video/stream track validation, HLS live player, and table/grid views.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const navLiveCountBadge = document.getElementById('nav-live-count-badge');
  const sourceTagEl = document.getElementById('source-tag');
  const sourceUrlEl = document.getElementById('source-url');
  const btnRefreshTab = document.getElementById('btn-refresh-tab');
  const btnValidateStreams = document.getElementById('btn-validate-streams');
  const liveCheckIndicator = document.getElementById('live-check-indicator');
  const toggleHideNoVideo = document.getElementById('toggle-hide-no-video');
  const statValidCount = document.getElementById('stat-valid-count');
  const statInvalidCount = document.getElementById('stat-invalid-count');
  const hiddenStreamsTag = document.getElementById('hidden-streams-tag');
  const hiddenCountEl = document.getElementById('hidden-count');

  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const typePills = document.querySelectorAll('.type-pill');
  const typeCountAll = document.getElementById('type-count-all');
  const typeCountAudio = document.getElementById('type-count-audio');
  const typeCountLive = document.getElementById('type-count-live');
  const typeCountImage = document.getElementById('type-count-image');
  const typeCountVideo = document.getElementById('type-count-video');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const dimMinW = document.getElementById('dim-min-w');
  const dimMinH = document.getElementById('dim-min-h');
  const ratioBtns = document.querySelectorAll('.ratio-btn');
  const formatChipsContainer = document.getElementById('format-chips-container');
  const btnResetFilters = document.getElementById('btn-reset-filters');

  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  const filteredCountEl = document.getElementById('filtered-count');
  const btnInvertSelection = document.getElementById('btn-invert-selection');
  const sortSelect = document.getElementById('sort-select');
  const viewBtns = document.querySelectorAll('.view-btn');
  const cardsGrid = document.getElementById('cards-grid');
  const tableViewWrapper = document.getElementById('table-view-wrapper');
  const tableTbody = document.getElementById('table-tbody');
  const tableSelectAll = document.getElementById('table-select-all');
  const emptyState = document.getElementById('empty-state');

  // Floating batch bar
  const floatingBatchBar = document.getElementById('floating-batch-bar');
  const selectedBadge = document.getElementById('selected-badge');
  const selectedMeta = document.getElementById('selected-meta');
  const btnBatchZip = document.getElementById('btn-batch-zip');
  const btnBatchDownload = document.getElementById('btn-batch-download');
  const btnBatchCopy = document.getElementById('btn-batch-copy');
  const btnDeselectAll = document.getElementById('btn-deselect-all');

  // Export dropdown
  const btnExportMenu = document.getElementById('btn-export-menu');
  const exportTxt = document.getElementById('export-txt');
  const exportJson = document.getElementById('export-json');
  const exportCsv = document.getElementById('export-csv');
  const exportM3u = document.getElementById('export-m3u');
  const exportMd = document.getElementById('export-md');

  // Lightbox
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxBackdrop = document.getElementById('lightbox-backdrop');
  const lightboxMediaWrapper = document.getElementById('lightbox-media-wrapper');
  const lightboxIndex = document.getElementById('lightbox-index');
  const lightboxTitle = document.getElementById('lightbox-title');
  const lightboxMetaInfo = document.getElementById('lightbox-meta-info');
  const lightboxBtnPotplayer = document.getElementById('lightbox-btn-potplayer');
  const lightboxBtnDownload = document.getElementById('lightbox-btn-download');
  const lightboxBtnCopy = document.getElementById('lightbox-btn-copy');
  const lightboxBtnOpenTab = document.getElementById('lightbox-btn-open-tab');
  const lightboxBtnClose = document.getElementById('lightbox-btn-close');
  const lightboxPrev = document.getElementById('lightbox-prev');
  const lightboxNext = document.getElementById('lightbox-next');

  // State
  let rawMediaList = [];
  let currentFilteredList = [];
  let selectedUrls = new Set();
  let activeFormats = new Set();
  let currentLightboxIndex = 0;
  let currentViewMode = 'normal';
  let currentHlsInstance = null;
  let isValidatingBatch = false;

  const filters = {
    search: '',
    type: 'all',
    minWidth: 0,
    minHeight: 0,
    aspectRatio: 'all',
    sortBy: 'default',
    hideNoVideo: true
  };

  /**
   * MediaValidator: Unified video frame and stream track inspector
   */
  class MediaValidator {
    static isVideoLike(item) {
      if (!item || !item.url) return false;
      if (item.type === 'audio') return false;
      if (item.type === 'video' || item.type === 'live' || item.isLive) return true;
      const u = item.url.toLowerCase();
      return u.includes('.mp4') || u.includes('.webm') || u.includes('.m3u8') ||
             u.includes('.flv') || u.includes('.mpd') || u.includes('.m4v') || u.includes('.mov');
    }

    static async probeMedia(item, timeoutMs = 4500) {
      if (!item || !item.url) return { valid: false, reason: 'Empty URL' };

      const isHls = item.url.includes('.m3u8') || item.format === 'm3u8';

      return new Promise((resolve) => {
        let isSettled = false;
        const testVideo = document.createElement('video');
        testVideo.muted = true;
        testVideo.playsInline = true;
        testVideo.preload = 'auto';
        testVideo.style.display = 'none';
        document.body.appendChild(testVideo);

        let hlsProber = null;

        const cleanup = () => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timer);
          try {
            if (hlsProber) {
              hlsProber.destroy();
              hlsProber = null;
            }
            testVideo.pause();
            testVideo.removeAttribute('src');
            testVideo.load();
            testVideo.remove();
          } catch {}
        };

        const finish = (valid, width = 0, height = 0, reason = '') => {
          cleanup();
          const hasRealFrame = valid && width > 0;
          resolve({
            valid: hasRealFrame,
            hasVideo: hasRealFrame,
            width: width || item.width || 0,
            height: height || item.height || 0,
            reason: reason
          });
        };

        const timer = setTimeout(() => {
          if (testVideo.videoWidth > 0) {
            finish(true, testVideo.videoWidth, testVideo.videoHeight, 'Decoded on timeout');
          } else {
            finish(false, 0, 0, 'Timeout - No video frames decoded');
          }
        }, timeoutMs);

        testVideo.addEventListener('loadeddata', () => {
          if (testVideo.videoWidth > 0) {
            finish(true, testVideo.videoWidth, testVideo.videoHeight, 'Video frame decoded');
          }
        });

        testVideo.addEventListener('loadedmetadata', () => {
          if (testVideo.videoWidth > 0) {
            finish(true, testVideo.videoWidth, testVideo.videoHeight, 'Metadata loaded with video dimensions');
          }
        });

        testVideo.addEventListener('timeupdate', () => {
          if (testVideo.videoWidth > 0) {
            finish(true, testVideo.videoWidth, testVideo.videoHeight, 'Stream active');
          }
        });

        testVideo.addEventListener('error', () => {
          finish(false, 0, 0, 'Media decode error or 404/403');
        });

        if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
          try {
            hlsProber = new Hls({
              enableWorker: false,
              maxBufferLength: 1,
              maxMaxBufferLength: 2,
              manifestLoadingTimeOut: 3500,
              levelLoadingTimeOut: 3500
            });

            hlsProber.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
              if (!data.levels || data.levels.length === 0) {
                finish(false, 0, 0, 'Manifest has no levels');
                return;
              }
              const firstLevel = data.levels[0];
              const w = firstLevel.width || 0;
              const h = firstLevel.height || 0;
              if (w > 0) {
                finish(true, w, h, 'Parsed HLS stream level resolution');
              }
            });

            hlsProber.on(Hls.Events.ERROR, (event, data) => {
              if (data.fatal) {
                finish(false, 0, 0, `HLS fatal error: ${data.details}`);
              }
            });

            hlsProber.loadSource(item.url);
            hlsProber.attachMedia(testVideo);
          } catch (err) {
            finish(false, 0, 0, err.message);
          }
        } else {
          try {
            testVideo.src = item.url;
            testVideo.load();
          } catch (err) {
            finish(false, 0, 0, err.message);
          }
        }
      });
    }

    static async runBatchValidation(mediaItems, onProgress) {
      const videoItems = mediaItems.filter(m => MediaValidator.isVideoLike(m));
      if (videoItems.length === 0) return;

      const concurrency = 4;
      let currentIndex = 0;

      async function worker() {
        while (currentIndex < videoItems.length) {
          const idx = currentIndex++;
          const item = videoItems[idx];
          item.validationStatus = 'testing';
          onProgress && onProgress(item);

          try {
            const res = await MediaValidator.probeMedia(item);
            item.validationStatus = res.valid ? 'valid' : 'invalid';
            item.hasVideo = res.valid;
            if (res.width > 0) item.width = res.width;
            if (res.height > 0) item.height = res.height;
            item.validationReason = res.reason;
          } catch (e) {
            item.validationStatus = 'invalid';
            item.hasVideo = false;
          }

          onProgress && onProgress(item);
        }
      }

      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);
    }
  }

  // 1. Initial Load
  await loadCapturedData();

  async function loadCapturedData() {
    try {
      const data = await chrome.storage.local.get('ms_latest_capture');
      const capture = data.ms_latest_capture;
      if (capture && capture.items) {
        rawMediaList = capture.items.map((item, index) => {
          const isVid = MediaValidator.isVideoLike(item);
          return {
            ...item,
            id: `media_${index}_${Date.now()}`,
            originalIndex: index,
            validationStatus: item.validationStatus || (isVid ? 'untested' : 'valid'),
            hasVideo: item.hasVideo !== undefined ? item.hasVideo : true
          };
        });

        sourceTagEl.textContent = capture.label || '页面抓取';
        sourceUrlEl.textContent = capture.title || capture.url || '未知页面';
        sourceUrlEl.href = capture.url || '#';

        initFormatChips();
        updateFilterCounts();
        applyFiltersAndRender();

        startVideoValidationBackground();
      } else {
        showToast('暂无抓取数据，请在网页中使用插件抓取');
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Background Validator Runner
  async function startVideoValidationBackground() {
    const unverifiedVideos = rawMediaList.filter(m => MediaValidator.isVideoLike(m) && m.validationStatus === 'untested');
    if (unverifiedVideos.length === 0) return;

    isValidatingBatch = true;
    liveCheckIndicator.classList.add('checking');
    btnValidateStreams.classList.add('active');

    await MediaValidator.runBatchValidation(rawMediaList, () => {
      updateFilterCounts();
      applyFiltersAndRender(false);
    });

    isValidatingBatch = false;
    liveCheckIndicator.classList.remove('checking');
    btnValidateStreams.classList.remove('active');
    updateFilterCounts();
    applyFiltersAndRender(true);
    showToast(`✅ 所有视频与直播流画面检测完成！`);
  }

  // Manual Trigger Full Validation
  btnValidateStreams.addEventListener('click', () => {
    rawMediaList.forEach(m => {
      if (MediaValidator.isVideoLike(m)) {
        m.validationStatus = 'untested';
      }
    });
    showToast('⚡ 正在逐一探测全部视频与直播流画面...');
    startVideoValidationBackground();
  });

  // Toggle Hide No-Video media
  toggleHideNoVideo.addEventListener('change', (e) => {
    filters.hideNoVideo = e.target.checked;
    applyFiltersAndRender();
    if (filters.hideNoVideo) {
      showToast('已开启：自动隐藏无画面的视频与直播');
    } else {
      showToast('已关闭：显示所有嗅探到的视频与直播（包括无画面项）');
    }
  });

  // Reload listener
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'RELOAD_MEDIA_DATA') {
      loadCapturedData();
    }
  });

  // Re-sniff Active Tab
  btnRefreshTab.addEventListener('click', async () => {
    showToast('🔄 正在重新深度扫描网页与嗅探资源...');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      let targetTab = tabs[0];
      if (targetTab.url.includes('dashboard/dashboard.html')) {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        targetTab = allTabs.find(t => !t.url.includes('dashboard/dashboard.html') && !t.url.startsWith('chrome://'));
      }

      if (!targetTab) {
        showToast('未找到可嗅探的目标网页');
        return;
      }

      const res = await chrome.tabs.sendMessage(targetTab.id, { action: 'SCAN_FULL_PAGE' });
      let items = (res && res.items) || [];

      try {
        const netRes = await chrome.runtime.sendMessage({ action: 'GET_TAB_LIVE_STREAMS', tabId: targetTab.id });
        if (netRes && netRes.streams) {
          netRes.streams.forEach(ns => {
            if (!items.some(i => i.url === ns.url)) items.unshift(ns);
          });
        }
      } catch {}

      if (items.length > 0) {
        await chrome.storage.local.set({
          'ms_latest_capture': {
            items: items,
            title: res?.title || targetTab.title,
            url: res?.url || targetTab.url,
            label: '重新扫描',
            timestamp: Date.now()
          }
        });
        await loadCapturedData();
        showToast(`✨ 嗅探完成！发现 ${items.length} 个媒体/音频/直播流`);
      }
    } catch (e) {
      showToast('嗅探失败，请确保目标网页已打开且允许扩展运行');
    }
  });

  // Format Chips
  function initFormatChips() {
    const formats = new Map();
    rawMediaList.forEach(m => {
      const fmt = (m.format || 'other').toLowerCase();
      formats.set(fmt, (formats.get(fmt) || 0) + 1);
    });

    formatChipsContainer.innerHTML = '';
    formats.forEach((count, fmt) => {
      const chip = document.createElement('button');
      chip.className = 'format-chip';
      chip.textContent = `${fmt.toUpperCase()} (${count})`;
      chip.dataset.format = fmt;

      chip.addEventListener('click', () => {
        if (activeFormats.has(fmt)) {
          activeFormats.delete(fmt);
          chip.classList.remove('active');
        } else {
          activeFormats.add(fmt);
          chip.classList.add('active');
        }
        applyFiltersAndRender();
      });

      formatChipsContainer.appendChild(chip);
    });
  }

  // Update Counts & Health Stats
  function updateFilterCounts() {
    const total = rawMediaList.length;
    const allVideosAndStreams = rawMediaList.filter(m => MediaValidator.isVideoLike(m));
    const validCount = allVideosAndStreams.filter(m => m.validationStatus === 'valid').length;
    const invalidCount = allVideosAndStreams.filter(m => m.validationStatus === 'invalid').length;

    const audioCount = rawMediaList.filter(m => m.type === 'audio').length;
    const liveCount = rawMediaList.filter(m => m.type === 'live' || m.isLive).length;
    const imgCount = rawMediaList.filter(m => m.type === 'image').length;
    const vidCount = rawMediaList.filter(m => m.type === 'video').length;

    typeCountAll.textContent = total;
    if (typeCountAudio) typeCountAudio.textContent = audioCount;
    typeCountLive.textContent = liveCount;
    typeCountImage.textContent = imgCount;
    typeCountVideo.textContent = vidCount;

    statValidCount.textContent = validCount;
    statInvalidCount.textContent = invalidCount;

    const validLives = rawMediaList.filter(m => (m.type === 'live' || m.isLive) && m.validationStatus === 'valid');
    if (validLives.length > 0) {
      navLiveCountBadge.style.display = 'inline-block';
      navLiveCountBadge.textContent = `${validLives.length} LIVE`;
    } else if (liveCount > 0) {
      navLiveCountBadge.style.display = 'inline-block';
      navLiveCountBadge.textContent = `${liveCount} 流`;
    } else {
      navLiveCountBadge.style.display = 'none';
    }
  }

  // Filter & Sort Logic with Dead/No-Video Media Filtering
  function applyFiltersAndRender(updateCheckboxes = true) {
    let result = [...rawMediaList];

    // Filter dead / no-video media if hideNoVideo enabled
    let hiddenCount = 0;
    if (filters.hideNoVideo) {
      const beforeCount = result.length;
      result = result.filter(m => {
        if (MediaValidator.isVideoLike(m)) {
          return m.validationStatus !== 'invalid' && m.hasVideo !== false;
        }
        return true;
      });
      hiddenCount = beforeCount - result.length;
    }

    if (hiddenCount > 0) {
      hiddenStreamsTag.style.display = 'inline-flex';
      hiddenCountEl.textContent = hiddenCount;
    } else {
      hiddenStreamsTag.style.display = 'none';
    }

    // Type Filter
    if (filters.type === 'live') {
      result = result.filter(m => m.type === 'live' || m.isLive);
    } else if (filters.type !== 'all') {
      result = result.filter(m => m.type === filters.type);
    }

    // Search Filter
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      result = result.filter(m =>
        (m.filename && m.filename.toLowerCase().includes(q)) ||
        (m.title && m.title.toLowerCase().includes(q)) ||
        (m.format && m.format.toLowerCase().includes(q)) ||
        (m.url && m.url.toLowerCase().includes(q))
      );
    }

    // Dimension Filters (applies to visual image/video)
    if (filters.minWidth > 0) {
      result = result.filter(m => m.type === 'audio' || (m.width || 0) >= filters.minWidth);
    }
    if (filters.minHeight > 0) {
      result = result.filter(m => m.type === 'audio' || (m.height || 0) >= filters.minHeight);
    }

    // Aspect Ratio
    if (filters.aspectRatio === 'landscape') {
      result = result.filter(m => (m.width || 0) > (m.height || 0));
    } else if (filters.aspectRatio === 'portrait') {
      result = result.filter(m => (m.height || 0) > (m.width || 0));
    } else if (filters.aspectRatio === 'square') {
      result = result.filter(m => (m.width || 0) > 0 && m.width === m.height);
    }

    // Format Chips
    if (activeFormats.size > 0) {
      result = result.filter(m => activeFormats.has((m.format || '').toLowerCase()));
    }

    // Sorting
    if (filters.sortBy === 'size-desc') {
      result.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
    } else if (filters.sortBy === 'size-asc') {
      result.sort((a, b) => ((a.width || 0) * (a.height || 0)) - ((b.width || 0) * (b.height || 0)));
    } else if (filters.sortBy === 'name-asc') {
      result.sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));
    } else if (filters.sortBy === 'name-desc') {
      result.sort((a, b) => (b.filename || '').localeCompare(a.filename || ''));
    } else {
      result.sort((a, b) => a.originalIndex - b.originalIndex);
    }

    currentFilteredList = result;
    filteredCountEl.textContent = result.length;

    if (currentViewMode === 'table') {
      renderTable();
    } else {
      renderCards();
    }

    updateBatchBar();
    if (updateCheckboxes) updateSelectAllCheckbox();
  }

  // Render Cards View
  function renderCards() {
    cardsGrid.innerHTML = '';
    cardsGrid.style.display = currentFilteredList.length === 0 ? 'none' : 'grid';
    tableViewWrapper.style.display = 'none';

    if (currentFilteredList.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }
    emptyState.style.display = 'none';

    currentFilteredList.forEach((item, index) => {
      const card = document.createElement('div');
      const isSelected = selectedUrls.has(item.url);
      const isLive = item.type === 'live' || item.isLive;
      const isAudio = item.type === 'audio';
      const isVideoLike = MediaValidator.isVideoLike(item);

      card.className = `media-card ${isLive ? 'is-live' : ''} ${isSelected ? 'selected' : ''}`;
      card.dataset.url = item.url;

      const dimsText = isAudio ? '音频媒体' : ((item.width && item.height) ? `${item.width} × ${item.height}` : (isLive ? '高清流' : '自适应'));

      let statusBadgeHtml = '';
      if (isVideoLike) {
        if (item.validationStatus === 'valid') {
          statusBadgeHtml = `<span class="card-stream-status status-valid">🟢 有画面 ${item.height ? item.height + 'P' : ''}</span>`;
        } else if (item.validationStatus === 'testing') {
          statusBadgeHtml = `<span class="card-stream-status status-testing">🟡 检测中...</span>`;
        } else if (item.validationStatus === 'invalid') {
          statusBadgeHtml = `<span class="card-stream-status status-invalid">🔴 无画面</span>`;
        }
      }

      let mediaContentHtml = '';
      if (isAudio) {
        mediaContentHtml = `
          <div class="card-audio-backdrop">
            <div class="audio-wave-bars">
              <div class="audio-bar"></div>
              <div class="audio-bar"></div>
              <div class="audio-bar"></div>
              <div class="audio-bar"></div>
              <div class="audio-bar"></div>
            </div>
            <span style="font-size:11px;font-weight:600;color:#6ee7b7;">AUDIO TRACK</span>
          </div>
          <span class="audio-badge-top">🎵 音频</span>
        `;
      } else if (isLive) {
        mediaContentHtml = `
          <div class="card-live-backdrop">
            <span class="live-icon-radar">📡</span>
            <span style="font-size:11px;font-weight:600;color:#fca5a5;">LIVE STREAM</span>
          </div>
          ${statusBadgeHtml}
        `;
      } else if (item.type === 'video') {
        mediaContentHtml = `
          <video src="${item.url}" preload="metadata" muted playsinline></video>
          ${statusBadgeHtml}
        `;
      } else {
        mediaContentHtml = `<img src="${item.url}" loading="lazy" onerror="this.src='../icons/icon128.png'">`;
      }

      card.innerHTML = `
        <div class="card-media-box">
          <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''}>
          <span class="card-badge-format">${item.format || item.type}</span>
          <span class="card-badge-dim">${dimsText}</span>
          ${mediaContentHtml}
          <div class="card-hover-overlay">
            <button class="overlay-btn ${isAudio ? 'overlay-btn-audio' : (isLive ? 'overlay-btn-live' : 'overlay-btn-preview')}" title="${isAudio ? '播放音频' : (isLive ? '播放直播' : '查看大图/播放')}">
              ${isAudio ? '▶️' : (isLive ? '▶️' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>')}
            </button>
            <button class="overlay-btn overlay-btn-download" title="${isLive ? '复制流地址' : '直接下载'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </button>
            <button class="overlay-btn overlay-btn-copy" title="复制链接">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
        <div class="card-meta-box">
          <div class="card-filename" title="${item.filename}">${item.filename}</div>
          <div class="card-subtext">
            <span>${item.sourceElement || '媒体'}</span>
            <span>${isAudio ? '🎵 音频' : (isLive ? '🔴 直播流' : (item.type === 'video' ? '🎬 视频' : '🖼️ 图片'))}</span>
          </div>
        </div>
      `;

      const checkbox = card.querySelector('.card-checkbox');
      const btnPreview = card.querySelector('.overlay-btn-preview') || card.querySelector('.overlay-btn-live') || card.querySelector('.overlay-btn-audio');
      const btnDownload = card.querySelector('.overlay-btn-download');
      const btnCopy = card.querySelector('.overlay-btn-copy');

      card.addEventListener('click', (e) => {
        if (e.target === checkbox || e.target.closest('.overlay-btn')) return;
        toggleSelect(item.url, card, checkbox);
      });

      checkbox.addEventListener('change', () => {
        toggleSelect(item.url, card, checkbox, checkbox.checked);
      });

      btnPreview.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(index);
      });

      btnDownload.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isLive) {
          copyTextToClipboard(item.url);
          showToast('已复制直播流地址！');
        } else {
          downloadSingle(item);
        }
      });

      btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        copyTextToClipboard(item.url);
        showToast('已复制媒体链接');
      });

      cardsGrid.appendChild(card);
    });
  }

  // Render Table View
  function renderTable() {
    cardsGrid.style.display = 'none';
    tableTbody.innerHTML = '';

    if (currentFilteredList.length === 0) {
      tableViewWrapper.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';
    tableViewWrapper.style.display = 'block';

    currentFilteredList.forEach((item, index) => {
      const isSelected = selectedUrls.has(item.url);
      const isLive = item.type === 'live' || item.isLive;
      const isAudio = item.type === 'audio';
      const isVideoLike = MediaValidator.isVideoLike(item);
      const tr = document.createElement('tr');
      if (isSelected) tr.classList.add('selected');

      const dimsText = isAudio ? '音频格式' : ((item.width && item.height) ? `${item.width} × ${item.height}` : (isLive ? '高清流' : '自适应'));

      let statusHtml = '<span style="color:#94a3b8;">正常</span>';
      if (isVideoLike) {
        if (item.validationStatus === 'valid') {
          statusHtml = '<span style="color:#34d399;font-weight:700;">🟢 有画面</span>';
        } else if (item.validationStatus === 'testing') {
          statusHtml = '<span style="color:#f59e0b;font-weight:700;">🟡 检测中</span>';
        } else if (item.validationStatus === 'invalid') {
          statusHtml = '<span style="color:#ef4444;font-weight:700;">🔴 无画面</span>';
        }
      } else if (isAudio) {
        statusHtml = '<span style="color:#34d399;font-weight:600;">🎵 可播放</span>';
      }

      let thumbHtml = '';
      if (isAudio) {
        thumbHtml = `<div class="table-thumb" style="display:flex;align-items:center;justify-content:center;background:#064e3b;color:#34d399;font-size:20px;">🎵</div>`;
      } else if (isLive) {
        thumbHtml = `<div class="table-thumb" style="display:flex;align-items:center;justify-content:center;background:#312e81;color:#ef4444;font-size:18px;">📡</div>`;
      } else if (item.type === 'video') {
        thumbHtml = `<video src="${item.url}" class="table-thumb" preload="metadata" muted></video>`;
      } else {
        thumbHtml = `<img src="${item.url}" class="table-thumb" loading="lazy" onerror="this.src='../icons/icon48.png'">`;
      }

      tr.innerHTML = `
        <td><input type="checkbox" class="table-row-checkbox" ${isSelected ? 'checked' : ''}></td>
        <td>${thumbHtml}</td>
        <td><strong style="color:#fff;">${item.filename}</strong><div style="font-size:11px;color:#94a3b8;">${item.title || ''}</div></td>
        <td>${isAudio ? '<span style="color:#34d399;font-weight:700;">🎵 音频</span>' : (isLive ? '<span style="color:#ef4444;font-weight:700;">🔴 直播</span>' : (item.type === 'video' ? '🎬 视频' : '🖼️ 图片'))}</td>
        <td>${statusHtml}</td>
        <td><span class="source-badge">${item.format || 'other'}</span></td>
        <td>${dimsText}</td>
        <td><div class="table-url-text" title="${item.url}">${item.url}</div></td>
        <td>
          <div class="table-action-btns">
            <button class="table-btn btn-table-play">${isAudio ? '播放' : (isLive ? '播放' : '查看')}</button>
            <button class="table-btn btn-table-copy">复制</button>
            ${isVideoLike ? '<button class="table-btn btn-table-recheck" title="单项重新检测画面">测</button>' : ''}
          </div>
        </td>
      `;

      const rowCheckbox = tr.querySelector('.table-row-checkbox');
      const btnPlay = tr.querySelector('.btn-table-play');
      const btnCopy = tr.querySelector('.btn-table-copy');
      const btnRecheck = tr.querySelector('.btn-table-recheck');

      tr.addEventListener('click', (e) => {
        if (e.target === rowCheckbox || e.target.closest('.table-btn')) return;
        toggleSelect(item.url, null, rowCheckbox);
        tr.classList.toggle('selected', selectedUrls.has(item.url));
      });

      rowCheckbox.addEventListener('change', () => {
        toggleSelect(item.url, null, rowCheckbox, rowCheckbox.checked);
        tr.classList.toggle('selected', rowCheckbox.checked);
      });

      btnPlay.addEventListener('click', () => openLightbox(index));
      btnCopy.addEventListener('click', () => {
        copyTextToClipboard(item.url);
        showToast('已复制链接');
      });

      if (btnRecheck) {
        btnRecheck.addEventListener('click', async () => {
          showToast('正在探测该视频/直播流画面...');
          item.validationStatus = 'testing';
          applyFiltersAndRender(false);
          const res = await MediaValidator.probeMedia(item);
          item.validationStatus = res.valid ? 'valid' : 'invalid';
          item.hasVideo = res.valid;
          if (res.width > 0) { item.width = res.width; item.height = res.height; }
          updateFilterCounts();
          applyFiltersAndRender(true);
          showToast(res.valid ? `🟢 画面正常 (${item.width}×${item.height})` : '🔴 无画面或媒体已失效');
        });
      }

      tableTbody.appendChild(tr);
    });
  }

  // Selection Handlers
  function toggleSelect(url, card, checkbox, explicitState) {
    const isChecked = explicitState !== undefined ? explicitState : !selectedUrls.has(url);
    if (isChecked) {
      selectedUrls.add(url);
      card?.classList.add('selected');
      if (checkbox) checkbox.checked = true;
    } else {
      selectedUrls.delete(url);
      card?.classList.remove('selected');
      if (checkbox) checkbox.checked = false;
    }
    updateBatchBar();
    updateSelectAllCheckbox();
  }

  function updateSelectAllCheckbox() {
    if (currentFilteredList.length === 0) {
      selectAllCheckbox.checked = false;
      tableSelectAll.checked = false;
      return;
    }
    const allSelected = currentFilteredList.every(m => selectedUrls.has(m.url));
    selectAllCheckbox.checked = allSelected;
    tableSelectAll.checked = allSelected;
  }

  function updateBatchBar() {
    const count = selectedUrls.size;
    if (count > 0) {
      floatingBatchBar.classList.add('show');
      selectedBadge.textContent = `已选择 ${count} 项`;

      const selectedItems = rawMediaList.filter(m => selectedUrls.has(m.url));
      const audios = selectedItems.filter(m => m.type === 'audio').length;
      const lives = selectedItems.filter(m => m.type === 'live' || m.isLive).length;
      const imgs = selectedItems.filter(m => m.type === 'image').length;
      const vids = selectedItems.filter(m => m.type === 'video').length;

      const desc = [];
      if (audios > 0) desc.push(`${audios} 首音频`);
      if (lives > 0) desc.push(`${lives} 个直播流`);
      if (vids > 0) desc.push(`${vids} 个视频`);
      if (imgs > 0) desc.push(`${imgs} 张图片`);

      selectedMeta.textContent = `包含 ${desc.join('，')}`;
    } else {
      floatingBatchBar.classList.remove('show');
    }
  }

  selectAllCheckbox.addEventListener('change', () => {
    const check = selectAllCheckbox.checked;
    currentFilteredList.forEach(m => {
      if (check) selectedUrls.add(m.url);
      else selectedUrls.delete(m.url);
    });
    if (currentViewMode === 'table') renderTable();
    else renderCards();
    updateBatchBar();
  });

  tableSelectAll.addEventListener('change', () => {
    const check = tableSelectAll.checked;
    currentFilteredList.forEach(m => {
      if (check) selectedUrls.add(m.url);
      else selectedUrls.delete(m.url);
    });
    renderTable();
    updateBatchBar();
    updateSelectAllCheckbox();
  });

  btnInvertSelection.addEventListener('click', () => {
    currentFilteredList.forEach(m => {
      if (selectedUrls.has(m.url)) selectedUrls.delete(m.url);
      else selectedUrls.add(m.url);
    });
    if (currentViewMode === 'table') renderTable();
    else renderCards();
    updateBatchBar();
    updateSelectAllCheckbox();
  });

  btnDeselectAll.addEventListener('click', () => {
    selectedUrls.clear();
    if (currentViewMode === 'table') renderTable();
    else renderCards();
    updateBatchBar();
    updateSelectAllCheckbox();
  });

  // Search & Filter Events
  searchInput.addEventListener('input', (e) => {
    filters.search = e.target.value;
    searchClear.style.display = filters.search ? 'block' : 'none';
    applyFiltersAndRender();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    filters.search = '';
    searchClear.style.display = 'none';
    applyFiltersAndRender();
  });

  typePills.forEach(pill => {
    pill.addEventListener('click', () => {
      typePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      filters.type = pill.dataset.type;
      applyFiltersAndRender();
    });
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const minW = parseInt(btn.dataset.minW) || 0;
      filters.minWidth = minW;
      dimMinW.value = minW > 0 ? minW : '';
      applyFiltersAndRender();
    });
  });

  dimMinW.addEventListener('input', (e) => {
    presetBtns.forEach(b => b.classList.remove('active'));
    filters.minWidth = parseInt(e.target.value) || 0;
    applyFiltersAndRender();
  });

  dimMinH.addEventListener('input', (e) => {
    filters.minHeight = parseInt(e.target.value) || 0;
    applyFiltersAndRender();
  });

  ratioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      ratioBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters.aspectRatio = btn.dataset.ratio;
      applyFiltersAndRender();
    });
  });

  sortSelect.addEventListener('change', (e) => {
    filters.sortBy = e.target.value;
    applyFiltersAndRender();
  });

  btnResetFilters.addEventListener('click', () => {
    filters.search = '';
    filters.type = 'all';
    filters.minWidth = 0;
    filters.minHeight = 0;
    filters.aspectRatio = 'all';
    filters.sortBy = 'default';
    filters.hideNoVideo = true;

    searchInput.value = '';
    dimMinW.value = '';
    dimMinH.value = '';
    searchClear.style.display = 'none';
    sortSelect.value = 'default';
    toggleHideNoVideo.checked = true;

    typePills.forEach(p => p.classList.toggle('active', p.dataset.type === 'all'));
    presetBtns.forEach(b => b.classList.toggle('active', b.dataset.minW === '0'));
    ratioBtns.forEach(b => b.classList.toggle('active', b.dataset.ratio === 'all'));

    activeFormats.clear();
    document.querySelectorAll('.format-chip').forEach(c => c.classList.remove('active'));

    applyFiltersAndRender();
    showToast('已重置所有筛选条件');
  });

  // View switch
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentViewMode = btn.dataset.view;

      if (currentViewMode === 'table') {
        renderTable();
      } else {
        cardsGrid.className = `cards-grid ${currentViewMode}`;
        renderCards();
      }
    });
  });

  // Downloads & Exports
  function downloadSingle(item) {
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_SINGLE_FILE',
      url: item.url,
      filename: item.filename
    }, (res) => {
      if (res && res.success) showToast(`已开始下载：${item.filename}`);
      else showToast(`下载失败：${res?.error || '未知原因'}`);
    });
  }

  btnBatchDownload.addEventListener('click', () => {
    const list = rawMediaList.filter(m => selectedUrls.has(m.url));
    if (list.length === 0) return;
    showToast(`🚀 正在发送 ${list.length} 个下载任务...`);
    chrome.runtime.sendMessage({ action: 'DOWNLOAD_BATCH_SEQUENTIAL', items: list });
  });

  btnBatchZip.addEventListener('click', async () => {
    const list = rawMediaList.filter(m => selectedUrls.has(m.url));
    if (list.length === 0) return;
    if (typeof JSZip === 'undefined') {
      showToast('⚠️ JSZip 库未载入，请使用直接批量下载');
      return;
    }

    const zip = new JSZip();
    showToast(`📦 开始打包 ${list.length} 个媒体文件...`);

    let successCount = 0;
    const nameMap = new Map();

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      try {
        let blob = null;
        if (item.url.startsWith('data:')) {
          const res = await fetch(item.url);
          blob = await res.blob();
        } else {
          const res = await fetch(item.url, { mode: 'cors' });
          if (!res.ok) throw new Error('Fetch status ' + res.status);
          blob = await res.blob();
        }

        let fname = item.filename || `media_${i + 1}.jpg`;
        if (nameMap.has(fname)) {
          const c = nameMap.get(fname) + 1;
          nameMap.set(fname, c);
          const parts = fname.split('.');
          const ext = parts.pop();
          fname = `${parts.join('.')}_(${c}).${ext}`;
        } else {
          nameMap.set(fname, 0);
        }

        zip.file(fname, blob);
        successCount++;
      } catch (err) {
        console.warn('Zip fetch item skipped:', item.url);
      }
    }

    if (successCount === 0) {
      showToast('❌ 打包失败：由于网站跨域限制，请使用【直接批量下载】');
      return;
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    const timeStr = new Date().toISOString().slice(0, 10);
    const zipName = `MediaSniffer_Archive_${timeStr}.zip`;

    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = zipName;
    a.click();
    URL.revokeObjectURL(zipUrl);
    showToast(`🎉 打包完成！成功下载 ${zipName}`);
  });

  btnBatchCopy.addEventListener('click', () => {
    const urls = Array.from(selectedUrls);
    if (urls.length === 0) return;
    copyTextToClipboard(urls.join('\n'));
    showToast(`📋 已复制 ${urls.length} 个链接到剪贴板`);
  });

  // Dropdown Menu
  btnExportMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('.dropdown').classList.toggle('open');
  });

  window.addEventListener('click', () => {
    document.querySelector('.dropdown')?.classList.remove('open');
  });

  exportTxt.addEventListener('click', () => {
    const list = getExportList();
    downloadBlobFile(list.map(m => m.url).join('\n'), 'media_links.txt', 'text/plain');
  });

  exportJson.addEventListener('click', () => {
    const list = getExportList();
    downloadBlobFile(JSON.stringify(list, null, 2), 'media_data.json', 'application/json');
  });

  exportCsv.addEventListener('click', () => {
    const list = getExportList();
    const headers = ['Filename', 'Type', 'Status', 'Format', 'Width', 'Height', 'URL', 'SourceElement'];
    const rows = list.map(m => [
      `"${(m.filename || '').replace(/"/g, '""')}"`,
      `"${m.type || ''}"`,
      `"${m.validationStatus || 'valid'}"`,
      `"${m.format || ''}"`,
      m.width || 0,
      m.height || 0,
      `"${m.url || ''}"`,
      `"${m.sourceElement || ''}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadBlobFile(csvContent, 'media_list.csv', 'text/csv;charset=utf-8;');
  });

  exportM3u.addEventListener('click', () => {
    const list = getExportList().filter(m => m.type === 'audio' || m.type === 'live' || m.isLive || m.type === 'video' || m.url.includes('.m3u8'));
    let m3uContent = '#EXTM3U\n';
    list.forEach(m => {
      m3uContent += `#EXTINF:-1,${m.filename || m.title || 'Media Playback'}\n${m.url}\n`;
    });
    downloadBlobFile(m3uContent, 'playlist.m3u', 'audio/x-mpegurl');
  });

  exportMd.addEventListener('click', () => {
    const list = getExportList();
    const md = list.map(m => `![${m.filename}](${m.url})`).join('\n\n');
    downloadBlobFile(md, 'media_markdown.md', 'text/markdown');
  });

  function getExportList() {
    if (selectedUrls.size > 0) return rawMediaList.filter(m => selectedUrls.has(m.url));
    return currentFilteredList;
  }

  function downloadBlobFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${filename}`);
  }

  // Lightbox Modal
  function openLightbox(index) {
    currentLightboxIndex = index;
    updateLightbox();
    lightboxModal.style.display = 'flex';
  }

  function closeLightbox() {
    lightboxModal.style.display = 'none';
    if (currentHlsInstance) {
      currentHlsInstance.destroy();
      currentHlsInstance = null;
    }
    lightboxMediaWrapper.innerHTML = '';
  }

  function updateLightbox() {
    const item = currentFilteredList[currentLightboxIndex];
    if (!item) return;

    if (currentHlsInstance) {
      currentHlsInstance.destroy();
      currentHlsInstance = null;
    }

    const isLive = item.type === 'live' || item.isLive;
    const isAudio = item.type === 'audio';

    lightboxIndex.textContent = `${currentLightboxIndex + 1} / ${currentFilteredList.length}`;
    lightboxTitle.textContent = item.filename || '未命名媒体';
    const dims = isAudio ? '音频' : ((item.width && item.height) ? `${item.width} × ${item.height}` : (isLive ? '高清直播流' : '自适应尺寸'));
    lightboxMetaInfo.textContent = `${dims} • ${(item.format || item.type).toUpperCase()} • 来源: ${item.sourceElement || '网络'}`;

    if (isLive || item.url.includes('.m3u8') || item.url.includes('.flv')) {
      lightboxBtnPotplayer.style.display = 'flex';
      lightboxBtnPotplayer.onclick = () => {
        window.location.href = `potplayer://${item.url}`;
      };
    } else {
      lightboxBtnPotplayer.style.display = 'none';
    }

    lightboxMediaWrapper.innerHTML = '';

    if (isAudio) {
      const audioContainer = document.createElement('div');
      audioContainer.style.display = 'flex';
      audioContainer.style.flexDirection = 'column';
      audioContainer.style.alignItems = 'center';
      audioContainer.style.gap = '20px';
      audioContainer.style.padding = '30px';
      audioContainer.style.background = '#064e3b';
      audioContainer.style.borderRadius = '16px';

      audioContainer.innerHTML = `
        <div style="font-size:64px;">🎵</div>
        <div style="font-size:16px;font-weight:600;color:#fff;">${item.filename}</div>
        <audio src="${item.url}" controls autoplay style="width:360px;outline:none;"></audio>
      `;
      lightboxMediaWrapper.appendChild(audioContainer);
    } else if (isLive || item.url.includes('.m3u8') || item.type === 'video') {
      const vid = document.createElement('video');
      vid.controls = true;
      vid.autoplay = true;

      if (item.url.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(item.url);
        hls.attachMedia(vid);
        currentHlsInstance = hls;
      } else {
        vid.src = item.url;
      }

      lightboxMediaWrapper.appendChild(vid);
    } else {
      const img = document.createElement('img');
      img.src = item.url;
      lightboxMediaWrapper.appendChild(img);
    }
  }

  lightboxPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    currentLightboxIndex = currentLightboxIndex > 0 ? currentLightboxIndex - 1 : currentFilteredList.length - 1;
    updateLightbox();
  });

  lightboxNext.addEventListener('click', (e) => {
    e.stopPropagation();
    currentLightboxIndex = currentLightboxIndex < currentFilteredList.length - 1 ? currentLightboxIndex + 1 : 0;
    updateLightbox();
  });

  lightboxBtnClose.addEventListener('click', closeLightbox);
  lightboxBackdrop.addEventListener('click', closeLightbox);

  lightboxBtnDownload.addEventListener('click', () => {
    const item = currentFilteredList[currentLightboxIndex];
    if (item) {
      if (item.type === 'live' || item.isLive) {
        copyTextToClipboard(item.url);
        showToast('已复制直播流地址');
      } else {
        downloadSingle(item);
      }
    }
  });

  lightboxBtnCopy.addEventListener('click', () => {
    const item = currentFilteredList[currentLightboxIndex];
    if (item) {
      copyTextToClipboard(item.url);
      showToast('已复制媒体链接');
    }
  });

  lightboxBtnOpenTab.addEventListener('click', () => {
    const item = currentFilteredList[currentLightboxIndex];
    if (item) window.open(item.url, '_blank');
  });

  window.addEventListener('keydown', (e) => {
    if (lightboxModal.style.display === 'flex') {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') lightboxPrev.click();
      else if (e.key === 'ArrowRight') lightboxNext.click();
    }
  });

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  let toastTimer = null;
  function showToast(msg, duration = 3000) {
    const toast = document.getElementById('dash-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, duration);
  }
});

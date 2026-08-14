/**
 * MediaSniffer Content Script
 * Handles deep media extraction, live stream & audio sniffing, and interactive mouse selection.
 */

(function () {
  if (window.__MEDIA_SNIFFER_INITIALIZED__) return;
  window.__MEDIA_SNIFFER_INITIALIZED__ = true;

  // Global state
  let isPicking = false;
  let hoveredElement = null;
  let hierarchyStack = [];
  let hierarchyIndex = 0;
  let overlayEl = null;
  let badgeEl = null;
  let floatingBarEl = null;

  // Live Streams & Audio Cache
  const capturedLiveStreams = new Map(); // key: url -> item

  // Media formats regex
  const IMAGE_EXT_REGEX = /\.(jpg|jpeg|png|webp|gif|svg|bmp|ico|avif|heic|tif|tiff)(\?.*)?$/i;
  const VIDEO_EXT_REGEX = /\.(mp4|webm|m4v|mov|mkv|flv|avi|ogv|ts)(\?.*)?$/i;
  const LIVE_STREAM_REGEX = /(\.m3u8|\.flv|\.mpd|\/hls\/|\/live\/|\/flv\/|live=true|playlist\.m3u8)/i;
  const AUDIO_EXT_REGEX = /\.(mp3|wav|ogg|aac|m4a|flac|opus|wma|aiff|mid|midi)(\?.*)?$/i;

  // Inject in-page hook script for deep network stream & audio sniffing
  function injectHookScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/injected.js');
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('MediaSniffer hook injection failed:', e);
    }
  }
  injectHookScript();

  // Listen for media / live streams / audios captured by injected script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === 'MS_LIVE_STREAM_CAPTURED') {
      const stream = event.data.stream;
      if (stream && stream.url && !capturedLiveStreams.has(stream.url)) {
        capturedLiveStreams.set(stream.url, stream);
        chrome.runtime.sendMessage({
          action: 'MEDIA_ITEM_DISCOVERED',
          item: stream
        }).catch(() => {});
      }
    }
  });

  /**
   * Helper: Resolve relative URL to absolute URL
   */
  function toAbsoluteUrl(url) {
    if (!url) return '';
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return url;
    }
  }

  /**
   * Helper: Extract filename from URL
   */
  function getFilenameFromUrl(url, defaultExt = 'jpg') {
    if (!url) return `media_${Date.now()}.${defaultExt}`;
    if (url.startsWith('data:image/')) {
      const mime = url.substring(5, url.indexOf(';'));
      const ext = mime.split('/')[1] || defaultExt;
      return `base64_image_${Date.now().toString().slice(-6)}.${ext}`;
    }
    if (url.startsWith('data:audio/')) {
      const mime = url.substring(5, url.indexOf(';'));
      const ext = mime.split('/')[1] || 'mp3';
      return `base64_audio_${Date.now().toString().slice(-6)}.${ext}`;
    }
    if (url.includes('.m3u8')) return `live_stream_${Date.now().toString().slice(-4)}.m3u8`;
    if (url.includes('.flv')) return `live_stream_${Date.now().toString().slice(-4)}.flv`;
    if (url.includes('.mpd')) return `live_stream_${Date.now().toString().slice(-4)}.mpd`;

    try {
      const parsed = new URL(url, window.location.href);
      const pathname = parsed.pathname;
      const parts = pathname.split('/');
      let name = parts.pop() || parts.pop() || '';
      name = decodeURIComponent(name.split('?')[0]);
      if (!name || name.length < 2) {
        return `media_${Date.now().toString().slice(-6)}.${defaultExt}`;
      }
      return name;
    } catch {
      return `media_${Date.now().toString().slice(-6)}.${defaultExt}`;
    }
  }

  /**
   * Helper: Parse srcset to get largest image URL
   */
  function parseSrcset(srcset) {
    if (!srcset) return [];
    const results = [];
    const items = srcset.split(',');
    for (const item of items) {
      const parts = item.trim().split(/\s+/);
      if (parts[0]) {
        results.push({
          url: toAbsoluteUrl(parts[0]),
          descriptor: parts[1] || '1x'
        });
      }
    }
    return results;
  }

  /**
   * Helper: Parse CSS background image urls
   */
  function extractBgUrls(cssText) {
    if (!cssText || cssText === 'none') return [];
    const urls = [];
    const regex = /url\((['"]?)(.*?)\1\)/gi;
    let match;
    while ((match = regex.exec(cssText)) !== null) {
      const u = match[2]?.trim();
      if (u && !u.startsWith('data:image/svg+xml;utf8,<svg') && u !== '""' && u !== "''") {
        urls.push(toAbsoluteUrl(u));
      }
    }
    return urls;
  }

  /**
   * Core Media Extractor: Scans element or root document
   */
  class MediaExtractor {
    static extractFromElement(root = document.body) {
      const mediaMap = new Map();

      function addMedia(item) {
        if (!item || !item.url) return;
        const normalizedUrl = item.url.trim();
        if (!normalizedUrl || normalizedUrl === 'about:blank' || normalizedUrl.startsWith('javascript:')) return;

        if (!mediaMap.has(normalizedUrl)) {
          mediaMap.set(normalizedUrl, item);
        } else {
          const existing = mediaMap.get(normalizedUrl);
          if ((item.width && item.width > existing.width) || (item.height && item.height > existing.height)) {
            existing.width = Math.max(existing.width || 0, item.width || 0);
            existing.height = Math.max(existing.height || 0, item.height || 0);
          }
          if (item.title && !existing.title) existing.title = item.title;
          if (item.isLive) existing.isLive = true;
        }
      }

      // 1. Include already captured live streams & audios
      capturedLiveStreams.forEach((stream) => {
        addMedia(stream);
      });

      // 2. Process Audio Elements
      const audios = root.querySelectorAll ? Array.from(root.querySelectorAll('audio')) : [];
      if (root.tagName === 'AUDIO') audios.push(root);

      audios.forEach(audio => {
        const audioSrcs = [
          audio.getAttribute('src'),
          audio.currentSrc,
          audio.getAttribute('data-src')
        ].filter(Boolean);

        audio.querySelectorAll('source').forEach(srcEl => {
          const s = srcEl.getAttribute('src') || srcEl.getAttribute('data-src');
          if (s) audioSrcs.push(s);
        });

        audioSrcs.forEach(rawUrl => {
          const absUrl = toAbsoluteUrl(rawUrl);
          if (absUrl) {
            const fmt = absUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp3';
            addMedia({
              url: absUrl,
              type: 'audio',
              isLive: false,
              format: fmt,
              width: 0,
              height: 0,
              filename: getFilenameFromUrl(absUrl, fmt),
              title: audio.getAttribute('title') || audio.getAttribute('aria-label') || 'Audio Clip',
              pageTitle: document.title,
              sourceElement: 'audio'
            });
          }
        });
      });

      // 3. Process Image Elements
      const images = root.querySelectorAll ? Array.from(root.querySelectorAll('img')) : [];
      if (root.tagName === 'IMG') images.push(root);

      images.forEach(img => {
        const candidates = [
          img.getAttribute('src'),
          img.currentSrc,
          img.getAttribute('data-src'),
          img.getAttribute('data-original'),
          img.getAttribute('data-orig'),
          img.getAttribute('data-zoom-image'),
          img.getAttribute('data-zoom-src'),
          img.getAttribute('data-large-img-url'),
          img.getAttribute('data-full-url'),
          img.getAttribute('data-lazy-src'),
          img.getAttribute('data-actualsrc')
        ].filter(Boolean);

        if (img.getAttribute('srcset')) {
          parseSrcset(img.getAttribute('srcset')).forEach(s => candidates.push(s.url));
        }

        const width = img.naturalWidth || img.width || parseInt(img.getAttribute('width')) || 0;
        const height = img.naturalHeight || img.height || parseInt(img.getAttribute('height')) || 0;
        const alt = img.getAttribute('alt') || img.getAttribute('title') || '';

        candidates.forEach(rawUrl => {
          const absUrl = toAbsoluteUrl(rawUrl);
          if (absUrl) {
            addMedia({
              url: absUrl,
              type: 'image',
              format: absUrl.startsWith('data:') ? 'base64' : (absUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'img'),
              width: width,
              height: height,
              filename: getFilenameFromUrl(absUrl, 'jpg'),
              title: alt,
              pageTitle: document.title,
              sourceElement: 'img'
            });
          }
        });
      });

      // 4. Process Picture Elements & Sources
      const pictures = root.querySelectorAll ? Array.from(root.querySelectorAll('picture')) : [];
      if (root.tagName === 'PICTURE') pictures.push(root);

      pictures.forEach(pic => {
        const sources = Array.from(pic.querySelectorAll('source'));
        sources.forEach(source => {
          const srcset = source.getAttribute('srcset');
          if (srcset) {
            parseSrcset(srcset).forEach(s => {
              addMedia({
                url: s.url,
                type: 'image',
                format: s.url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg',
                width: 0,
                height: 0,
                filename: getFilenameFromUrl(s.url, 'jpg'),
                title: '',
                pageTitle: document.title,
                sourceElement: 'picture-source'
              });
            });
          }
        });
      });

      // 5. Process Video Elements & Live Streams
      const videos = root.querySelectorAll ? Array.from(root.querySelectorAll('video')) : [];
      if (root.tagName === 'VIDEO') videos.push(root);

      videos.forEach(video => {
        const width = video.videoWidth || video.width || parseInt(video.getAttribute('width')) || 0;
        const height = video.videoHeight || video.height || parseInt(video.getAttribute('height')) || 0;
        const poster = video.getAttribute('poster');
        if (poster) {
          const absPoster = toAbsoluteUrl(poster);
          addMedia({
            url: absPoster,
            type: 'image',
            format: 'poster',
            width: width,
            height: height,
            filename: getFilenameFromUrl(absPoster, 'jpg'),
            title: `Poster of video`,
            pageTitle: document.title,
            sourceElement: 'video-poster'
          });
        }

        const videoSrcs = [video.getAttribute('src'), video.currentSrc].filter(Boolean);
        video.querySelectorAll('source').forEach(srcEl => {
          const s = srcEl.getAttribute('src');
          if (s) videoSrcs.push(s);
        });

        videoSrcs.forEach(rawUrl => {
          const absUrl = toAbsoluteUrl(rawUrl);
          if (absUrl) {
            const isLive = LIVE_STREAM_REGEX.test(absUrl) || absUrl.startsWith('blob:') || absUrl.startsWith('rtmp://');
            let format = absUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp4';
            if (absUrl.includes('.m3u8')) format = 'm3u8';
            else if (absUrl.includes('.flv')) format = 'flv';
            else if (absUrl.includes('.mpd')) format = 'mpd';

            addMedia({
              url: absUrl,
              type: isLive ? 'live' : 'video',
              isLive: isLive,
              format: format,
              width: width,
              height: height,
              filename: getFilenameFromUrl(absUrl, format),
              title: video.getAttribute('title') || (isLive ? 'Live Stream' : 'Video Media'),
              pageTitle: document.title,
              sourceElement: isLive ? 'video (live)' : 'video'
            });
          }
        });
      });

      // 6. Process Direct Media Links (Audio, Video, Streams, Images)
      const links = root.querySelectorAll ? Array.from(root.querySelectorAll('a[href]')) : [];
      if (root.tagName === 'A' && root.getAttribute('href')) links.push(root);

      links.forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;
        const absUrl = toAbsoluteUrl(href);

        if (AUDIO_EXT_REGEX.test(absUrl)) {
          const fmt = absUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp3';
          addMedia({
            url: absUrl,
            type: 'audio',
            isLive: false,
            format: fmt,
            width: 0,
            height: 0,
            filename: getFilenameFromUrl(absUrl, fmt),
            title: a.innerText?.trim() || a.getAttribute('title') || 'Linked Audio',
            pageTitle: document.title,
            sourceElement: 'link (audio)'
          });
        } else if (LIVE_STREAM_REGEX.test(absUrl) || absUrl.startsWith('rtmp://')) {
          let fmt = 'm3u8';
          if (absUrl.includes('.flv')) fmt = 'flv';
          else if (absUrl.includes('.mpd')) fmt = 'mpd';
          addMedia({
            url: absUrl,
            type: 'live',
            isLive: true,
            format: fmt,
            width: 1920,
            height: 1080,
            filename: getFilenameFromUrl(absUrl, fmt),
            title: a.innerText?.trim() || a.getAttribute('title') || 'Linked Live Stream',
            pageTitle: document.title,
            sourceElement: 'link (live)'
          });
        } else if (IMAGE_EXT_REGEX.test(absUrl)) {
          addMedia({
            url: absUrl,
            type: 'image',
            format: absUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg',
            width: 0,
            height: 0,
            filename: getFilenameFromUrl(absUrl, 'jpg'),
            title: a.innerText?.trim() || a.getAttribute('title') || 'Linked Image',
            pageTitle: document.title,
            sourceElement: 'link'
          });
        } else if (VIDEO_EXT_REGEX.test(absUrl)) {
          addMedia({
            url: absUrl,
            type: 'video',
            format: absUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp4',
            width: 0,
            height: 0,
            filename: getFilenameFromUrl(absUrl, 'mp4'),
            title: a.innerText?.trim() || a.getAttribute('title') || 'Linked Video',
            pageTitle: document.title,
            sourceElement: 'link'
          });
        }
      });

      // 7. Process Background Images of Elements
      const allElements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      if (root !== document.body) allElements.push(root);

      for (const el of allElements) {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.classList?.contains('ms-picker-highlight')) continue;
        try {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundImage;
          if (bg && bg !== 'none') {
            const bgUrls = extractBgUrls(bg);
            const rect = el.getBoundingClientRect();
            bgUrls.forEach(u => {
              addMedia({
                url: u,
                type: 'image',
                format: u.startsWith('data:') ? 'base64' : (u.split('.').pop()?.split('?')[0]?.toLowerCase() || 'bg'),
                width: Math.round(rect.width) || 0,
                height: Math.round(rect.height) || 0,
                filename: getFilenameFromUrl(u, 'png'),
                title: `Background Image (${el.tagName.toLowerCase()})`,
                pageTitle: document.title,
                sourceElement: 'background-image'
              });
            });
          }
        } catch {}
      }

      // 8. Process SVGs
      const svgs = root.querySelectorAll ? Array.from(root.querySelectorAll('svg')) : [];
      if (root.tagName === 'SVG') svgs.push(root);
      svgs.forEach((svg, idx) => {
        try {
          const rect = svg.getBoundingClientRect();
          if (rect.width > 12 && rect.height > 12) {
            const serializer = new XMLSerializer();
            const svgStr = serializer.serializeToString(svg);
            const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
            addMedia({
              url: dataUrl,
              type: 'image',
              format: 'svg',
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              filename: `svg_icon_${idx + 1}.svg`,
              title: `SVG Graphic #${idx + 1}`,
              pageTitle: document.title,
              sourceElement: 'svg'
            });
          }
        } catch {}
      });

      return Array.from(mediaMap.values());
    }
  }

  /**
   * Inspector / Picker UI Controller
   */
  class InspectorPicker {
    static start() {
      if (isPicking) return;
      isPicking = true;
      InspectorPicker.createUI();
      InspectorPicker.bindEvents();
      InspectorPicker.showToast('🎯 鼠标选择模式已开启，移动鼠标高亮区域，点击提取媒体');
    }

    static stop() {
      if (!isPicking) return;
      isPicking = false;
      InspectorPicker.removeUI();
      InspectorPicker.unbindEvents();
    }

    static createUI() {
      overlayEl = document.createElement('div');
      overlayEl.className = 'ms-picker-highlight';
      overlayEl.style.display = 'none';
      document.documentElement.appendChild(overlayEl);

      badgeEl = document.createElement('div');
      badgeEl.className = 'ms-picker-badge';
      badgeEl.style.display = 'none';
      document.documentElement.appendChild(badgeEl);

      floatingBarEl = document.createElement('div');
      floatingBarEl.className = 'ms-floating-bar';
      floatingBarEl.innerHTML = `
        <div class="ms-bar-logo">
          <span class="ms-bar-pulse-dot"></span>
          <span>MediaSniffer 选择器</span>
        </div>
        <div class="ms-bar-tip">
          <span>点击区域提取媒体</span>
          <span>•</span>
          <span>按 <span class="ms-bar-key">↑ / ↓</span> 扩展/缩小容器</span>
          <span>•</span>
          <span>按 <span class="ms-bar-key">ESC</span> 退出</span>
        </div>
        <button class="ms-bar-btn" id="ms-scan-all-btn">⚡ 扫描全页</button>
        <button class="ms-bar-btn-close" id="ms-exit-btn" title="退出选择 (ESC)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;
      document.documentElement.appendChild(floatingBarEl);

      document.getElementById('ms-exit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        InspectorPicker.stop();
      });

      document.getElementById('ms-scan-all-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        InspectorPicker.captureAndOpen(document.body, '全页面');
      });
    }

    static removeUI() {
      if (overlayEl) { overlayEl.remove(); overlayEl = null; }
      if (badgeEl) { badgeEl.remove(); badgeEl = null; }
      if (floatingBarEl) { floatingBarEl.remove(); floatingBarEl = null; }
      hoveredElement = null;
      hierarchyStack = [];
    }

    static bindEvents() {
      window.addEventListener('mousemove', InspectorPicker.onMouseMove, true);
      window.addEventListener('click', InspectorPicker.onClick, true);
      window.addEventListener('keydown', InspectorPicker.onKeyDown, true);
    }

    static unbindEvents() {
      window.removeEventListener('mousemove', InspectorPicker.onMouseMove, true);
      window.removeEventListener('click', InspectorPicker.onClick, true);
      window.removeEventListener('keydown', InspectorPicker.onKeyDown, true);
    }

    static onMouseMove(e) {
      if (!isPicking) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target || target.closest('.ms-floating-bar') || target.closest('.ms-picker-highlight') || target.closest('.ms-toast')) {
        return;
      }

      if (target !== hoveredElement) {
        hoveredElement = target;
        hierarchyStack = [target];
        let p = target.parentElement;
        while (p && p !== document.documentElement && p !== document.body) {
          hierarchyStack.push(p);
          p = p.parentElement;
        }
        hierarchyIndex = 0;
        InspectorPicker.updateHighlight(target);
      }
    }

    static updateHighlight(el) {
      if (!el || !overlayEl || !badgeEl) return;

      const rect = el.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      overlayEl.style.display = 'block';
      overlayEl.style.top = `${rect.top + scrollY}px`;
      overlayEl.style.left = `${rect.left + scrollX}px`;
      overlayEl.style.width = `${rect.width}px`;
      overlayEl.style.height = `${rect.height}px`;

      const mediaList = MediaExtractor.extractFromElement(el);
      const count = mediaList.length;

      const tagName = el.tagName.toLowerCase();
      const className = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : '';
      const dims = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

      badgeEl.style.display = 'flex';
      badgeEl.style.top = `${Math.max(10, rect.top + scrollY)}px`;
      badgeEl.style.left = `${rect.left + scrollX}px`;
      badgeEl.innerHTML = `
        <span class="ms-badge-tag">&lt;${tagName}${className.slice(0, 15)}&gt;</span>
        <span>${dims}</span>
        <span class="ms-badge-media-count">${count} 个媒体</span>
      `;
    }

    static onKeyDown(e) {
      if (!isPicking) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        InspectorPicker.stop();
        InspectorPicker.showToast('已退出鼠标选择模式');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (hierarchyStack.length > 0 && hierarchyIndex < hierarchyStack.length - 1) {
          hierarchyIndex++;
          hoveredElement = hierarchyStack[hierarchyIndex];
          InspectorPicker.updateHighlight(hoveredElement);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (hierarchyStack.length > 0 && hierarchyIndex > 0) {
          hierarchyIndex--;
          hoveredElement = hierarchyStack[hierarchyIndex];
          InspectorPicker.updateHighlight(hoveredElement);
        }
      }
    }

    static onClick(e) {
      if (!isPicking) return;
      const target = e.target;
      if (target.closest('.ms-floating-bar') || target.closest('.ms-toast')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const el = hoveredElement || target;
      InspectorPicker.captureAndOpen(el, `选中区域 <${el.tagName.toLowerCase()}>`);
      InspectorPicker.stop();
    }

    static captureAndOpen(element, label) {
      const items = MediaExtractor.extractFromElement(element);
      InspectorPicker.showToast(`✨ 成功提取到 ${items.length} 个媒体/直播流！正在打开控制台...`);

      chrome.runtime.sendMessage({
        action: 'MEDIA_CAPTURED_FROM_PICKER',
        mediaItems: items,
        sourceTitle: document.title,
        sourceUrl: window.location.href,
        pickerLabel: label
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    }

    static showToast(message, duration = 3000) {
      const existing = document.querySelector('.ms-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = 'ms-toast';
      toast.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <span>${message}</span>
      `;
      document.documentElement.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }

  // Runtime messaging
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
      sendResponse({ status: 'PONG', url: window.location.href, title: document.title });
      return true;
    }

    if (request.action === 'START_PICKER') {
      InspectorPicker.start();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'STOP_PICKER') {
      InspectorPicker.stop();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'SCAN_FULL_PAGE') {
      const items = MediaExtractor.extractFromElement(document.body);
      sendResponse({
        success: true,
        items: items,
        title: document.title,
        url: window.location.href
      });
      return true;
    }

    return true;
  });

})();

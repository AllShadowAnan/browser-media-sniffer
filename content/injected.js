/**
 * MediaSniffer Injected Script
 * Runs in main page context to hook fetch, XHR, Audio, and media player instances to intercept live streams and audio files.
 */

(function () {
  if (window.__MEDIA_SNIFFER_INJECTED__) return;
  window.__MEDIA_SNIFFER_INJECTED__ = true;

  const capturedStreams = new Set();
  const LIVE_KEYWORDS_REGEX = /(\.m3u8|\.flv|\.mpd|\/hls\/|\/live\/|\/flv\/|live=true|playlist\.m3u8|live_stream)/i;
  const AUDIO_KEYWORDS_REGEX = /\.(mp3|m4a|aac|flac|wav|ogg|opus)(\?.*)?$/i;

  function reportMedia(url, source = 'network') {
    if (!url || typeof url !== 'string') return;
    if (url.startsWith('blob:') && source !== 'video-element' && source !== 'audio-element') {
      // Ignore random blobs unless from media element
    }
    
    let fullUrl = url;
    try {
      fullUrl = new URL(url, window.location.href).href;
    } catch {
      return;
    }

    if (capturedStreams.has(fullUrl)) return;
    capturedStreams.add(fullUrl);

    const isAudio = AUDIO_KEYWORDS_REGEX.test(fullUrl);
    let format = isAudio ? (fullUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp3') : 'm3u8';
    let type = isAudio ? 'audio' : 'live';

    if (!isAudio) {
      if (fullUrl.includes('.flv')) format = 'flv';
      else if (fullUrl.includes('.mpd')) format = 'mpd';
      else if (fullUrl.startsWith('rtmp://')) format = 'rtmp';
      else if (fullUrl.startsWith('webrtc://') || fullUrl.startsWith('wss://')) format = 'webrtc';
    }

    window.postMessage({
      type: 'MS_LIVE_STREAM_CAPTURED',
      stream: {
        url: fullUrl,
        type: type,
        format: format,
        title: isAudio ? (document.title || '网页音频') : (document.title || '直播媒体流'),
        pageTitle: document.title,
        filename: isAudio ? `audio_${Date.now().toString().slice(-4)}.${format}` : `live_stream_${Date.now().toString().slice(-4)}.${format}`,
        sourceElement: `Hook (${source})`,
        width: isAudio ? 0 : 1920,
        height: isAudio ? 0 : 1080,
        isLive: type === 'live',
        detectedAt: Date.now()
      }
    }, '*');
  }

  // 1. Hook fetch
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = async function (...args) {
      const url = args[0] instanceof Request ? args[0].url : args[0];
      if (typeof url === 'string' && (LIVE_KEYWORDS_REGEX.test(url) || AUDIO_KEYWORDS_REGEX.test(url))) {
        reportMedia(url, 'fetch');
      }
      return originalFetch.apply(this, args);
    };
  }

  // 2. Hook XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (typeof url === 'string' && (LIVE_KEYWORDS_REGEX.test(url) || AUDIO_KEYWORDS_REGEX.test(url))) {
      reportMedia(url, 'xhr');
    }
    return originalXhrOpen.call(this, method, url, ...rest);
  };

  // 3. Hook Video Element Src setters
  try {
    const videoSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (videoSrcDescriptor && videoSrcDescriptor.set) {
      const originalSrcSet = videoSrcDescriptor.set;
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        set(value) {
          if (typeof value === 'string' && (LIVE_KEYWORDS_REGEX.test(value) || AUDIO_KEYWORDS_REGEX.test(value) || value.includes('live'))) {
            reportMedia(value, this instanceof HTMLAudioElement ? 'audio-src' : 'video-src');
          }
          return originalSrcSet.call(this, value);
        },
        get() {
          return videoSrcDescriptor.get.call(this);
        }
      });
    }
  } catch {}

  // 4. Hook Audio Constructor
  try {
    const originalAudio = window.Audio;
    window.Audio = function (src) {
      const instance = new originalAudio(src);
      if (src && typeof src === 'string') {
        reportMedia(src, 'new Audio()');
      }
      return instance;
    };
  } catch {}

  // 5. Hook WebSocket if used for live FLV / RTSP / Audio stream
  try {
    const originalWebSocket = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      if (typeof url === 'string' && (LIVE_KEYWORDS_REGEX.test(url) || url.includes('/live/') || url.includes('/stream') || AUDIO_KEYWORDS_REGEX.test(url))) {
        reportMedia(url, 'websocket');
      }
      return new originalWebSocket(url, protocols);
    };
  } catch {}

  // 6. Periodic player inspector (for DPlayer, APlayer, Flv.js, Hls.js, xgplayer, videojs)
  function scanGlobalPlayers() {
    const candidates = ['dp', 'dplayer', 'aplayer', 'player', 'hls', 'flvPlayer', 'xgplayer', 'vplayer', 'livePlayer', 'musicPlayer'];
    candidates.forEach(name => {
      const p = window[name];
      if (!p) return;
      if (p.url) reportMedia(p.url, `window.${name}.url`);
      if (p.config && p.config.url) reportMedia(p.config.url, `window.${name}.config.url`);
      if (p.options && p.options.video && p.options.video.url) reportMedia(p.options.video.url, `window.${name}.options.video.url`);
      if (p.options && p.options.audio && p.options.audio.url) reportMedia(p.options.audio.url, `window.${name}.options.audio.url`);
      if (p.src) reportMedia(typeof p.src === 'function' ? p.src() : p.src, `window.${name}.src`);
    });
  }

  setInterval(scanGlobalPlayers, 2000);
})();

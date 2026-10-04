/**
 * Universal Metadata Extractor
 * Retrieves video title, author, track/artist info, duration, and thumbnail
 * across YouTube, Instagram, X (Twitter), Facebook, Snapchat, and generic sites.
 */

const https = require('https');
const { spawn } = require('child_process');
const { detectPlatform } = require('./platforms');
const youtubePlatform = require('./platforms/youtube');
const extractVideoId = (url) => {
  if (typeof youtubePlatform.extractVideoId === 'function') {
    return youtubePlatform.extractVideoId(url);
  }
  if (typeof youtubePlatform.extractId === 'function') {
    return youtubePlatform.extractId(url);
  }
  const match = String(url || '').match(/(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  return match ? match[1] : null;
};
const { generateFilename } = require('./filename');

let ytdl;
try {
  ytdl = require('@distube/ytdl-core');
} catch (e) {
  ytdl = null;
}

/**
 * Fetch fallback metadata via YouTube public oEmbed API
 * @param {string} videoId
 * @returns {Promise<object>}
 */
function fetchOEmbedMetadata(videoId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`oEmbed failed with status ${res.statusCode}`));
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            title: json.title || 'Unknown Title',
            author: json.author_name || 'Unknown Artist',
            artist: json.author_name || '',
            track: '',
            durationSeconds: 0,
            thumbnail: json.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          });
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch metadata via fast yt-dlp JSON dump (used for Instagram, X, Facebook, Snapchat)
 * @param {string} url
 * @returns {Promise<object>}
 */
function fetchYtDlpMetadata(url) {
  return new Promise(async (resolve, reject) => {
    const { getYtDlpPath } = require('./tools');
    const ytDlpPath = await getYtDlpPath();
    if (!ytDlpPath) return reject(new Error('yt-dlp executable not found'));

    const proc = spawn(ytDlpPath, [
      '--dump-single-json',
      '--skip-download',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      url
    ], { windowsHide: true });

    let stdoutData = '';
    proc.stdout.on('data', d => { stdoutData += d.toString(); });

    const timer = setTimeout(() => {
      try { proc.kill(); } catch (e) {}
      reject(new Error('Metadata timeout'));
    }, 12000);

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && stdoutData.trim()) {
        try {
          const json = JSON.parse(stdoutData);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// In-memory metadata cache (cacheKey -> rawMeta) to eliminate redundant network roundtrips
const metadataCache = new Map();

/**
 * Get comprehensive metadata for any media URL
 * @param {string} url - Media URL
 * @param {string} [format='mp3'] - Target format for filename preview
 * @returns {Promise<object>} Standardized metadata object
 */
async function getVideoMetadata(url, format = 'mp3') {
  const platform = detectPlatform(url) || { id: 'generic', name: 'Web', tag: '[Web]', color: '#B79CFF' };
  const cacheKey = `${platform.id}:${url}`;

  // Check cache first
  if (metadataCache.has(cacheKey)) {
    const cached = metadataCache.get(cacheKey);
    return {
      ...cached,
      targetFilename: generateFilename(cached, format, platform.tag),
      formattedDuration: formatDuration(cached.durationSeconds || 0)
    };
  }

  let rawMeta = {
    title: '',
    author: '',
    artist: '',
    track: '',
    durationSeconds: 0,
    thumbnail: '',
    platform: {
      id: platform.id,
      name: platform.name,
      tag: platform.tag,
      color: platform.color
    }
  };

  if (platform.id === 'youtube') {
    const videoId = extractVideoId(url);
    rawMeta.thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
    rawMeta.videoId = videoId;

    try {
      if (videoId) {
        const oembed = await fetchOEmbedMetadata(videoId);
        rawMeta.title = oembed.title || `YouTube Video ${videoId}`;
        rawMeta.author = oembed.author || 'YouTube Creator';
        rawMeta.artist = oembed.author || '';
        rawMeta.thumbnail = oembed.thumbnail || rawMeta.thumbnail;
      }
    } catch (e) {
      rawMeta.title = 'YouTube Video';
      rawMeta.author = 'YouTube Creator';
    }
  } else {
    // Instagram, X / Twitter, Facebook, Snapchat, Generic
    try {
      const info = await fetchYtDlpMetadata(url);
      rawMeta.title = info.title || info.description || `${platform.name} Media`;
      rawMeta.author = info.uploader || info.creator || info.channel || `${platform.name} Creator`;
      rawMeta.artist = rawMeta.author;
      rawMeta.durationSeconds = parseInt(info.duration || 0, 10);
      rawMeta.thumbnail = info.thumbnail || '';
    } catch (err) {
      rawMeta.title = `${platform.name} Media`;
      rawMeta.author = `${platform.name} Creator`;
      rawMeta.artist = rawMeta.author;
    }
  }

  // Cache resolved metadata
  metadataCache.set(cacheKey, rawMeta);

  // Generate formatted target filename with platform prefix: [Platform]_Title__Author.ext
  const targetFilename = generateFilename(rawMeta, format, platform.tag);

  return {
    ...rawMeta,
    targetFilename,
    formattedDuration: formatDuration(rawMeta.durationSeconds)
  };
}

/**
 * Format duration in seconds to "MM:SS" or "HH:MM:SS"
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatDuration(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds)) return '--:--';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

module.exports = {
  getVideoMetadata,
  fetchOEmbedMetadata,
  fetchYtDlpMetadata,
  formatDuration
};

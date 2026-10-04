/**
 * Platform Registry & Auto-Detection Dispatcher
 * Automatically identifies input links and routes to the dedicated platform handler.
 */

const youtube = require('./youtube');
const instagram = require('./instagram');
const twitter = require('./twitter');
const facebook = require('./facebook');
const snapchat = require('./snapchat');
const generic = require('./generic');

const PLATFORMS = [
  youtube,
  instagram,
  twitter,
  facebook,
  snapchat
];

/**
 * Auto-detect platform from raw URL
 * @param {string} url
 * @returns {object} Platform handler
 */
function detectPlatform(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  for (const handler of PLATFORMS) {
    if (handler.match(trimmed)) {
      return handler;
    }
  }

  // Fallback to generic if valid http(s) URL
  if (generic.match(trimmed)) {
    return generic;
  }

  return null;
}

/**
 * Get platform handler by ID
 * @param {string} id
 * @returns {object}
 */
function getPlatform(id) {
  const match = PLATFORMS.find(p => p.id === id);
  return match || generic;
}

/**
 * Parse batch input containing URLs from multiple platforms
 * @param {string} text - Raw input text from textarea
 * @returns {Array<{ originalUrl: string, normalizedUrl: string, platform: object, videoId: string|null, isValid: boolean, error?: string }>}
 */
function parseBatchUrls(text) {
  if (!text || typeof text !== 'string') return [];

  // Split by newlines, commas, or semicolons
  const lines = text
    .split(/[\r\n,;]+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const seenUrls = new Set();
  const results = [];

  for (const rawLine of lines) {
    const tokens = rawLine.split(/\s+/).filter(t => t.length > 0);

    for (const token of tokens) {
      const handler = detectPlatform(token);

      if (!handler) {
        results.push({
          originalUrl: token,
          normalizedUrl: null,
          platform: null,
          videoId: null,
          isValid: false,
          error: 'Unsupported or invalid URL format'
        });
        continue;
      }

      const normalized = handler.normalize(token);
      const videoId = handler.extractId ? handler.extractId(token) : null;

      if (seenUrls.has(normalized)) {
        continue; // Skip duplicate within same batch
      }
      seenUrls.add(normalized);

      results.push({
        originalUrl: token,
        normalizedUrl: normalized,
        platform: {
          id: handler.id,
          name: handler.name,
          tag: handler.tag,
          color: handler.color
        },
        videoId: videoId,
        isValid: true,
        error: null
      });
    }
  }

  return results;
}

module.exports = {
  detectPlatform,
  getPlatform,
  parseBatchUrls,
  PLATFORMS: [...PLATFORMS, generic]
};

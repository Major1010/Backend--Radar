/**
 * Universal Media URL Extractor & Validator
 * Supports YouTube, Instagram, X (Twitter), Facebook, Snapchat, and generic media links.
 */

const { detectPlatform, getPlatform, parseBatchUrls: parseMultiPlatformBatch } = require('./platforms');
const youtubeHandler = require('./platforms/youtube');

/**
 * Validate if a given string is a valid media URL from any supported platform
 * @param {string} url - Input URL string
 * @returns {boolean}
 */
function isValidMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return detectPlatform(url) !== null;
}

/**
 * Validate YouTube URL (backward compatibility)
 * @param {string} url
 * @returns {boolean}
 */
function isValidYouTubeUrl(url) {
  return youtubeHandler.match(url);
}

/**
 * Extract YouTube Video ID (backward compatibility)
 * @param {string} url
 * @returns {string|null}
 */
function extractVideoId(url) {
  return youtubeHandler.extractId(url);
}

/**
 * Normalize YouTube URL (backward compatibility)
 * @param {string} url
 * @returns {string|null}
 */
function normalizeYouTubeUrl(url) {
  return youtubeHandler.normalize(url);
}

/**
 * Parse batch input containing multiple URLs across YouTube, Instagram, X/Twitter, Facebook, Snapchat
 * @param {string} text - Raw input text from textarea
 * @returns {Array<object>}
 */
function parseBatchUrls(text) {
  return parseMultiPlatformBatch(text);
}

module.exports = {
  isValidMediaUrl,
  isValidYouTubeUrl,
  extractVideoId,
  normalizeYouTubeUrl,
  parseBatchUrls,
  detectPlatform,
  getPlatform
};

/**
 * Filename Generator & Sanitizer
 * Generates filenames following the exact format: Music_Name__SingerName.extension
 * - Every space inside music name becomes '_'
 * - Every space inside singer/artist name becomes '_'
 * - Music name and singer name are separated by '__'
 * - Sanitizes invalid filesystem characters (\ / : * ? " < > |)
 * - Collapses consecutive underscores within names while preserving '__' separator
 */

/**
 * Sanitize an individual name part (music name or singer name)
 * Converts whitespace to single underscores, removes illegal characters, collapses underscores.
 * @param {string} text - Raw string
 * @returns {string} Sanitized string
 */
function sanitizePart(text) {
  if (!text || typeof text !== 'string') return '';

  return (
    text
      // Remove common brackets / noise like (Official Video), [Official Audio], (Lyric Video), etc.
      .replace(/\s*[\(\[\{]\s*(?:official|audio|video|lyrics?|hd|4k|remastered|hq|clip|visualizer|feat\.?|ft\.?).*?[\)\]\}]/gi, ' ')
      // Replace filesystem illegal chars and troublesome symbols with space
      .replace(/[\/\\:\*\?"<>\|\#\%\&\$\+\=\@\!]/g, ' ')
      // Normalize any remaining unicode dashes or quotes
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[\u2018\u2019\u201c\u201d]/g, '')
      // Replace dots and commas that aren't inside words with space
      .replace(/[\,\;\.]+/g, ' ')
      // Replace all whitespace sequences (tabs, spaces, newlines) with a single underscore
      .replace(/\s+/g, '_')
      // Collapse multiple consecutive underscores into one
      .replace(/_+/g, '_')
      // Trim leading and trailing underscores
      .replace(/^_+|_+$/g, '')
  );
}

/**
 * Parses raw title and channel info into { musicName, singerName }
 * Handles patterns:
 * - "Artist - Title"
 * - "Title - Artist"
 * - "Title | Artist"
 * - "Title by Artist"
 * - "Title (feat. Artist)"
 * - Structured music metadata
 * @param {object} metadata - YouTube video metadata { title, artist, track, author, uploader, channelTitle }
 * @returns {{ musicName: string, singerName: string }}
 */
function parseMusicAndSinger(metadata) {
  let rawTitle = (metadata.title || '').trim();
  let rawArtist = (metadata.artist || metadata.author || metadata.uploader || metadata.channelTitle || '').trim();
  let rawTrack = (metadata.track || '').trim();

  // If YouTube Music / official metadata already provides separate track & artist
  if (rawTrack && rawArtist) {
    return {
      musicName: rawTrack,
      singerName: rawArtist
    };
  }

  // Clean obvious channel suffixes from channel name like "VEVO", " - Topic", "Official"
  let cleanChannel = rawArtist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/\s+Official$/i, '')
    .trim();

  // Try extracting from title patterns: "Artist - Title" or "Artist – Title"
  const dashMatch = rawTitle.match(/^(.*?)\s*[-–—|:]\s*(.*?)$/);
  if (dashMatch) {
    const part1 = dashMatch[1].trim();
    const part2 = dashMatch[2].trim();

    // Determine which part is artist vs song name
    // If part1 closely matches channel name, then part1 is Artist and part2 is Music
    if (
      cleanChannel &&
      (part1.toLowerCase().includes(cleanChannel.toLowerCase()) ||
       cleanChannel.toLowerCase().includes(part1.toLowerCase()))
    ) {
      return { musicName: part2, singerName: part1 };
    }

    // Default standard music naming: "Artist - Song Name"
    return { musicName: part2, singerName: part1 };
  }

  // Check "Song Name by Artist" pattern
  const byMatch = rawTitle.match(/^(.*?)\s+by\s+(.*?)$/i);
  if (byMatch) {
    return { musicName: byMatch[1].trim(), singerName: byMatch[2].trim() };
  }

  // Fallback: Use title as Music Name and Channel/Author as Singer Name
  return {
    musicName: rawTitle || 'Unknown_Track',
    singerName: cleanChannel || 'Unknown_Artist'
  };
}

/**
 * Generate final sanitized filename: [Platform]_Music_Name__SingerName.extension
 * @param {object} metadata - Video metadata object
 * @param {string} format - Output format ("mp3" or "mp4")
 * @param {string} [platformTag] - Platform identifier tag e.g. "[Instagram]", "[YouTube]"
 * @returns {string} Complete formatted filename
 */
function generateFilename(metadata, format = 'mp3', platformTag = '') {
  const ext = format.toLowerCase() === 'mp4' ? 'mp4' : 'mp3';
  const parsed = parseMusicAndSinger(metadata);

  let musicPart = sanitizePart(parsed.musicName) || 'Media';
  let singerPart = sanitizePart(parsed.singerName) || 'Creator';

  // Limit part lengths to avoid filesystem path limits (max ~80 chars per part)
  if (musicPart.length > 70) musicPart = musicPart.substring(0, 70).replace(/_+$/, '');
  if (singerPart.length > 50) singerPart = singerPart.substring(0, 50).replace(/_+$/, '');

  const tagPrefix = platformTag ? `${platformTag}_` : '';
  // Final format: [Platform]_Music_Name__SingerName.ext
  return `${tagPrefix}${musicPart}__${singerPart}.${ext}`;
}

module.exports = {
  sanitizePart,
  parseMusicAndSinger,
  generateFilename
};

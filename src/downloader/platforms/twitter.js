/**
 * X / Twitter Platform Handler
 * Extracts videos and media from X / Twitter posts.
 */

const TWITTER_REGEX = /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/(?:[a-zA-Z0-9_]+|i)\/status\/(\d+)/i;

const twitterHandler = {
  id: 'twitter',
  name: 'X / Twitter',
  tag: '[X]',
  color: '#1DA1F2',

  /**
   * Check if URL matches Twitter or X
   * @param {string} url
   * @returns {boolean}
   */
  match(url) {
    if (!url || typeof url !== 'string') return false;
    return TWITTER_REGEX.test(url.trim());
  },

  /**
   * Extract tweet status ID
   * @param {string} url
   * @returns {string|null}
   */
  extractId(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.trim().match(TWITTER_REGEX);
    return match ? match[1] : null;
  },

  /**
   * Normalize URL to standard X status link (clean query parameters)
   * @param {string} url
   * @returns {string}
   */
  normalize(url) {
    try {
      const parsed = new URL(url.trim());
      return `https://x.com${parsed.pathname}`;
    } catch (e) {
      return url.trim().split('?')[0];
    }
  },

  /**
   * Build yt-dlp CLI arguments optimized for X / Twitter video extraction
   * @param {object} options
   * @returns {Array<string>}
   */
  buildArgs({ format, templatePath, ffmpegPath }) {
    const isMp3 = format.toLowerCase() === 'mp3';
    const args = [
      '--no-playlist',
      '--newline',
      '--no-check-certificates',
      '--geo-bypass',
      '--no-part',
      '--windows-filenames',
      '--no-mtime',
      '--concurrent-fragments', '8',
      '--buffer-size', '16M',
      '--progress-template', '%(progress._percent_str)s'
    ];

    if (ffmpegPath) {
      args.push('--ffmpeg-location', ffmpegPath);
      args.push('--postprocessor-args', 'ffmpeg:-threads 0 -preset ultrafast');
    }

    if (isMp3) {
      args.push(
        '-f', 'bestaudio[ext=m4a]/bestaudio/best',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', templatePath
      );
    } else {
      // Twitter provides progressive MP4 streams with audio
      args.push(
        '-f', 'best[ext=mp4]/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', templatePath
      );
    }

    return args;
  }
};

module.exports = twitterHandler;

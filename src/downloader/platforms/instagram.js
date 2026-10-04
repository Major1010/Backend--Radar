/**
 * Instagram Platform Handler
 * Extracts Instagram Reels, Posts, Videos, and Stories.
 */

const INSTAGRAM_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv|stories)\/([a-zA-Z0-9_\.-]+)/i;

const instagramHandler = {
  id: 'instagram',
  name: 'Instagram',
  tag: '[Instagram]',
  color: '#E1306C',

  /**
   * Check if URL matches Instagram
   * @param {string} url
   * @returns {boolean}
   */
  match(url) {
    if (!url || typeof url !== 'string') return false;
    return INSTAGRAM_REGEX.test(url.trim());
  },

  /**
   * Extract post or reel ID
   * @param {string} url
   * @returns {string|null}
   */
  extractId(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.trim().match(INSTAGRAM_REGEX);
    return match ? match[1] : null;
  },

  /**
   * Normalize URL (strip tracking params like ?igsh=, ?utm_source=)
   * @param {string} url
   * @returns {string}
   */
  normalize(url) {
    try {
      const parsed = new URL(url.trim());
      // Strip tracking query parameters
      return `${parsed.origin}${parsed.pathname}`;
    } catch (e) {
      return url.trim().split('?')[0];
    }
  },

  /**
   * Build yt-dlp CLI arguments optimized for Instagram direct video streaming
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
      // Instagram videos are natively progressive MP4 with audio muxed
      args.push(
        '-f', 'best[ext=mp4]/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', templatePath
      );
    }

    return args;
  }
};

module.exports = instagramHandler;

/**
 * Snapchat Platform Handler
 * Extracts Snapchat Spotlight clips, Public Stories, and Shares.
 */

const SNAPCHAT_REGEX = /(?:https?:\/\/)?(?:www\.|story\.)?snapchat\.com\/(?:spotlight|p|story|s|add)\/([a-zA-Z0-9_\.-]+)/i;

const snapchatHandler = {
  id: 'snapchat',
  name: 'Snapchat',
  tag: '[Snapchat]',
  color: '#FFFC00',

  /**
   * Check if URL matches Snapchat
   * @param {string} url
   * @returns {boolean}
   */
  match(url) {
    if (!url || typeof url !== 'string') return false;
    return SNAPCHAT_REGEX.test(url.trim()) || url.trim().includes('snapchat.com');
  },

  /**
   * Extract spotlight or story ID
   * @param {string} url
   * @returns {string|null}
   */
  extractId(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.trim().match(SNAPCHAT_REGEX);
    return match ? match[1] : null;
  },

  /**
   * Normalize URL
   * @param {string} url
   * @returns {string}
   */
  normalize(url) {
    return url.trim().split('?')[0];
  },

  /**
   * Build yt-dlp CLI arguments optimized for Snapchat video extraction
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
      args.push(
        '-f', 'best[ext=mp4]/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', templatePath
      );
    }

    return args;
  }
};

module.exports = snapchatHandler;

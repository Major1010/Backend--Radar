/**
 * Facebook Platform Handler
 * Extracts Facebook Reels, Watch videos, Page clips, and fb.watch shortlinks.
 */

const FACEBOOK_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch|fb\.com)\/(?:watch\/?\?v=\d+|reel\/\d+|videos\/\d+|share\/(?:v|r)\/[a-zA-Z0-9_-]+|[a-zA-Z0-9_\.-]+\/videos\/\d+|[a-zA-Z0-9_\.-]+\/?)/i;

const facebookHandler = {
  id: 'facebook',
  name: 'Facebook',
  tag: '[Facebook]',
  color: '#1877F2',

  /**
   * Check if URL matches Facebook
   * @param {string} url
   * @returns {boolean}
   */
  match(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    return (
      trimmed.includes('facebook.com') ||
      trimmed.includes('fb.watch') ||
      trimmed.includes('fb.com')
    );
  },

  /**
   * Extract video identifier
   * @param {string} url
   * @returns {string|null}
   */
  extractId(url) {
    if (!url || typeof url !== 'string') return null;
    const vMatch = url.match(/[?&]v=(\d+)/);
    if (vMatch) return vMatch[1];
    const reelMatch = url.match(/reel\/(\d+)/);
    if (reelMatch) return reelMatch[1];
    const vidMatch = url.match(/videos\/(\d+)/);
    if (vidMatch) return vidMatch[1];
    const fbWatchMatch = url.match(/fb\.watch\/([a-zA-Z0-9_-]+)/);
    if (fbWatchMatch) return fbWatchMatch[1];
    return null;
  },

  /**
   * Normalize URL
   * @param {string} url
   * @returns {string}
   */
  normalize(url) {
    return url.trim();
  },

  /**
   * Build yt-dlp CLI arguments optimized for Facebook stream extraction
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
      // Facebook provides HD/SD mp4 formats
      args.push(
        '-f', 'best[ext=mp4]/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', templatePath
      );
    }

    return args;
  }
};

module.exports = facebookHandler;

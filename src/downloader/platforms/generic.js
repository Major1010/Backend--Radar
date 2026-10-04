/**
 * Generic Web Media Handler
 * Handles other sites supported by yt-dlp (TikTok, Reddit, Vimeo, SoundCloud, etc.)
 */

const genericHandler = {
  id: 'generic',
  name: 'Web Media',
  tag: '[Web]',
  color: '#B79CFF',

  /**
   * Matches any valid HTTP/HTTPS URL
   * @param {string} url
   * @returns {boolean}
   */
  match(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
      return false;
    }
  },

  extractId(url) {
    try {
      const parsed = new URL(url.trim());
      return parsed.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'media';
    } catch (e) {
      return 'media';
    }
  },

  normalize(url) {
    return url.trim();
  },

  buildArgs({ format, quality = 'best', templatePath, ffmpegPath }) {
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

module.exports = genericHandler;

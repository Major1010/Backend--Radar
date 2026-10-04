/**
 * YouTube Platform Handler
 * Extracts YouTube videos, shorts, music, and embeds.
 */

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

const youtubeHandler = {
  id: 'youtube',
  name: 'YouTube',
  tag: '[YouTube]',
  color: '#FF0033',

  /**
   * Check if URL matches YouTube
   * @param {string} url
   * @returns {boolean}
   */
  match(url) {
    if (!url || typeof url !== 'string') return false;
    return YOUTUBE_REGEX.test(url.trim());
  },

  /**
   * Extract video ID
   * @param {string} url
   * @returns {string|null}
   */
  extractId(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.trim().match(YOUTUBE_REGEX);
    return match ? match[1] : null;
  },

  extractVideoId(url) {
    return this.extractId(url);
  },

  /**
   * Normalize to standard watch URL
   * @param {string} url
   * @returns {string|null}
   */
  normalize(url) {
    const id = this.extractId(url);
    return id ? `https://www.youtube.com/watch?v=${id}` : url.trim();
  },

  /**
   * Build yt-dlp CLI arguments optimized for YouTube speed and throttling bypass
   * @param {object} options
   * @returns {Array<string>}
   */
  buildArgs({ format, quality = 'best', templatePath, ffmpegPath, clientStrategy = 'android,web' }) {
    const isMp3 = format.toLowerCase() === 'mp3';
    const args = [
      '--no-playlist',
      '--newline',
      '--no-check-certificates',
      '--prefer-free-formats',
      '--geo-bypass',
      '--no-part',
      '--windows-filenames',
      '--no-mtime',
      '--concurrent-fragments', '8',
      '--buffer-size', '16M',
      '--http-chunk-size', '10M',
      '--remote-components', 'ejs:github',
      '--progress-template', '%(progress._percent_str)s'
    ];

    if (process.execPath) {
      args.push('--js-runtimes', `node:${process.execPath}`);
    } else {
      args.push('--js-runtimes', 'node');
    }

    if (clientStrategy) {
      args.push('--extractor-args', `youtube:player_client=${clientStrategy};player_skip=configs,webpage`);
    }

    if (ffmpegPath) {
      args.push('--ffmpeg-location', ffmpegPath);
      args.push('--postprocessor-args', 'ffmpeg:-threads 0 -preset ultrafast');
    }

    if (isMp3) {
      args.push(
        '-f', 'bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio/best',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', templatePath
      );
    } else {
      const q = String(quality || 'best').toLowerCase();
      const isNumeric = /^\d+$/.test(q);
      const heightCap = isNumeric ? parseInt(q, 10) : null;

      if (ffmpegPath) {
        if (heightCap) {
          args.push(
            '-f', `bestvideo[height<=?${heightCap}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=?${heightCap}]+bestaudio/best[height<=?${heightCap}][ext=mp4]/best[height<=?${heightCap}]/best`,
            '--merge-output-format', 'mp4',
            '-o', templatePath
          );
        } else {
          args.push(
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '-o', templatePath
          );
        }
      } else {
        if (heightCap) {
          args.push('-f', `best[height<=?${heightCap}][ext=mp4]/best[height<=?${heightCap}]/best`, '-o', templatePath);
        } else {
          args.push('-f', 'best[ext=mp4]/best', '-o', templatePath);
        }
      }
    }

    return args;
  }
};

youtubeHandler.extractVideoId = function(url) {
  return youtubeHandler.extractId(url);
};

module.exports = youtubeHandler;
module.exports.extractVideoId = youtubeHandler.extractVideoId;

/**
 * Media Processing & Conversion Engine
 * Downloads media from YouTube and converts it to high-quality MP3 audio or MP4 video.
 * Supports both local yt-dlp CLI and Node.js ytdl-core + ffmpeg stream pipeline.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getVideoMetadata } = require('./metadata');
const { getFfmpegPath, getYtDlpPath, downloadYtDlp, updateYtDlp, ensureFfmpegAvailable } = require('./tools');
const { detectPlatform, getPlatform } = require('./platforms');

let ytdl;
try {
  ytdl = require('@distube/ytdl-core');
} catch (e) {
  ytdl = null;
}

let fluentFfmpeg;
try {
  fluentFfmpeg = require('fluent-ffmpeg');
} catch (e) {
  fluentFfmpeg = null;
}

/**
 * Configure fluent-ffmpeg with discovered binary path if available
 */
async function configureFfmpeg() {
  if (!fluentFfmpeg) return null;
  const ffmpegPath = await getFfmpegPath();
  if (ffmpegPath) {
    try {
      fluentFfmpeg.setFfmpegPath(ffmpegPath);
      return ffmpegPath;
    } catch (e) {
      console.warn('Failed setting ffmpeg path on fluent-ffmpeg:', e.message);
    }
  }
  return null;
}

/**
 * Download & convert using yt-dlp CLI
 * @param {object} params
 * @param {string} params.url
 * @param {string} params.format
 * @param {string} params.outputDir
 * @param {string} params.targetFilename
 * @param {function} [params.onProgress]
 * @returns {Promise<string>} Output file path
 */
async function downloadWithYtDlp({ url, format, quality = 'best', outputDir, targetFilename, platform, onProgress }) {
  const ytDlpPath = await getYtDlpPath();
  if (!ytDlpPath) {
    throw new Error('yt-dlp executable not found');
  }

  const ffmpegPath = await getFfmpegPath();
  const isMp3 = format.toLowerCase() === 'mp3';
  const targetExt = isMp3 ? 'mp3' : 'mp4';

  if (isMp3 && !ffmpegPath) {
    throw new Error('Audio conversion failed: FFmpeg binary not found. Please install FFmpeg (run: npm install @ffmpeg-installer/ffmpeg or winget install Gyan.FFmpeg).');
  }

  // Base name without extension for the yt-dlp output template
  const baseFilename = targetFilename.replace(/\.[^.]+$/, '');
  const templatePath = path.join(outputDir, `${baseFilename}.%(ext)s`);
  const expectedOutputPath = path.join(outputDir, `${baseFilename}.${targetExt}`);

  const platformInfo = platform || detectPlatform(url) || { id: 'generic', name: 'Web', tag: '[Web]' };
  const platformHandler = getPlatform(platformInfo.id);

  const runAttempt = (clientStrategy) => {
    return new Promise((resolve, reject) => {
      // Use modular platform-specific argument builder
      const args = platformHandler.buildArgs({
        format,
        quality,
        templatePath,
        ffmpegPath,
        clientStrategy
      });

      args.push(url);

      const proc = spawn(ytDlpPath, args, {
        shell: false,
        windowsHide: true
      });

      let lastProgress = 0;
      let stderrOutput = '';

      const parseProgress = (chunk) => {
        const text = chunk.toString();
        const match = text.match(/(\d+(?:\.\d+)?)%/);
        if (match && onProgress) {
          const percent = parseFloat(match[1]);
          if (!isNaN(percent) && percent > lastProgress) {
            lastProgress = Math.min(percent, 99);
            onProgress(lastProgress);
          }
        }
      };

      proc.stdout.on('data', parseProgress);
      proc.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString();
        parseProgress(chunk);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          if (fs.existsSync(expectedOutputPath)) {
            if (onProgress) onProgress(100);
            return resolve(expectedOutputPath);
          }

          try {
            const files = fs.readdirSync(outputDir);
            const matched = files.find(f => f.startsWith(baseFilename) && !f.endsWith('.tmp') && !f.endsWith('.part'));
            if (matched) {
              const matchedPath = path.join(outputDir, matched);
              if (onProgress) onProgress(100);
              return resolve(matchedPath);
            }
          } catch (e) {}

          reject(new Error(`Download completed but expected file was not found: ${expectedOutputPath}`));
        } else {
          const errorDetail = stderrOutput.trim() || `yt-dlp exited with error code ${code}`;
          reject(new Error(errorDetail));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start yt-dlp: ${err.message}`));
      });
    });
  };

  // Non-YouTube platforms (Instagram, Twitter/X, Facebook, Snapchat) execute directly in minimal time
  if (platformInfo.id !== 'youtube') {
    return await runAttempt(null);
  }

  // YouTube tiered client retry strategy
  try {
    return await runAttempt('android,web');
  } catch (err1) {
    const is403OrCipher = err1.message.includes('403') || err1.message.includes('Forbidden') || err1.message.includes('JavaScript');
    if (is403OrCipher) {
      console.warn('yt-dlp encountered YouTube client restriction, retrying with standalone android client...');
      try {
        return await runAttempt('android');
      } catch (err2) {
        console.warn('yt-dlp second attempt failed, retrying with ios,web client...');
        try {
          return await runAttempt('ios,web');
        } catch (err3) {
          console.warn('yt-dlp third attempt failed, attempting yt-dlp update...');
          try {
            await updateYtDlp();
            return await runAttempt('android');
          } catch (e) {
            console.error('All yt-dlp client attempts failed:', err1.message);
            throw err1;
          }
        }
      }
    }
    throw err1;
  }
}

/**
 * Download & convert using pure Node.js ytdl-core + fluent-ffmpeg stream pipeline
 * Fully guarded with error listeners to prevent unhandled EventEmitter crashes
 * @param {object} params
 * @returns {Promise<string>} Output file path
 */
async function downloadWithYtdlCore({ url, format, quality = 'best', outputPath, onProgress }) {
  if (!ytdl) {
    throw new Error('Media downloader library is not loaded.');
  }

  const ffmpegPath = await configureFfmpeg();
  const isMp3 = format.toLowerCase() === 'mp3';

  return new Promise((resolve, reject) => {
    let isSettled = false;

    const safeReject = (err) => {
      if (isSettled) return;
      isSettled = true;
      reject(err);
    };

    const safeResolve = (val) => {
      if (isSettled) return;
      isSettled = true;
      resolve(val);
    };

    if (isMp3) {
      if (!ffmpegPath || !fluentFfmpeg) {
        return safeReject(
          new Error('Audio conversion failed: FFmpeg binary not found. Please install FFmpeg (winget install Gyan.FFmpeg or npm run setup-tools).')
        );
      }

      let audioStream;
      try {
        audioStream = ytdl(url, {
          quality: 'highestaudio',
          filter: 'audioonly',
          playerClients: ['WEB', 'WEB_EMBEDDED', 'TV', 'IOS', 'ANDROID'],
          requestOptions: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          }
        });
      } catch (err) {
        return safeReject(err);
      }

      // CRITICAL: Always attach error listener on audioStream immediately
      audioStream.on('error', (err) => {
        safeReject(new Error(`YouTube audio stream error: ${err.message}`));
      });

      let totalBytes = 0;
      let downloadedBytes = 0;

      audioStream.on('response', (res) => {
        totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      });

      audioStream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0 && onProgress) {
          const percent = Math.min(Math.round((downloadedBytes / totalBytes) * 90), 90);
          onProgress(percent);
        }
      });

      const ffmpegCmd = fluentFfmpeg(audioStream)
        .audioBitrate(320)
        .toFormat('mp3')
        .on('error', (err) => {
          try { audioStream.destroy(); } catch (e) {}
          safeReject(new Error(`Audio conversion failed: ${err.message}`));
        })
        .on('end', () => {
          if (onProgress) onProgress(100);
          safeResolve(outputPath);
        });

      ffmpegCmd.save(outputPath);

    } else {
      // MP4 Video Download
      let videoStream;
      try {
        videoStream = ytdl(url, {
          quality: quality === 'best' ? 'highestvideo' : 'highest',
          filter: 'videoandaudio',
          playerClients: ['WEB', 'WEB_EMBEDDED', 'TV', 'IOS', 'ANDROID'],
          requestOptions: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          }
        });
      } catch (err) {
        return safeReject(err);
      }

      // CRITICAL: Always attach error listener on videoStream immediately
      videoStream.on('error', (err) => {
        safeReject(new Error(`YouTube video stream error: ${err.message}`));
      });

      let totalBytes = 0;
      let downloadedBytes = 0;

      videoStream.on('response', (res) => {
        totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      });

      videoStream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0 && onProgress) {
          const percent = Math.min(Math.round((downloadedBytes / totalBytes) * 95), 95);
          onProgress(percent);
        }
      });

      const writeStream = fs.createWriteStream(outputPath);
      videoStream.pipe(writeStream);

      writeStream.on('finish', () => {
        if (onProgress) onProgress(100);
        safeResolve(outputPath);
      });

      writeStream.on('error', (err) => {
        try { videoStream.destroy(); } catch (e) {}
        safeReject(err);
      });
    }
  });
}

/**
 * Execute media download and conversion
 * Tries yt-dlp first (auto-downloading binary if missing), then falls back to ytdl-core pipeline
 * @param {object} options
 * @param {string} options.url - YouTube URL
 * @param {string} options.format - "mp3" or "mp4"
 * @param {string} [options.quality="best"] - "best", "1080", "720", "480", "360", "240", "144"
 * @param {string} options.outputDir - Target directory for file
 * @param {function} [options.onProgress] - (percent: number) => void
 * @param {function} [options.onStageChange] - (stage: string) => void
 * @returns {Promise<{ filePath: string, filename: string, metadata: object }>}
 */
async function processMediaDownload({ url, format = 'mp3', quality = 'best', outputDir, onProgress, onStageChange }) {
  if (onStageChange) onStageChange('fetching_metadata');

  const metadata = await getVideoMetadata(url, format);
  const filename = metadata.targetFilename;
  const platform = metadata.platform || detectPlatform(url) || { id: 'generic', name: 'Web', tag: '[Web]' };
  const outputPath = path.join(outputDir, filename);

  if (onStageChange) onStageChange('downloading');

  let ytDlpPath = await getYtDlpPath();

  if (!ytDlpPath) {
    try {
      console.log('⚡ yt-dlp not detected. Initiating automatic one-time setup...');
      ytDlpPath = await downloadYtDlp();
    } catch (dlErr) {
      console.warn('Could not auto-download yt-dlp:', dlErr.message);
    }
  }

  await ensureFfmpegAvailable();

  let lastYtDlpError = null;

  // Strategy 1: Use yt-dlp CLI with platform-specific argument builder
  if (ytDlpPath) {
    try {
      const resultPath = await downloadWithYtDlp({
        url,
        format,
        quality,
        outputDir,
        targetFilename: filename,
        platform,
        onProgress
      });
      return { filePath: resultPath, filename, metadata, platform };
    } catch (ytDlpError) {
      lastYtDlpError = ytDlpError;
      console.warn(`${platform.name} extraction failed with yt-dlp:`, ytDlpError.message);
    }
  }

  // Strategy 2: Fallback to Node.js ytdl-core ONLY for YouTube
  if (platform.id === 'youtube' && ytdl) {
    try {
      await downloadWithYtdlCore({
        url,
        format,
        quality,
        outputPath,
        onProgress
      });
      return { filePath: outputPath, filename, metadata, platform };
    } catch (ytdlError) {
      if (lastYtDlpError) {
        throw new Error(`Media download failed: ${lastYtDlpError.message}`);
      }
      throw ytdlError;
    }
  }

  throw new Error(`Media download failed: ${lastYtDlpError ? lastYtDlpError.message : 'Media stream not accessible'}`);
}

module.exports = {
  processMediaDownload,
  downloadWithYtDlp,
  downloadWithYtdlCore,
  configureFfmpeg
};

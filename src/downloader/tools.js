/**
 * Binary Tools Discovery & Management (FFmpeg and yt-dlp)
 * Resolves local project binaries, npm installer packages, and system PATH executables.
 * Supports auto-downloading standalone yt-dlp binary and auto-installing FFmpeg.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const BIN_DIR = path.join(PROJECT_ROOT, 'bin');

// Ensure bin directory exists
if (!fs.existsSync(BIN_DIR)) {
  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  } catch (e) {}
}

/**
 * Run a command safely without shell to locate a binary in system PATH
 * @param {string} cmd
 * @returns {Promise<string|null>}
 */
function findBinaryInPath(cmd) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? 'where.exe' : 'which';

    const proc = spawn(checkCmd, [cmd], {
      shell: false,
      windowsHide: true
    });

    let stdout = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        const lines = stdout.trim().split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
        if (lines.length > 0 && fs.existsSync(lines[0])) {
          return resolve(lines[0]);
        }
      }
      resolve(null);
    });

    proc.on('error', () => resolve(null));
  });
}

/**
 * Check known local, npm, and standard filesystem locations for a binary
 * @param {string} name - e.g. "ffmpeg" or "yt-dlp"
 * @returns {string|null}
 */
function findKnownLocations(name) {
  const isWin = process.platform === 'win32';
  const exeName = isWin && !name.toLowerCase().endsWith('.exe') ? `${name}.exe` : name;

  // 1. Check local project bin/ folder
  const localBin = path.join(BIN_DIR, exeName);
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // 2. Check direct node_modules binary locations for ffmpeg
  if (name.includes('ffmpeg')) {
    const nodeModulesCandidates = [
      path.join(PROJECT_ROOT, 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
      path.join(PROJECT_ROOT, 'node_modules', '@ffmpeg-installer', 'win32-ia32', 'ffmpeg.exe'),
      path.join(PROJECT_ROOT, 'node_modules', '@ffmpeg-installer', 'darwin-x64', 'ffmpeg'),
      path.join(PROJECT_ROOT, 'node_modules', '@ffmpeg-installer', 'darwin-arm64', 'ffmpeg'),
      path.join(PROJECT_ROOT, 'node_modules', '@ffmpeg-installer', 'linux-x64', 'ffmpeg'),
      path.join(PROJECT_ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
      path.join(PROJECT_ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg')
    ];

    for (const cand of nodeModulesCandidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }

    try {
      const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
      if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
        return ffmpegInstaller.path;
      }
    } catch (e) {}

    try {
      const ffmpegStatic = require('ffmpeg-static');
      if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        return ffmpegStatic;
      }
    } catch (e) {}
  }

  // 3. Check @ffprobe-installer/ffprobe if looking for ffprobe
  if (name.includes('ffprobe')) {
    try {
      const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
      if (ffprobeInstaller && ffprobeInstaller.path && fs.existsSync(ffprobeInstaller.path)) {
        return ffprobeInstaller.path;
      }
    } catch (e) {}
  }

  // 4. Check common Windows installation paths
  if (isWin) {
    const userProfile = process.env.USERPROFILE || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const programData = process.env.ProgramData || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const candidates = [
      path.join(localAppData, 'Microsoft', 'WinGet', 'Links', exeName),
      path.join(programData, 'chocolatey', 'bin', exeName),
      path.join('C:\\', 'ffmpeg', 'bin', exeName),
      path.join(programFiles, 'ffmpeg', 'bin', exeName),
      path.join(programFilesX86, 'ffmpeg', 'bin', exeName),
      path.join(userProfile, 'scoop', 'shims', exeName),
      path.join(localAppData, 'Programs', 'Python', 'Python313', 'Scripts', exeName),
      path.join(localAppData, 'Programs', 'Python', 'Python312', 'Scripts', exeName),
      path.join(localAppData, 'Programs', 'Python', 'Python311', 'Scripts', exeName),
      path.join(localAppData, 'Programs', 'Python', 'Python310', 'Scripts', exeName),
      path.join(userProfile, 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts', exeName),
      path.join(userProfile, 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts', exeName),
      path.join(userProfile, 'AppData', 'Roaming', 'Python', 'Python311', 'Scripts', exeName)
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Resolve an executable binary path
 * @param {string} name
 * @returns {Promise<string|null>}
 */
async function resolveBinary(name) {
  // Check known locations first
  const known = findKnownLocations(name);
  if (known) return known;

  // Check system PATH
  const inPath = await findBinaryInPath(name);
  if (inPath) return inPath;

  return null;
}

/**
 * Test whether a binary can actually be executed on the current OS
 * @param {string} binPath
 * @returns {Promise<boolean>}
 */
function testBinaryExecutable(binPath) {
  return new Promise((resolve) => {
    if (!binPath || !fs.existsSync(binPath)) return resolve(false);
    try {
      const proc = spawn(binPath, ['--version'], {
        shell: false,
        windowsHide: true
      });
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Resolve FFmpeg executable
 * @returns {Promise<string|null>}
 */
async function getFfmpegPath() {
  return await resolveBinary('ffmpeg');
}

/**
 * Resolve yt-dlp executable and verify it is truly runnable
 * @returns {Promise<string|null>}
 */
async function getYtDlpPath() {
  const candidate = await resolveBinary('yt-dlp');
  if (candidate) {
    const isWorking = await testBinaryExecutable(candidate);
    if (isWorking) return candidate;
    console.warn(`⚠️ Detected yt-dlp binary at "${candidate}" cannot execute (e.g. missing python3). Purging broken file to download standalone binary...`);
    if (candidate.startsWith(BIN_DIR)) {
      try { fs.unlinkSync(candidate); } catch (e) {}
    }
  }
  return null;
}

/**
 * Automatically install @ffmpeg-installer/ffmpeg via npm
 * @returns {Promise<boolean>}
 */
function installFfmpegPackage() {
  return new Promise((resolve) => {
    try {
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'cmd.exe' : 'npm';
      const args = isWin
        ? ['/c', 'npm', 'install', '@ffmpeg-installer/ffmpeg@^1.1.0', '--no-save']
        : ['install', '@ffmpeg-installer/ffmpeg@^1.1.0', '--no-save'];

      console.log('📦 Installing @ffmpeg-installer/ffmpeg package in background...');
      const proc = spawn(cmd, args, {
        cwd: PROJECT_ROOT,
        shell: false,
        windowsHide: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('✅ @ffmpeg-installer/ffmpeg installed successfully.');
          resolve(true);
        } else {
          console.warn(`npm install exited with code ${code}`);
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        console.warn('Failed spawning npm:', err.message);
        resolve(false);
      });
    } catch (e) {
      console.warn('Could not launch npm installer:', e.message);
      resolve(false);
    }
  });
}

/**
 * Ensure FFmpeg is available; attempts npm auto-install if missing
 * @returns {Promise<string|null>}
 */
async function ensureFfmpegAvailable() {
  try {
    let ffmpegPath = await getFfmpegPath();
    if (ffmpegPath) return ffmpegPath;

    // Try auto-installing @ffmpeg-installer/ffmpeg
    const installed = await installFfmpegPackage();
    if (installed) {
      ffmpegPath = await getFfmpegPath();
    }
    return ffmpegPath;
  } catch (e) {
    return null;
  }
}

/**
 * Download a file from URL following redirects (301, 302, 307, 308)
 * @param {string} fileUrl
 * @param {string} destPath
 * @param {function} [onProgress]
 * @returns {Promise<void>}
 */
function downloadFile(fileUrl, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(fileUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, fileUrl).toString();
        }
        return downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;

      const tmpPath = `${destPath}.tmp_${Date.now()}`;
      const fileStream = fs.createWriteStream(tmpPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0 && onProgress) {
          const percent = Math.min(Math.round((downloadedBytes / totalBytes) * 100), 100);
          onProgress(percent, downloadedBytes, totalBytes);
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => {
          try {
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath);
            }
            fs.renameSync(tmpPath, destPath);

            // Set executable permission on Unix
            if (process.platform !== 'win32') {
              try { fs.chmodSync(destPath, 0o755); } catch (e) {}
            }

            resolve();
          } catch (renameErr) {
            reject(renameErr);
          }
        });
      });

      fileStream.on('error', (err) => {
        try { fs.unlinkSync(tmpPath); } catch (e) {}
        reject(err);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Automatically download standalone yt-dlp binary for current OS
 * @param {function} [onProgress]
 * @returns {Promise<string>} Path to downloaded binary
 */
async function downloadYtDlp(onProgress) {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isArm = process.arch === 'arm64' || process.arch === 'aarch64';

  let downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
  let targetName = 'yt-dlp';

  if (isWin) {
    downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    targetName = 'yt-dlp.exe';
  } else if (isMac) {
    downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    targetName = 'yt-dlp';
  } else if (isArm) {
    downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64';
    targetName = 'yt-dlp';
  } else {
    downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
    targetName = 'yt-dlp';
  }

  const targetPath = path.join(BIN_DIR, targetName);

  console.log(`⬇️ Downloading official standalone yt-dlp binary from: ${downloadUrl}`);
  await downloadFile(downloadUrl, targetPath, onProgress);
  console.log(`✅ yt-dlp successfully installed to: ${targetPath}`);

  return targetPath;
}

/**
 * Check and run self-update for yt-dlp to pick up latest YouTube cipher fixes
 * @returns {Promise<boolean>} True if updated or checked successfully
 */
async function updateYtDlp() {
  const ytDlpPath = await getYtDlpPath();
  if (!ytDlpPath) return false;

  return new Promise((resolve) => {
    console.log('🔄 Checking for yt-dlp engine updates...');
    const proc = spawn(ytDlpPath, ['--update-to', 'nightly'], {
      shell: false,
      windowsHide: true
    });

    let output = '';
    proc.stdout.on('data', chunk => { output += chunk.toString(); });
    proc.stderr.on('data', chunk => { output += chunk.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('✅ yt-dlp update check completed.');
        resolve(true);
      } else {
        // Fallback to standard -U
        const fallbackProc = spawn(ytDlpPath, ['-U'], {
          shell: false,
          windowsHide: true
        });
        fallbackProc.on('close', (c) => {
          resolve(c === 0);
        });
        fallbackProc.on('error', () => resolve(false));
      }
    });

    proc.on('error', () => resolve(false));
  });
}

/**
 * Get comprehensive diagnostic status of media tools
 * @returns {Promise<object>}
 */
async function getToolsStatus() {
  const ffmpegPath = await getFfmpegPath();
  const ytDlpPath = await getYtDlpPath();

  return {
    ffmpeg: {
      available: !!ffmpegPath,
      path: ffmpegPath
    },
    ytDlp: {
      available: !!ytDlpPath,
      path: ytDlpPath
    },
    platform: process.platform,
    binDir: BIN_DIR
  };
}

module.exports = {
  BIN_DIR,
  findBinaryInPath,
  findKnownLocations,
  resolveBinary,
  getFfmpegPath,
  getYtDlpPath,
  downloadFile,
  downloadYtDlp,
  updateYtDlp,
  installFfmpegPackage,
  ensureFfmpegAvailable,
  getToolsStatus
};

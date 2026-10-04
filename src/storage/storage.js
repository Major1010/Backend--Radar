/**
 * Temporary Storage and File Cleanup Manager
 * Handles auto-purging temporary downloads, job directory cleanup,
 * and immediate session exit deletion.
 */

const fs = require('fs');
const path = require('path');

const TEMP_DIR = path.join(__dirname, '..', '..', '..', 'temp_downloads');
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes retention max for temporary files

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  } catch (e) {}
}

// Map of file paths to cleanup timeouts
const activeFileTimeouts = new Map();

/**
 * Get or create output directory for a specific job
 * @param {string} jobId
 * @returns {string} Directory path
 */
function getJobOutputDir(jobId) {
  const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.join(TEMP_DIR, safeJobId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Delete a specific job's directory and all its files immediately
 * @param {string} jobId
 */
function deleteJobDir(jobId) {
  if (!jobId) return;
  const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.join(TEMP_DIR, safeJobId);
  deleteFile(dir);
}

/**
 * Schedule automatic file deletion after TTL (or custom delay)
 * @param {string} filePath
 * @param {number} [ttlMs=DEFAULT_TTL_MS]
 */
function scheduleFileCleanup(filePath, ttlMs = DEFAULT_TTL_MS) {
  if (activeFileTimeouts.has(filePath)) {
    clearTimeout(activeFileTimeouts.get(filePath));
  }

  const timeout = setTimeout(() => {
    deleteFile(filePath);
    activeFileTimeouts.delete(filePath);
  }, ttlMs);

  activeFileTimeouts.set(filePath, timeout);
}

/**
 * Delete a specific file or directory safely
 * @param {string} targetPath
 */
function deleteFile(targetPath) {
  try {
    if (!targetPath) return;
    const resolved = path.resolve(targetPath);
    // Security check: only allow deletion within TEMP_DIR
    if (!resolved.startsWith(path.resolve(TEMP_DIR))) {
      console.warn('Attempted to delete file outside temp directory:', resolved);
      return;
    }

    if (fs.existsSync(resolved)) {
      const stats = fs.statSync(resolved);
      if (stats.isDirectory()) {
        fs.rmSync(resolved, { recursive: true, force: true });
      } else {
        fs.unlinkSync(resolved);
        // Also remove parent folder if empty
        const parentDir = path.dirname(resolved);
        if (parentDir !== path.resolve(TEMP_DIR) && fs.existsSync(parentDir)) {
          const files = fs.readdirSync(parentDir);
          if (files.length === 0) {
            fs.rmdirSync(parentDir);
          }
        }
      }
    }
  } catch (err) {
    // Suppress locking errors during deletion retries
    if (err.code !== 'EBUSY' && err.code !== 'EPERM') {
      console.error(`Failed to delete temporary file ${targetPath}:`, err.message);
    }
  }
}

/**
 * Clean up all stale temporary files older than TTL
 */
function purgeStaleFiles() {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    const now = Date.now();
    const entries = fs.readdirSync(TEMP_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === 'desktop.ini') continue;
      const fullPath = path.join(TEMP_DIR, entry.name);
      try {
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > DEFAULT_TTL_MS) {
          deleteFile(fullPath);
        }
      } catch (e) {}
    }
  } catch (err) {
    console.error('Error during stale file cleanup:', err.message);
  }
}

/**
 * Purge all temporary job files unconditionally (e.g. on server start/exit)
 */
function purgeAllTempFiles() {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    const entries = fs.readdirSync(TEMP_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'desktop.ini') continue;
      const fullPath = path.join(TEMP_DIR, entry.name);
      deleteFile(fullPath);
    }
    console.log('🧹 Purged temporary downloads cache.');
  } catch (err) {
    console.warn('Could not purge all temp files:', err.message);
  }
}

// Run periodic cleanup every 1 minute
setInterval(purgeStaleFiles, 60 * 1000);

module.exports = {
  TEMP_DIR,
  getJobOutputDir,
  deleteJobDir,
  scheduleFileCleanup,
  deleteFile,
  purgeStaleFiles,
  purgeAllTempFiles
};

/**
 * Cleanup Utility for Legacy & Duplicate Files
 * Removes obsolete top-level folders that have been migrated to frontend/ and backend/
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

const PATHS_TO_REMOVE = [
  // Legacy root folders migrated to frontend/ and backend/
  path.join(ROOT_DIR, 'public'),
  path.join(ROOT_DIR, 'scripts'),
  path.join(ROOT_DIR, 'tests'),

  // Legacy unorganized backend folders migrated to backend/src/
  path.join(ROOT_DIR, 'backend', 'api'),
  path.join(ROOT_DIR, 'backend', 'downloader'),
  path.join(ROOT_DIR, 'backend', 'jobs'),
  path.join(ROOT_DIR, 'backend', 'storage'),

  // Redundant loose asset in frontend root
  path.join(ROOT_DIR, 'frontend', 'monster_energy.png')
];

console.log('🧹 Starting cleanup of legacy and duplicate files...');

PATHS_TO_REMOVE.forEach((targetPath) => {
  if (fs.existsSync(targetPath)) {
    try {
      const stats = fs.statSync(targetPath);
      if (stats.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        console.log(`🗑️ Removed directory: ${path.relative(ROOT_DIR, targetPath)}`);
      } else {
        fs.unlinkSync(targetPath);
        console.log(`🗑️ Removed file: ${path.relative(ROOT_DIR, targetPath)}`);
      }
    } catch (err) {
      console.warn(`⚠️ Could not remove ${targetPath}:`, err.message);
    }
  } else {
    console.log(`✨ Already clean: ${path.relative(ROOT_DIR, targetPath)}`);
  }
});

console.log('✅ Legacy cleanup finished.');

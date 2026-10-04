/**
 * Frontend Asset Synchronizer & Initializer
 * Copies and organizes styles, scripts, assets, and html into standard frontend directories.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OLD_PUBLIC = path.join(PROJECT_ROOT, 'public');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');
const FRONTEND_PUBLIC = path.join(FRONTEND_DIR, 'public');
const FRONTEND_SRC = path.join(FRONTEND_DIR, 'src');

const DIRS_TO_CREATE = [
  FRONTEND_PUBLIC,
  path.join(FRONTEND_SRC, 'styles'),
  path.join(FRONTEND_SRC, 'scripts'),
  path.join(FRONTEND_SRC, 'assets'),
  path.join(FRONTEND_SRC, 'components'),
  path.join(FRONTEND_SRC, 'pages')
];

DIRS_TO_CREATE.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Copy files from root public to frontend/public and frontend/src
if (fs.existsSync(OLD_PUBLIC)) {
  const files = fs.readdirSync(OLD_PUBLIC);
  for (const file of files) {
    const srcPath = path.join(OLD_PUBLIC, file);
    if (fs.statSync(srcPath).isFile()) {
      // 1. Copy to frontend/public/
      const destPublic = path.join(FRONTEND_PUBLIC, file);
      fs.copyFileSync(srcPath, destPublic);
      console.log(`Synced to frontend/public/: ${file}`);

      // 2. Also mirror into modular frontend/src/ subdirectories
      if (file.endsWith('.css')) {
        fs.copyFileSync(srcPath, path.join(FRONTEND_SRC, 'styles', file));
      } else if (file.endsWith('.js')) {
        fs.copyFileSync(srcPath, path.join(FRONTEND_SRC, 'scripts', file));
      } else if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.svg') || file.endsWith('.ico')) {
        fs.copyFileSync(srcPath, path.join(FRONTEND_SRC, 'assets', file));
      } else if (file.endsWith('.html')) {
        fs.copyFileSync(srcPath, path.join(FRONTEND_SRC, 'pages', file));
      }
    }
  }
}

console.log('✅ Frontend assets sync complete.');

/**
 * YouTube Media Downloader - Main Application Server
 */

// Global crash prevention guards
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Uncaught Exception Guard]:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [Unhandled Rejection Guard]:', reason instanceof Error ? reason.message : reason);
});

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const apiRoutes = require('./routes/routes');
const { getToolsStatus } = require('./downloader/tools');
const { purgeAllTempFiles } = require('./storage/storage');
const { makePngTransparent } = require('./storage/pngTransparent');

// Frontend directories
const FRONTEND_DIR = path.resolve(__dirname, '..', '..', 'frontend');
const FRONTEND_PUBLIC_DIR = path.join(FRONTEND_DIR, 'public');
const FRONTEND_SRC_DIR = path.join(FRONTEND_DIR, 'src');

const USER_UPLOADED_LOGO = 'C:/Users/acer/.gemini/antigravity-ide/brain/38fc673e-54e1-4565-a521-878a0e2a3246/.user_uploaded/media_1790971114693.png';
const PUBLIC_LOGO_PATH = path.join(FRONTEND_PUBLIC_DIR, 'monster_energy.png');

try {
  if (fs.existsSync(USER_UPLOADED_LOGO)) {
    makePngTransparent(USER_UPLOADED_LOGO, PUBLIC_LOGO_PATH);
  }
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Parsing Middlewares
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Explicit route for Monster Energy logo
app.get('/monster_energy.png', (req, res) => {
  if (fs.existsSync(PUBLIC_LOGO_PATH)) {
    return res.sendFile(PUBLIC_LOGO_PATH);
  }
  if (fs.existsSync(USER_UPLOADED_LOGO)) {
    return res.sendFile(USER_UPLOADED_LOGO);
  }
  res.status(404).send('Logo not found');
});

// Serve static frontend files with etag and client caching (disable auto-serving index.html so / routes to landing.html)
app.use(express.static(FRONTEND_PUBLIC_DIR, {
  maxAge: '2h',
  etag: true,
  index: false
}));

// Mount API routes
app.use('/api', apiRoutes);

// Root: serve the welcome / landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_PUBLIC_DIR, 'landing.html'));
});

// /app: serve the main application (index.html)
app.get('/app', (req, res) => {
  res.sendFile(path.join(FRONTEND_PUBLIC_DIR, 'index.html'));
});

// Fallback: catch-all for SPA navigation within /app/*
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  // Any unknown route falls back to landing page
  res.sendFile(path.join(FRONTEND_PUBLIC_DIR, 'landing.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'An internal server error occurred. Please try again later.'
  });
});

const server = app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`🚀 YouTube Media Downloader is running!`);
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  console.log(`🎵 Output Format Support: MP3 (Audio) | MP4 (Video)`);

  try {
    const status = await getToolsStatus();
    console.log(`🎬 yt-dlp Engine: ${status.ytDlp.available ? '🟢 Ready (' + path.basename(status.ytDlp.path) + ')' : '🟡 Not found (Run: npm run setup-tools)'}`);
    console.log(`🎼 FFmpeg Binary: ${status.ffmpeg.available ? '🟢 Ready' : '🟡 Not found (Run: npm install @ffmpeg-installer/ffmpeg)'}`);
  } catch (e) {
    // Ignore diagnostic error
  }

  console.log(`====================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`\n⚠️ Port ${PORT} is already in use by a running instance of YouTube Media Downloader.`);
    console.warn(`💡 The server is ALREADY actively running at: http://localhost:${PORT}\n`);
  } else {
    console.error('Server error:', err);
  }
});

// Auto-clean any legacy redundant directories if present
try {
  require('../scripts/clean-legacy');
} catch (e) {}

// Purge any stale leftover temp files from prior runs on server boot
purgeAllTempFiles();

// Graceful cleanup on server exit (Ctrl+C / SIGINT / SIGTERM)
const gracefulShutdown = () => {
  try {
    purgeAllTempFiles();
  } catch (e) {}
  process.exit(0);
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = app;

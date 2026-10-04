/**
 * API Router for YouTube Media Downloader
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { parseBatchUrls } = require('../downloader/extractor');
const { queue } = require('../jobs/queue');
const { scheduleFileCleanup } = require('../storage/storage');

const router = express.Router();
const { makePngTransparent } = require('../storage/pngTransparent');

// Ensure Monster Energy logo is synced to transparent PNG in frontend/public directory
try {
  const uploadedLogo = 'C:/Users/acer/.gemini/antigravity-ide/brain/38fc673e-54e1-4565-a521-878a0e2a3246/.user_uploaded/media_1790971114693.png';
  const publicLogo = path.join(__dirname, '../../../frontend/public/monster_energy.png');
  if (fs.existsSync(uploadedLogo) && !fs.existsSync(publicLogo)) {
    makePngTransparent(uploadedLogo, publicLogo);
  }
} catch (e) {}

/**
 * POST /api/jobs
 * Accepts a single URL or batch of URLs with format ("mp3" or "mp4")
 */
router.post('/jobs', (req, res) => {
  const { urls, format = 'mp3', quality = 'best' } = req.body;

  if (!urls) {
    return res.status(400).json({ error: 'Please provide one or more YouTube URLs.' });
  }

  const normalizedFormat = (format && typeof format === 'string' && format.toLowerCase() === 'mp4') ? 'mp4' : 'mp3';
  const allowedQualities = ['best', '1080', '720', '480', '360', '240', '144'];
  const normalizedQuality = (quality && allowedQualities.includes(String(quality).toLowerCase()))
    ? String(quality).toLowerCase()
    : 'best';

  // Handle both array of URLs or multi-line string
  const textInput = Array.isArray(urls) ? urls.join('\n') : String(urls);
  const parsedItems = parseBatchUrls(textInput);

  if (parsedItems.length === 0) {
    return res.status(400).json({ error: 'No valid URLs found in the input.' });
  }

  const createdJobs = [];
  const invalidItems = [];

  for (const item of parsedItems) {
    if (item.isValid && item.normalizedUrl) {
      const job = queue.createJob({
        url: item.normalizedUrl,
        format: normalizedFormat,
        quality: normalizedQuality,
        videoId: item.videoId,
        platform: item.platform
      });
      createdJobs.push(job);
    } else {
      invalidItems.push({
        url: item.originalUrl,
        error: item.error || 'Invalid media URL'
      });
    }
  }

  return res.status(201).json({
    message: `Created ${createdJobs.length} download job(s).`,
    jobs: createdJobs,
    invalid: invalidItems
  });
});

/**
 * GET /api/jobs
 * Poll status of jobs by comma-separated IDs: /api/jobs?ids=id1,id2
 */
router.get('/jobs', (req, res) => {
  const { ids } = req.query;

  if (ids) {
    const idList = ids.split(',').map(s => s.trim()).filter(Boolean);
    const jobs = queue.getJobsByIds(idList);
    return res.json({ jobs });
  }

  return res.json({ jobs: queue.getAllJobs() });
});

/**
 * GET /api/jobs/:id
 * Get single job status
 */
router.get('/jobs/:id', (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }
  return res.json({ job });
});

/**
 * GET /api/download/:id
 * Stream the completed MP3 or MP4 file to user's browser
 */
router.get('/download/:id', (req, res) => {
  const jobState = queue.jobs.get(req.params.id);
  if (!jobState) {
    return res.status(404).json({ error: 'Download job not found or expired.' });
  }

  if (jobState.status !== 'completed' || !jobState.filePath) {
    return res.status(400).json({ error: 'This file has not finished processing yet.' });
  }

  const filePath = jobState.filePath;
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'The requested file has expired or was removed.' });
  }

  const filename = jobState.filename || path.basename(filePath);
  const isMp4 = jobState.format === 'mp4';
  const contentType = isMp4 ? 'video/mp4' : 'audio/mpeg';

  const stat = fs.statSync(filePath);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  });

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);

  res.on('finish', () => {
    // Client successfully finished downloading file; schedule rapid cleanup after 60s
    scheduleFileCleanup(filePath, 60 * 1000);
  });

  readStream.on('error', (err) => {
    console.error('Error streaming file to client:', err);
    if (!res.headersSent) {
      res.status(500).end();
    }
  });
});

/**
 * POST /api/session/leave
 * Triggered on window unload/pagehide when user leaves the website
 */
router.post('/session/leave', (req, res) => {
  try {
    let jobIds = [];
    if (req.body) {
      if (Array.isArray(req.body.jobIds)) {
        jobIds = req.body.jobIds;
      } else if (typeof req.body === 'string') {
        const parsed = JSON.parse(req.body);
        jobIds = parsed.jobIds || [];
      }
    }
    if (jobIds.length > 0) {
      queue.cancelAndCleanJobs(jobIds);
    }
  } catch (e) {}
  return res.status(204).end();
});

/**
 * POST /api/jobs/clear
 * Clear all or specified jobs and their temp files
 */
router.post('/jobs/clear', (req, res) => {
  try {
    const { jobIds } = req.body || {};
    if (Array.isArray(jobIds) && jobIds.length > 0) {
      queue.cancelAndCleanJobs(jobIds);
    } else {
      queue.clearAllJobs();
    }
    return res.json({ success: true, message: 'Queue and temporary files removed.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/health
 * System health & status check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeWorkers: queue.activeWorkers,
    queueLength: queue.queue.length,
    totalJobs: queue.jobs.size
  });
});

/**
 * GET /api/system-status
 * Check media tools availability (ffmpeg, yt-dlp)
 */
router.get('/system-status', async (req, res) => {
  try {
    const { getToolsStatus } = require('../downloader/tools');
    const tools = await getToolsStatus();
    res.json({
      status: 'ok',
      tools
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

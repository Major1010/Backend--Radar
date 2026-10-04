/**
 * Job Queue & Concurrency Controller
 * Manages download tasks, background execution, and progress tracking.
 */

const { EventEmitter } = require('events');
const { processMediaDownload } = require('../downloader/engine');
const { getJobOutputDir, scheduleFileCleanup, deleteJobDir } = require('../storage/storage');
const { detectPlatform } = require('../downloader/platforms');

class DownloadQueue extends EventEmitter {
  constructor(concurrency = 3) {
    super();
    this.concurrency = concurrency;
    this.jobs = new Map(); // jobId -> Job object
    this.queue = []; // Array of jobIds waiting to run
    this.activeWorkers = 0;
  }

  /**
   * Create and enqueue a new download job
   * @param {object} params
   * @param {string} params.url - Media URL
   * @param {string} params.format - "mp3" or "mp4"
   * @param {string} [params.quality="best"] - "best", "1080", "720", "480", "360", "240", "144"
   * @param {string} [params.videoId] - Video ID if applicable
   * @param {object} [params.platform] - Platform metadata
   * @returns {object} Job representation
   */
  createJob({ url, format = 'mp3', quality = 'best', videoId = null, platform = null }) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const detected = platform || detectPlatform(url) || { id: 'generic', name: 'Web', tag: '[Web]', color: '#00f3ff', icon: 'globe' };
    const job = {
      id: jobId,
      url,
      format: format.toLowerCase(),
      quality: String(quality || 'best').toLowerCase(),
      videoId,
      platform: {
        id: detected.id,
        name: detected.name,
        tag: detected.tag,
        color: detected.color || '#00f3ff',
        icon: detected.icon || 'globe'
      },
      status: 'queued', // queued | processing | downloading | completed | failed
      stage: 'queued', // queued | fetching_metadata | downloading | converting | completed | failed
      progress: 0,
      metadata: null,
      filename: null,
      filePath: null,
      fileSize: 0,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    this.emit('jobAdded', job);

    // Trigger queue processing
    process.nextTick(() => this.processNext());

    return this.getJobPublicState(job);
  }

  /**
   * Get public sanitised state of a job (safe for client)
   * @param {object|string} jobOrId
   * @returns {object|null}
   */
  getJob(jobOrId) {
    const job = typeof jobOrId === 'string' ? this.jobs.get(jobOrId) : jobOrId;
    if (!job) return null;
    return this.getJobPublicState(job);
  }

  /**
   * Filter and format job object for API responses
   * @param {object} job
   * @returns {object}
   */
  getJobPublicState(job) {
    return {
      id: job.id,
      url: job.url,
      format: job.format,
      quality: job.quality,
      videoId: job.videoId,
      platform: job.platform || null,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      title: job.metadata ? job.metadata.title : null,
      author: job.metadata ? job.metadata.author : null,
      duration: job.metadata ? job.metadata.formattedDuration : null,
      thumbnail: job.metadata ? job.metadata.thumbnail : null,
      filename: job.filename,
      downloadUrl: job.status === 'completed' ? `/api/download/${job.id}` : null,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    };
  }

  /**
   * Get all jobs
   * @returns {Array<object>}
   */
  getAllJobs() {
    return Array.from(this.jobs.values()).map(job => this.getJobPublicState(job));
  }

  /**
   * Get multiple jobs by list of IDs
   * @param {Array<string>} ids
   * @returns {Array<object>}
   */
  getJobsByIds(ids) {
    if (!Array.isArray(ids)) return [];
    return ids
      .map(id => this.jobs.get(id))
      .filter(Boolean)
      .map(job => this.getJobPublicState(job));
  }

  /**
   * Run the next queued job if concurrency allows
   */
  async processNext() {
    if (this.activeWorkers >= this.concurrency) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    const jobId = this.queue.shift();
    const job = this.jobs.get(jobId);

    if (!job || job.status === 'cancelled') {
      return this.processNext();
    }

    this.activeWorkers++;
    job.status = 'processing';
    job.startedAt = new Date().toISOString();
    this.emit('jobUpdated', job);

    const outputDir = getJobOutputDir(job.id);

    try {
      const result = await processMediaDownload({
        url: job.url,
        format: job.format,
        quality: job.quality,
        outputDir: outputDir,
        onStageChange: (stage) => {
          job.stage = stage;
          if (stage === 'downloading') {
            job.status = 'downloading';
          }
          this.emit('jobUpdated', job);
        },
        onProgress: (percent) => {
          job.progress = Math.min(Math.max(0, Math.round(percent)), 100);
          this.emit('jobUpdated', job);
        }
      });

      job.status = 'completed';
      job.stage = 'completed';
      job.progress = 100;
      job.filename = result.filename;
      job.filePath = result.filePath;
      job.metadata = result.metadata;
      if (result.metadata && result.metadata.platform) {
        job.platform = result.metadata.platform;
      }
      job.completedAt = new Date().toISOString();

      // Schedule auto-cleanup after 30 mins
      scheduleFileCleanup(result.filePath);

      this.emit('jobCompleted', job);
    } catch (err) {
      console.error(`Job ${job.id} failed:`, err);
      job.status = 'failed';
      job.stage = 'failed';
      job.progress = 0;
      job.error = this.humanizeError(err.message);
      job.completedAt = new Date().toISOString();
      // Clean up any partial files from failed attempt immediately
      deleteJobDir(job.id);
      this.emit('jobFailed', job);
    } finally {
      this.activeWorkers--;
      this.emit('jobUpdated', job);
      // Process next waiting job
      this.processNext();
    }
  }

  /**
   * Convert raw technical error messages into clear, friendly messages
   * @param {string} rawMsg
   * @returns {string}
   */
  humanizeError(rawMsg) {
    if (!rawMsg) return 'Unable to process this video. Please check the URL and try again.';
    const msg = rawMsg.toLowerCase();

    if (msg.includes('cannot find ffmpeg') || (msg.includes('ffmpeg') && msg.includes('not found')) || msg.includes('einval')) {
      return 'FFmpeg is required for MP3 conversion. Please run "npm install" in your terminal, or switch output format to MP4.';
    }
    if (msg.includes('playable formats') || msg.includes('no playable formats')) {
      return 'YouTube restricted access to this video stream. Please run "npm run setup-tools" to enable yt-dlp.';
    }
    if (msg.includes('unavailable') || msg.includes('private') || msg.includes('deleted')) {
      return 'This video is private, removed, or unavailable on YouTube.';
    }
    if (msg.includes('age') || msg.includes('sign in')) {
      return 'This video requires age verification or sign-in and cannot be downloaded.';
    }
    if (msg.includes('region') || msg.includes('country') || msg.includes('geo')) {
      return 'This video is geographically restricted in the server region.';
    }
    if (msg.includes('copyright') || msg.includes('blocked')) {
      return 'This video is blocked due to content restrictions.';
    }
    if (msg.includes('conversion') || msg.includes('audio conversion')) {
      return 'Failed to convert audio/video format. Ensure FFmpeg is available.';
    }
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('etimedout')) {
      return 'Network connection timed out. Please try again.';
    }
    if (msg.includes('416') || msg.includes('range not satisfiable')) {
      return 'The streaming server rejected byte range chunks. The stream parameters have been optimized—please retry your download now.';
    }
    return rawMsg;
  }

  /**
   * Cancel and clean up temporary files for specified jobs
   * @param {Array<string>} jobIds
   */
  cancelAndCleanJobs(jobIds) {
    if (!Array.isArray(jobIds)) return;
    for (const id of jobIds) {
      const job = this.jobs.get(id);
      if (job) {
        job.status = 'cancelled';
        job.stage = 'cancelled';
      }
      const qIdx = this.queue.indexOf(id);
      if (qIdx !== -1) {
        this.queue.splice(qIdx, 1);
      }
      deleteJobDir(id);
      this.jobs.delete(id);
    }
  }

  /**
   * Clear all jobs and delete their physical directories from disk
   */
  clearAllJobs() {
    this.queue = [];
    for (const [id] of this.jobs.entries()) {
      deleteJobDir(id);
    }
    this.jobs.clear();
  }
}

// Export singleton instance with 3 concurrent workers
const globalQueue = new DownloadQueue(3);

module.exports = {
  DownloadQueue,
  queue: globalQueue
};

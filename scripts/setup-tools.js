/**
 * Setup Script for Media Processing Binaries (yt-dlp & FFmpeg)
 * Run via: npm run setup-tools
 */

const { getToolsStatus, downloadYtDlp, installFfmpegPackage } = require('../src/downloader/tools');

async function main() {
  console.log('====================================================');
  console.log('🔧 YouTube Media Downloader - Environment Tool Setup');
  console.log('====================================================\n');

  console.log('🔍 Checking existing tools...');
  let status = await getToolsStatus();

  // 1. Check & Setup FFmpeg
  if (status.ffmpeg.available) {
    console.log(`✅ FFmpeg found: ${status.ffmpeg.path}`);
  } else {
    console.log('⚠️ FFmpeg was not detected. Installing @ffmpeg-installer/ffmpeg...');
    const installed = await installFfmpegPackage();
    if (installed) {
      console.log('✅ FFmpeg installed successfully.');
    } else {
      console.log('⚠️ Could not automatically install FFmpeg via npm.');
      console.log('👉 Please run manually: npm install @ffmpeg-installer/ffmpeg');
      console.log('   Or via Windows Winget: winget install Gyan.FFmpeg\n');
    }
  }

  // 2. Check & Setup yt-dlp
  if (status.ytDlp.available) {
    console.log(`✅ yt-dlp found: ${status.ytDlp.path}`);
  } else {
    console.log('⚠️ yt-dlp not detected. Starting automatic download...');
    try {
      let lastPct = 0;
      await downloadYtDlp((percent) => {
        if (percent >= lastPct + 10 || percent === 100) {
          process.stdout.write(`\r📥 Downloading yt-dlp: ${percent}%`);
          lastPct = percent;
        }
      });
      console.log('\n');
    } catch (err) {
      console.error('\n❌ Automatic download of yt-dlp failed:', err.message);
      console.log('👉 You can manually download yt-dlp.exe from:');
      console.log('   https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
      console.log('   and place it into the project "bin/" folder.\n');
    }
  }

  // Final status check
  console.log('----------------------------------------------------');
  const finalStatus = await getToolsStatus();
  console.log('📊 Final Tool Status:');
  console.log(`   - yt-dlp: ${finalStatus.ytDlp.available ? '🟢 Ready (' + finalStatus.ytDlp.path + ')' : '🔴 Missing'}`);
  console.log(`   - FFmpeg: ${finalStatus.ffmpeg.available ? '🟢 Ready (' + finalStatus.ffmpeg.path + ')' : '🟡 Missing'}`);
  console.log('====================================================');

  if (finalStatus.ytDlp.available && finalStatus.ffmpeg.available) {
    console.log('\n🎉 Complete! All engines are ready. Start the server with: npm start');
  } else if (!finalStatus.ffmpeg.available) {
    console.log('\n👉 Next step: Run "npm install" or "npm install @ffmpeg-installer/ffmpeg" to enable MP3 audio conversions.');
  }
}

main().catch((err) => {
  console.error('Setup encountered an unexpected error:', err);
  process.exit(1);
});

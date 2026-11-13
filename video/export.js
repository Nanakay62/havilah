/**
 * Havilah Overview Video Exporter
 * Renders 30.0s @ 30fps (900 frames) from video/player.html using Playwright & FFmpeg.
 * Produces:
 *  - public/assets/video/havilah-overview.mp4 (H.264, < 4 MB)
 *  - public/assets/video/havilah-overview.webm (VP9)
 *  - public/assets/video/havilah-overview-poster.webp
 */

const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

// Resolve Playwright
let playwright;
try {
  playwright = require('playwright');
} catch (e1) {
  try {
    playwright = require('C:/Users/nanak/node_modules/playwright');
  } catch (e2) {
    console.error('Could not load playwright:', e2.message);
    process.exit(1);
  }
}

// Resolve ffmpeg-static
let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
} catch (e) {
  ffmpegPath = path.resolve(__dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
}
if (!fs.existsSync(ffmpegPath)) {
  console.error('FFmpeg binary not found at:', ffmpegPath);
  process.exit(1);
}

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'video');
const MP4_OUT = path.join(OUT_DIR, 'havilah-overview.mp4');
const WEBM_OUT = path.join(OUT_DIR, 'havilah-overview.webm');
const POSTER_OUT = path.join(OUT_DIR, 'havilah-overview-poster.webp');
const POSTER_HR_OUT = path.join(OUT_DIR, 'havilah-overview-poster-hr.webp');
const PLAYER_HTML = path.resolve(__dirname, 'player.html');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function buildVideo() {
  console.log('--- Starting Havilah Overview Video Build ---');
  console.log('Player HTML:', PLAYER_HTML);
  console.log('Output Directory:', OUT_DIR);
  console.log('FFmpeg binary:', ffmpegPath);

  const startTime = Date.now();

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });

  const fileUrl = 'file:///' + PLAYER_HTML.replace(/\\/g, '/');
  console.log('Navigating to:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.waitForTimeout(500); // allow font loading and initial layout

  // 1. Setup MP4 FFmpeg stream
  console.log('Starting H.264 MP4 encode...');
  const ffmpegMp4 = spawn(ffmpegPath, [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    '-r', '30',
    '-i', '-',
    '-c:v', 'libx264',
    '-crf', '24',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    MP4_OUT
  ], { stdio: ['pipe', 'ignore', 'pipe'] });

  let stderrMp4 = '';
  ffmpegMp4.stderr.on('data', chunk => {
    stderrMp4 += chunk.toString();
  });

  const TOTAL_FRAMES = 900; // 30.0s * 30fps
  console.log(`Rendering and encoding ${TOTAL_FRAMES} frames...`);

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / 30.0;
    await page.evaluate((currT) => window.render(currT), t);
    const frameBuffer = await page.screenshot({ type: 'png' });

    const ok = ffmpegMp4.stdin.write(frameBuffer);
    if (!ok) {
      await new Promise(resolve => ffmpegMp4.stdin.once('drain', resolve));
    }

    if (i % 90 === 0 || i === TOTAL_FRAMES - 1) {
      const progress = Math.round((i / (TOTAL_FRAMES - 1)) * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r  Frame ${i + 1}/${TOTAL_FRAMES} (${progress}%) - ${elapsed}s elapsed`);
    }
  }

  process.stdout.write('\n');
  console.log('Finalizing MP4 container...');
  ffmpegMp4.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpegMp4.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg MP4 exited with code ${code}: ${stderrMp4}`));
    });
  });

  await browser.close();

  const mp4Stat = fs.statSync(MP4_OUT);
  const mp4SizeMB = (mp4Stat.size / (1024 * 1024)).toFixed(2);
  console.log(`MP4 completed: ${MP4_OUT} (${mp4SizeMB} MB)`);

  // 2. Extract WebP posters:
  //    - Primary: Employee check-in with centered mid-click ripple (t=6.72s)
  //    - Secondary: Unlocked HR Group Insight dashboard (t=21.8s)
  console.log('Generating employee check-in poster webp at t=6.72s...');
  execSync(`"${ffmpegPath}" -y -ss 00:00:06.720 -i "${MP4_OUT}" -vframes 1 -c:v libwebp -quality 92 "${POSTER_OUT}"`, { stdio: 'inherit' });
  const posterStat = fs.statSync(POSTER_OUT);
  console.log(`Poster completed: ${POSTER_OUT} (${(posterStat.size / 1024).toFixed(1)} KB)`);

  console.log('Generating HR group insight poster webp at t=21.8s...');
  execSync(`"${ffmpegPath}" -y -ss 00:00:21.800 -i "${MP4_OUT}" -vframes 1 -c:v libwebp -quality 92 "${POSTER_HR_OUT}"`, { stdio: 'inherit' });
  const posterHrStat = fs.statSync(POSTER_HR_OUT);
  console.log(`HR Poster completed: ${POSTER_HR_OUT} (${(posterHrStat.size / 1024).toFixed(1)} KB)`);

  // 3. Generate WebM (VP9, optimized bitrate/quality)
  console.log('Generating VP9 WebM for modern browser support...');
  execSync(`"${ffmpegPath}" -y -i "${MP4_OUT}" -c:v libvpx-vp9 -b:v 0 -crf 34 -deadline good -cpu-used 2 -row-mt 1 -an "${WEBM_OUT}"`, { stdio: 'inherit' });
  const webmStat = fs.statSync(WEBM_OUT);
  const webmSizeMB = (webmStat.size / (1024 * 1024)).toFixed(2);
  console.log(`WebM completed: ${WEBM_OUT} (${webmSizeMB} MB)`);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nAll video assets built successfully in ${totalTime}s!`);
}

buildVideo().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});

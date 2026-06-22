#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const ROOT = dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const DEFAULT_KURAGE_JOBS_DIR = '/home/kojima/work/kurage/storage/jobs';
const DEFAULT_UPLOAD_TOOL = '/home/kojima/work/airadio-scripted-mv/tools/youtube/upload_youtube.py';
const DEFAULT_UPLOAD_CWD = '/home/kojima/work/airadio-scripted-mv';
const STATE_PATH = join(ROOT, 'storage/kurage-shorts-upload-watcher.json');
const PID_PATH = '/tmp/kurage-shorts-upload-watcher.pid';
const LOG_PATH = '/tmp/kurage-shorts-upload-watcher.log';
const DEFAULT_INTERVAL_SECONDS = 300;
const DEFAULT_COOLDOWN_HOURS = 8;
const DEFAULT_MAX_UPLOADS_PER_DAY = 3;
const DEFAULT_POLICY_TIME_ZONE = 'Asia/Tokyo';
const MAX_SCAN_JOBS = 2000;

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function log(message, extra = undefined) {
  const line = `[${new Date().toISOString()}] ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}`;
  console.log(line);
}

function numberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function stringEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  return String(raw).trim();
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
    ...options,
  });
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(path) {
  try {
    return Number(readFileSync(path, 'utf8').trim() || 0);
  } catch {
    return 0;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateKey(date, timeZone = DEFAULT_POLICY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function ffprobeVideo(path) {
  const result = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height:format=duration',
    '-of',
    'json',
    path,
  ]);
  if (result.status !== 0) return null;
  try {
    const data = JSON.parse(result.stdout || '{}');
    const stream = data.streams?.[0] || {};
    return {
      duration: Number(data.format?.duration || 0),
      width: Number(stream.width || 0),
      height: Number(stream.height || 0),
    };
  } catch {
    return null;
  }
}

function jobVideoPath(jobsDir, jobId, job) {
  return String(job.video_file || join(jobsDir, jobId, 'output.mp4'));
}

function isPosted(job) {
  return Boolean(job.youtube_url || job.youtube_video_id);
}

function isShortVideo(meta) {
  return Boolean(meta && meta.duration > 0 && meta.duration <= 180.5 && meta.height >= meta.width);
}

function loadCandidates(limit = 50) {
  const jobsDir = resolve(stringEnv('KURAGE_JOBS_DIR', DEFAULT_KURAGE_JOBS_DIR));
  if (!existsSync(jobsDir)) throw new Error(`Kurage jobs directory not found: ${jobsDir}`);

  const listed = run('find', [jobsDir, '-maxdepth', '1', '-name', '*.json', '-type', 'f', '-printf', '%T@ %p\n']);
  if (listed.status !== 0) throw new Error(`failed to list Kurage jobs: ${listed.stderr}`);

  const files = (listed.stdout || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const spaceIndex = line.indexOf(' ');
      return { modifiedAt: Number(line.slice(0, spaceIndex)), path: line.slice(spaceIndex + 1) };
    })
    .filter((item) => item.path)
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, MAX_SCAN_JOBS);

  const candidates = [];
  for (const item of files) {
    const jobId = item.path.replace(/^.*\//, '').replace(/\.json$/, '');
    const job = readJson(item.path, null);
    if (!job || job.status !== 'done' || isPosted(job)) continue;

    const videoFile = jobVideoPath(jobsDir, jobId, job);
    if (!existsSync(videoFile)) continue;
    const meta = ffprobeVideo(videoFile);
    if (!isShortVideo(meta)) continue;

    candidates.push({
      jobId,
      title: String(job.title || job.display_title || job.summary_title || jobId).trim(),
      descriptionText: String(job.display_summary || job.summary || job.tweet_text || '').trim(),
      articleUrl: String(job.article_url || job.related_article_url || job.tweet_url || job.source_url || '').trim(),
      source: job.source || '',
      contentType: job.content_type || '',
      views: Number(job.views || 0),
      createdAt: job.created_at || '',
      updatedAt: job.updated_at || '',
      videoFile,
      jobFile: item.path,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      modifiedAt: statSync(videoFile).mtimeMs,
      kurageUrl: `https://kurage.exbridge.jp/kuragev.php?id=${jobId}`,
    });
  }

  return candidates
    .sort((a, b) => {
      if (b.views !== a.views) return b.views - a.views;
      return b.modifiedAt - a.modifiedAt;
    })
    .slice(0, limit);
}

function readState() {
  const state = readJson(STATE_PATH, {});
  return {
    uploads: Array.isArray(state.uploads) ? state.uploads : [],
    failures: Array.isArray(state.failures) ? state.failures : [],
    createdAt: state.createdAt || new Date().toISOString(),
    updatedAt: state.updatedAt || new Date().toISOString(),
  };
}

function uploadRecords(state) {
  return state.uploads.filter((item) => item && item.uploadedAt);
}

function policyStatus(state, now = new Date()) {
  const cooldownHours = numberEnv('KURAGE_SHORTS_UPLOAD_COOLDOWN_HOURS', DEFAULT_COOLDOWN_HOURS);
  const maxUploadsPerDay = numberEnv('KURAGE_SHORTS_UPLOAD_MAX_PER_DAY', DEFAULT_MAX_UPLOADS_PER_DAY);
  const timeZone = stringEnv('KURAGE_SHORTS_UPLOAD_TIME_ZONE', DEFAULT_POLICY_TIME_ZONE);
  const records = uploadRecords(state);
  const latest = records
    .map((item) => ({ ...item, uploadedAtMs: Date.parse(item.uploadedAt) || 0 }))
    .sort((a, b) => b.uploadedAtMs - a.uploadedAtMs)[0];
  const nowMs = now.getTime();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const nextAllowedAtMs = latest?.uploadedAtMs ? latest.uploadedAtMs + cooldownMs : 0;
  const cooldownRemainingSeconds = Math.max(0, Math.ceil((nextAllowedAtMs - nowMs) / 1000));
  const today = dateKey(now, timeZone);
  const uploadsToday = records.filter((item) => dateKey(new Date(item.uploadedAt), timeZone) === today).length;

  return {
    allowed: cooldownRemainingSeconds === 0 && uploadsToday < maxUploadsPerDay,
    cooldownHours,
    maxUploadsPerDay,
    timeZone,
    uploadsToday,
    cooldownRemainingSeconds,
    nextAllowedAt: nextAllowedAtMs ? new Date(nextAllowedAtMs).toISOString() : null,
    latestUpload: latest || null,
    reason:
      cooldownRemainingSeconds > 0
        ? 'cooldown-active'
        : uploadsToday >= maxUploadsPerDay
          ? 'daily-limit-reached'
          : 'ready',
  };
}

function buildDescription(item) {
  const summary = item.descriptionText ? `${item.descriptionText.slice(0, 500)}\n\n` : '';
  const source = item.articleUrl ? `元情報:\n${item.articleUrl}\n\n` : '';
  return `${summary}${source}Kurage動画:\n${item.kurageUrl}\n\n株式会社エクスブリッジ:\nhttps://exbridge.jp/\n\n#Shorts #Kurage #AI動画生成`;
}

function uploadToYoutube(item) {
  const uploadTool = stringEnv('YOUTUBE_UPLOAD_TOOL', DEFAULT_UPLOAD_TOOL);
  const uploadCwd = stringEnv('YOUTUBE_UPLOAD_CWD', DEFAULT_UPLOAD_CWD);
  const tokenPath = stringEnv('YOUTUBE_TOKEN_PATH', join(uploadCwd, 'storage/youtube/token.json'));
  const outDir = join(uploadCwd, 'storage/youtube');
  mkdirSync(outDir, { recursive: true });
  const jsonOut = join(outDir, `kurage_auto_${item.jobId}_shorts_response.json`);
  const tags = stringEnv('KURAGE_SHORTS_UPLOAD_TAGS', 'AI,Kurage,Shorts,AI動画生成,エクスブリッジ');
  const privacy = stringEnv('KURAGE_SHORTS_UPLOAD_PRIVACY', 'public');
  const python = stringEnv('YOUTUBE_UPLOAD_PYTHON', 'python3');
  const result = run(
    python,
    [
      uploadTool,
      item.videoFile,
      '--title',
      item.title,
      '--description',
      buildDescription(item),
      '--tags',
      tags,
      '--privacy',
      privacy,
      '--token',
      tokenPath,
      '--json-out',
      jsonOut,
    ],
    { cwd: uploadCwd, timeout: numberEnv('KURAGE_SHORTS_UPLOAD_TIMEOUT_MS', 30 * 60 * 1000) },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'YouTube upload failed').slice(-2000));
  }
  const response = readJson(jsonOut, null);
  const videoId = response?.id;
  if (!videoId) throw new Error(`YouTube upload response did not include id: ${result.stdout.slice(-1000)}`);
  return {
    response,
    jsonOut,
    youtubeVideoId: videoId,
    youtubeUrl: `https://youtu.be/${videoId}`,
    stdout: result.stdout,
  };
}

function markJobUploaded(item, upload) {
  const job = readJson(item.jobFile, null);
  if (!job) throw new Error(`job JSON not found: ${item.jobFile}`);
  const nowText = new Date().toISOString();
  const next = {
    ...job,
    youtube_url: upload.youtubeUrl,
    youtube_video_id: upload.youtubeVideoId,
    youtube_uploaded_at: nowText.replace('T', ' ').slice(0, 19),
    youtube_shorts_auto_uploaded_at: nowText,
    youtube_shorts_auto_source: 'kvtuber-watch-kurage-shorts-upload',
  };
  saveJson(item.jobFile, next);
}

function recordUpload(state, item, upload) {
  const next = {
    ...state,
    uploads: [
      ...state.uploads,
      {
        jobId: item.jobId,
        title: item.title,
        views: item.views,
        youtubeUrl: upload.youtubeUrl,
        youtubeVideoId: upload.youtubeVideoId,
        uploadedAt: new Date().toISOString(),
        kurageUrl: item.kurageUrl,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  saveJson(STATE_PATH, next);
  return next;
}

function recordFailure(state, item, error) {
  const next = {
    ...state,
    failures: [
      ...state.failures.slice(-99),
      {
        jobId: item?.jobId || '',
        title: item?.title || '',
        views: item?.views || 0,
        failedAt: new Date().toISOString(),
        error: String(error instanceof Error ? error.message : error).slice(0, 2000),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  saveJson(STATE_PATH, next);
  return next;
}

function nextCandidate(state) {
  const failedRecently = new Map();
  const retryHours = numberEnv('KURAGE_SHORTS_UPLOAD_FAILURE_RETRY_HOURS', 6);
  const retryMs = retryHours * 60 * 60 * 1000;
  for (const failure of state.failures || []) {
    if (!failure.jobId) continue;
    const failedAtMs = Date.parse(failure.failedAt) || 0;
    if (Date.now() - failedAtMs < retryMs) failedRecently.set(failure.jobId, failedAtMs);
  }
  const candidates = loadCandidates(numberEnv('KURAGE_SHORTS_UPLOAD_CANDIDATE_LIMIT', 50));
  return candidates.find((item) => !failedRecently.has(item.jobId)) || null;
}

async function runOnce(options = {}) {
  let state = readState();
  const policy = policyStatus(state);
  const candidates = loadCandidates(numberEnv('KURAGE_SHORTS_UPLOAD_CANDIDATE_LIMIT', 50));
  if (!policy.allowed && !options.force) {
    log('YouTube Shorts upload policy is not due yet', { policy, pending: candidates.length });
    return { ok: true, uploaded: false, reason: policy.reason, policy, pending: candidates.length };
  }

  const item = nextCandidate(state);
  if (!item) {
    log('No unposted Kurage short candidates found');
    return { ok: true, uploaded: false, reason: 'no-candidates', policy, pending: 0 };
  }

  log('Uploading Kurage short to YouTube', {
    jobId: item.jobId,
    views: item.views,
    title: item.title,
    videoFile: item.videoFile,
  });
  try {
    const upload = uploadToYoutube(item);
    markJobUploaded(item, upload);
    state = recordUpload(state, item, upload);
    log('Uploaded Kurage short to YouTube', {
      jobId: item.jobId,
      views: item.views,
      youtubeUrl: upload.youtubeUrl,
    });
    return { ok: true, uploaded: true, item, youtubeUrl: upload.youtubeUrl, state };
  } catch (error) {
    recordFailure(state, item, error);
    log('YouTube Shorts upload failed', {
      jobId: item.jobId,
      error: String(error instanceof Error ? error.message : error).slice(0, 1000),
    });
    throw error;
  }
}

async function watchLoop() {
  const intervalSeconds = numberEnv('KURAGE_SHORTS_UPLOAD_INTERVAL_SECONDS', DEFAULT_INTERVAL_SECONDS);
  writeFileSync(PID_PATH, `${process.pid}\n`, 'utf8');
  process.on('SIGTERM', () => {
    log('Kurage Shorts upload watcher stopping');
    process.exit(0);
  });
  log('Kurage Shorts upload watcher started', { intervalSeconds, statePath: STATE_PATH });
  while (true) {
    try {
      await runOnce();
    } catch (error) {
      log('watcher iteration failed', { error: String(error instanceof Error ? error.message : error).slice(0, 1000) });
    }
    await sleep(Math.max(30, intervalSeconds) * 1000);
  }
}

function status() {
  const state = readState();
  const candidates = loadCandidates(numberEnv('KURAGE_SHORTS_UPLOAD_CANDIDATE_LIMIT', 20));
  const pid = readPid(PID_PATH);
  console.log(
    JSON.stringify(
      {
        ok: true,
        pid,
        running: isPidAlive(pid),
        policy: policyStatus(state),
        uploadedCount: state.uploads.length,
        failureCount: state.failures.length,
        nextCandidate: candidates[0] || null,
        candidates,
        statePath: STATE_PATH,
        logPath: LOG_PATH,
      },
      null,
      2,
    ),
  );
}

function startDaemon() {
  const existingPid = readPid(PID_PATH);
  if (isPidAlive(existingPid)) {
    console.log(JSON.stringify({ ok: true, alreadyRunning: true, pid: existingPid }, null, 2));
    return;
  }
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, 'watch'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', openSync(LOG_PATH, 'a'), openSync(LOG_PATH, 'a')],
    env: { ...process.env },
  });
  child.unref();
  writeFileSync(PID_PATH, `${child.pid}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, started: true, pid: child.pid, logPath: LOG_PATH }, null, 2));
}

function stopDaemon() {
  const pid = readPid(PID_PATH);
  if (isPidAlive(pid)) process.kill(pid, 'SIGTERM');
  console.log(JSON.stringify({ ok: true, stopped: true, pid }, null, 2));
}

const command = process.argv[2] || 'status';
try {
  if (command === 'list') {
    const limit = Number(process.argv[3] || 20);
    console.log(JSON.stringify({ ok: true, items: loadCandidates(limit) }, null, 2));
  } else if (command === 'run-once') {
    const result = await runOnce({ force: process.argv.includes('--force') });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'watch') {
    await watchLoop();
  } else if (command === 'start') {
    startDaemon();
  } else if (command === 'stop') {
    stopDaemon();
  } else if (command === 'status') {
    status();
  } else {
    throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}

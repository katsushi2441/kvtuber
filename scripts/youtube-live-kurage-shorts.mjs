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
const CONFIG_PATH = join(ROOT, 'storage/youtube-live.json');
const STATE_PATH = '/tmp/kurage-youtube-live-shorts-state.json';
const PLAYLIST_PATH = '/tmp/kurage-youtube-live-shorts-playlist.txt';
const MERGED_VIDEO_PATH = '/tmp/kurage-youtube-live-shorts-merged.mp4';
const FFMPEG_BIN = existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
const FFPROBE_BIN = existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : 'ffprobe';
const DEFAULT_KURAGE_JOBS_DIR = '/home/kojima/work/kurage/storage/jobs';
const DEFAULT_CONFIG = {
  rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
  streamKey: '',
  width: 720,
  height: 1280,
  fps: 30,
  videoBitrate: '2500k',
  audioBitrate: '128k',
};

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

function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    rtmpUrl: String(process.env.YOUTUBE_RTMP_URL || raw.rtmpUrl || DEFAULT_CONFIG.rtmpUrl).trim(),
    streamKey: String(process.env.YOUTUBE_STREAM_KEY || raw.streamKey || '').trim(),
    width: Number(process.env.KURAGE_SHORTS_WIDTH || raw.shortsWidth || DEFAULT_CONFIG.width),
    height: Number(process.env.KURAGE_SHORTS_HEIGHT || raw.shortsHeight || DEFAULT_CONFIG.height),
    fps: Number(process.env.KURAGE_SHORTS_FPS || raw.shortsFps || raw.fps || DEFAULT_CONFIG.fps),
    videoBitrate: String(process.env.KURAGE_SHORTS_VIDEO_BITRATE || raw.videoBitrate || DEFAULT_CONFIG.videoBitrate),
    audioBitrate: String(process.env.KURAGE_SHORTS_AUDIO_BITRATE || raw.audioBitrate || DEFAULT_CONFIG.audioBitrate),
  };
}

function rtmpDestination(config) {
  const key = config.streamKey;
  if (!key) return '';
  if (config.rtmpUrl.includes(key)) return config.rtmpUrl;
  return `${config.rtmpUrl.replace(/\/+$/, '')}/${key}`;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function commandExists(command) {
  const result = run('bash', ['-lc', `command -v ${JSON.stringify(command)}`]);
  return result.status === 0;
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

function killPidGroup(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
}

function readState() {
  const state = readJson(STATE_PATH, null);
  if (!state) return { running: false };
  return { ...state, running: isPidAlive(state.ffmpegPid) };
}

function openLog(path) {
  return openSync(path, 'a');
}

function shellEscapeSingleQuoted(value) {
  return String(value).replace(/'/g, "'\\''");
}

function ffprobeVideo(path) {
  const result = run(FFPROBE_BIN, [
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

function loadKurageShorts(limit = 5) {
  const jobsDir = resolve(process.env.KURAGE_JOBS_DIR || DEFAULT_KURAGE_JOBS_DIR);
  if (!existsSync(jobsDir)) throw new Error(`Kurage jobs directory not found: ${jobsDir}`);

  const videoFiles = run('find', [
    jobsDir,
    '-mindepth',
    '2',
    '-maxdepth',
    '2',
    '-name',
    'output.mp4',
    '-type',
    'f',
    '-printf',
    '%T@ %p\n',
  ]);
  if (videoFiles.status !== 0) {
    throw new Error(`failed to list Kurage videos: ${videoFiles.stderr}`);
  }

  const items = [];
  const candidates = (videoFiles.stdout || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const spaceIndex = line.indexOf(' ');
      return {
        modifiedAt: Number(line.slice(0, spaceIndex)),
        videoFile: line.slice(spaceIndex + 1),
      };
    })
    .filter((item) => item.modifiedAt && item.videoFile)
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    // Look at a bounded recent window so list/start stays fast even with many
    // generated jobs. If some recent videos are long-form, keep scanning enough
    // candidates to still find the requested five shorts.
    .slice(0, Math.max(limit * 8, 40));

  for (const candidate of candidates) {
    const videoFile = candidate.videoFile;
    const jobId = dirname(videoFile).replace(/^.*\//, '');
    const job = readJson(join(jobsDir, `${jobId}.json`), {});

    const meta = ffprobeVideo(videoFile);
    if (!meta || !meta.duration) continue;
    const isShort = meta.duration <= 180.5 && meta.height >= meta.width;
    if (!isShort) continue;

    const modifiedAt = statSync(videoFile).mtimeMs;
    items.push({
      jobId,
      title: String(job.title || job.display_title || job.summary_title || jobId),
      source: job.source || '',
      contentType: job.content_type || '',
      videoFile,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      modifiedAt: candidate.modifiedAt,
      url: `https://kurage.exbridge.jp/kuragev.php?id=${jobId}`,
    });
    if (items.length >= limit) break;
  }

  return items;
}

function writePlaylist(items) {
  const lines = items.map((item) => `file '${shellEscapeSingleQuoted(item.videoFile)}'`);
  writeFileSync(PLAYLIST_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function buildMergedVideo(items, config) {
  const inputs = items.flatMap((item) => ['-i', item.videoFile]);
  const filters = [];
  const concatInputs = [];
  for (let index = 0; index < items.length; index += 1) {
    filters.push(
      `[${index}:v]scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,` +
        `pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2,` +
        `setsar=1,fps=${config.fps},format=yuv420p[v${index}]`,
    );
    filters.push(
      `[${index}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]`,
    );
    concatInputs.push(`[v${index}][a${index}]`);
  }
  filters.push(`${concatInputs.join('')}concat=n=${items.length}:v=1:a=1[v][a]`);

  const result = run(
    FFMPEG_BIN,
    [
      '-hide_banner',
      '-y',
      ...inputs,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      config.videoBitrate,
      '-maxrate',
      config.videoBitrate,
      '-bufsize',
      '5000k',
      '-pix_fmt',
      'yuv420p',
      '-g',
      String(config.fps * 2),
      '-c:a',
      'aac',
      '-b:a',
      config.audioBitrate,
      '-ar',
      '44100',
      '-movflags',
      '+faststart',
      MERGED_VIDEO_PATH,
    ],
    {
      maxBuffer: 1024 * 1024 * 16,
    },
  );
  if (result.status !== 0) {
    writeFileSync('/tmp/kurage-youtube-shorts-merge.err.log', result.stderr || '', 'utf8');
    throw new Error('最新ショート動画の結合に失敗しました。/tmp/kurage-youtube-shorts-merge.err.log を確認してください');
  }
  return MERGED_VIDEO_PATH;
}

function printList() {
  const limit = Number(process.env.KURAGE_SHORTS_LIMIT || process.argv[3] || 5);
  const items = loadKurageShorts(limit);
  console.log(JSON.stringify({ ok: true, count: items.length, items }, null, 2));
}

async function start() {
  const current = readState();
  if (current.running) {
    console.log(JSON.stringify({ ok: true, alreadyRunning: true, status: current }, null, 2));
    return;
  }

  for (const bin of [FFMPEG_BIN, FFPROBE_BIN]) {
    if (!commandExists(bin)) throw new Error(`${bin} が見つかりません`);
  }

  const config = normalizeConfig(readJson(CONFIG_PATH, DEFAULT_CONFIG));
  const destination = rtmpDestination(config);
  if (!destination) throw new Error('YouTubeのストリームキーを設定してください');

  const limit = Number(process.env.KURAGE_SHORTS_LIMIT || process.argv[3] || 5);
  const items = loadKurageShorts(limit);
  if (items.length === 0) throw new Error('配信できるKurageショート動画が見つかりません');
  writePlaylist(items);
  const mergedVideo = buildMergedVideo(items, config);

  const stdout = openLog('/tmp/kurage-youtube-shorts-ffmpeg.log');
  const stderr = openLog('/tmp/kurage-youtube-shorts-ffmpeg.err.log');
  const child = spawn(
    FFMPEG_BIN,
    [
      '-hide_banner',
      '-re',
      '-i',
      mergedVideo,
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-f',
      'flv',
      destination,
    ],
    {
      detached: true,
      stdio: ['ignore', stdout, stderr],
      env: { ...process.env },
    },
  );
  child.unref();

  const state = {
    running: true,
    mode: 'kurage-shorts-playlist',
    startedAt: new Date().toISOString(),
    ffmpegPid: child.pid,
    playlistPath: PLAYLIST_PATH,
    mergedVideo,
    width: config.width,
    height: config.height,
    fps: config.fps,
    items,
    logs: {
      ffmpeg: '/tmp/kurage-youtube-shorts-ffmpeg.err.log',
    },
  };
  saveJson(STATE_PATH, state);
  console.log(JSON.stringify({ ok: true, status: state }, null, 2));
}

function stop() {
  const state = readJson(STATE_PATH, {});
  killPidGroup(state.ffmpegPid);
  const next = { ...state, running: false, stoppedAt: new Date().toISOString() };
  saveJson(STATE_PATH, next);
  console.log(JSON.stringify({ ok: true, status: next }, null, 2));
}

function status() {
  const config = normalizeConfig(readJson(CONFIG_PATH, DEFAULT_CONFIG));
  console.log(
    JSON.stringify(
      {
        ok: true,
        status: readState(),
        config: {
          ...config,
          streamKey: config.streamKey ? '********' : '',
          hasStreamKey: Boolean(config.streamKey),
        },
      },
      null,
      2,
    ),
  );
}

const command = process.argv[2] || 'status';
try {
  if (command === 'list') printList();
  else if (command === 'start') await start();
  else if (command === 'stop') stop();
  else if (command === 'status') status();
  else throw new Error(`unknown command: ${command}`);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}

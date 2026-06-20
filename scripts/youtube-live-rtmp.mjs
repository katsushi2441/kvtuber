#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

const ROOT = dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const CONFIG_PATH = join(ROOT, 'storage/youtube-live.json');
const STATE_PATH = '/tmp/kurage-youtube-live-state.json';
const FFMPEG_BIN = existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
const DEFAULT_CONFIG = {
  enabled: true,
  rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
  streamKey: '',
  viewerUrl: 'http://127.0.0.1:18308/viewer?broadcast=1',
  width: 1280,
  height: 720,
  fps: 30,
  videoBitrate: '2500k',
  audioBitrate: '128k',
  display: ':98',
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
    viewerUrl: String(process.env.KURAGE_VIEWER_URL || raw.viewerUrl || DEFAULT_CONFIG.viewerUrl).trim(),
    width: Number(raw.width || DEFAULT_CONFIG.width),
    height: Number(raw.height || DEFAULT_CONFIG.height),
    fps: Number(raw.fps || DEFAULT_CONFIG.fps),
    videoBitrate: String(raw.videoBitrate || DEFAULT_CONFIG.videoBitrate),
    audioBitrate: String(raw.audioBitrate || DEFAULT_CONFIG.audioBitrate),
    display: String(raw.display || DEFAULT_CONFIG.display),
  };
}

function readConfig() {
  return normalizeConfig(readJson(CONFIG_PATH, DEFAULT_CONFIG));
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

function readState() {
  const state = readJson(STATE_PATH, null);
  if (!state) return { running: false };
  const ffmpegAlive = isPidAlive(state.ffmpegPid);
  return { ...state, running: ffmpegAlive };
}

function killPid(pid) {
  if (!pid || !isPidAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {}
}

function killPidGroup(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    killPid(pid);
  }
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function commandExists(command) {
  const result = run('bash', ['-lc', `command -v ${JSON.stringify(command)}`]);
  return result.status === 0;
}

function killExistingXvfb(display) {
  const result = run('ps', ['-eo', 'pid=,args=']);
  const lines = (result.stdout || '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const args = match[2];
    if (args.startsWith(`Xvfb ${display} `)) killPid(pid);
  }
}

function ensurePulseSink() {
  if (!commandExists('pactl')) return 'default';
  run('pulseaudio', ['--start']);
  const sinks = run('pactl', ['list', 'short', 'sinks']).stdout || '';
  if (!sinks.includes('kurage_live')) {
    run('pactl', [
      'load-module',
      'module-null-sink',
      'sink_name=kurage_live',
      'sink_properties=device.description=KurageLive',
    ]);
  }
  run('pactl', ['set-default-sink', 'kurage_live']);
  return 'kurage_live.monitor';
}

function openLog(path) {
  return openSync(path, 'a');
}

function spawnDetached(command, args, options = {}) {
  const out = openLog(options.stdout || `/tmp/kurage-youtube-${command}.log`);
  const err = openLog(options.stderr || `/tmp/kurage-youtube-${command}.err.log`);
  const child = spawn(command, args, {
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, ...(options.env || {}) },
  });
  child.unref();
  return child.pid;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rtmpDestination(config) {
  const key = config.streamKey;
  if (!key) return '';
  if (config.rtmpUrl.includes(key)) return config.rtmpUrl;
  return `${config.rtmpUrl.replace(/\/+$/, '')}/${key}`;
}

async function start() {
  const current = readState();
  if (current.running) {
    console.log(JSON.stringify({ ok: true, alreadyRunning: true, status: current }, null, 2));
    return;
  }

  const config = readConfig();
  const destination = rtmpDestination(config);
  if (!destination) {
    throw new Error('YouTubeのストリームキーを設定してください');
  }

  for (const bin of ['Xvfb', 'google-chrome', FFMPEG_BIN]) {
    if (!commandExists(bin)) throw new Error(`${bin} が見つかりません`);
  }

  const display = config.display;
  const geometry = `${config.width}x${config.height}x24`;
  const profileDir = `/tmp/kurage-youtube-chrome-profile-${display.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const audioSource = ensurePulseSink();
  killExistingXvfb(display);
  const xvfbPid = spawnDetached('Xvfb', [display, '-screen', '0', geometry, '-ac'], {
    stdout: '/tmp/kurage-youtube-xvfb.log',
    stderr: '/tmp/kurage-youtube-xvfb.err.log',
  });
  await sleep(1200);

  const chromePid = spawnDetached(
    'google-chrome',
    [
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-session-crashed-bubble',
      '--disable-features=Translate,MediaRouter',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-infobars',
      '--kiosk',
      `--user-data-dir=${profileDir}`,
      '--window-position=0,0',
      `--window-size=${config.width},${config.height}`,
      `--app=${config.viewerUrl}`,
    ],
    {
      env: { DISPLAY: display, PULSE_SINK: 'kurage_live' },
      stdout: '/tmp/kurage-youtube-chrome.log',
      stderr: '/tmp/kurage-youtube-chrome.err.log',
    },
  );
  await sleep(2500);
  if (!isPidAlive(chromePid)) {
    killPid(xvfbPid);
    throw new Error('配信用Chromeの起動に失敗しました。Chromeログを確認してください。');
  }

  const ffmpegPid = spawnDetached(
    FFMPEG_BIN,
    [
      '-y',
      '-f',
      'x11grab',
      '-thread_queue_size',
      '1024',
      '-video_size',
      `${config.width}x${config.height}`,
      '-framerate',
      String(config.fps),
      '-i',
      `${display}.0`,
      '-f',
      'pulse',
      '-thread_queue_size',
      '1024',
      '-i',
      audioSource,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'zerolatency',
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
      '-f',
      'flv',
      destination,
    ],
    {
      env: { DISPLAY: display },
      stdout: '/tmp/kurage-youtube-ffmpeg.log',
      stderr: '/tmp/kurage-youtube-ffmpeg.err.log',
    },
  );

  const state = {
    running: true,
    startedAt: new Date().toISOString(),
    display,
    viewerUrl: config.viewerUrl,
    width: config.width,
    height: config.height,
    fps: config.fps,
    audioSource,
    profileDir,
    xvfbPid,
    chromePid,
    ffmpegPid,
    logs: {
      ffmpeg: '/tmp/kurage-youtube-ffmpeg.err.log',
      chrome: '/tmp/kurage-youtube-chrome.err.log',
    },
  };
  saveJson(STATE_PATH, state);
  console.log(JSON.stringify({ ok: true, status: state }, null, 2));
}

async function stop() {
  const state = readJson(STATE_PATH, {});
  killPidGroup(state.ffmpegPid);
  killPidGroup(state.chromePid);
  killPid(state.xvfbPid);
  const next = { ...state, running: false, stoppedAt: new Date().toISOString() };
  saveJson(STATE_PATH, next);
  console.log(JSON.stringify({ ok: true, status: next }, null, 2));
}

function status() {
  const config = readConfig();
  const state = readState();
  console.log(
    JSON.stringify(
      {
        ok: true,
        status: state,
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
  if (command === 'start') await start();
  else if (command === 'stop') await stop();
  else if (command === 'status') status();
  else throw new Error(`unknown command: ${command}`);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}

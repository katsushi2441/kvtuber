#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

const ROOT = dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const WATCHER_STATE_PATH = join(ROOT, 'storage/kurage-shorts-live-watcher.json');
const YOUTUBE_CONFIG_PATH = join(ROOT, 'storage/youtube-live.json');
const LIVE_STATE_PATH = '/tmp/kurage-youtube-live-shorts-state.json';
const WATCHER_PID_PATH = '/tmp/kurage-shorts-live-watcher.pid';
const WATCHER_LOG_PATH = '/tmp/kurage-shorts-live-watcher.log';
const SHORTS_SCRIPT = join(ROOT, 'scripts/youtube-live-kurage-shorts.mjs');
const WATCHER_SCRIPT = join(ROOT, 'scripts/watch-kurage-shorts-live.mjs');
const X_BROWSER_USE_SCRIPT = join(ROOT, 'scripts/x-post-browser-use.py');
const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_MAX_BATCH_SIZE = 10;
const DEFAULT_COOLDOWN_HOURS = 4;
const DEFAULT_MAX_STREAMS_PER_DAY = 4;
const DEFAULT_POLICY_TIME_ZONE = 'Asia/Tokyo';
const DEFAULT_SCAN_LIMIT = 200;
const DEFAULT_AIXSNS_API = 'https://aixec.exbridge.jp/api.php?path=posts';
const DEFAULT_BROWSER_AGENT_PYTHON = '/home/kojima/work/browser_agent/.venv/bin/python';

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

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
    ...options,
  });
}

function parseJsonOutput(stdout) {
  const index = stdout.indexOf('{');
  if (index < 0) throw new Error(`JSON output not found: ${stdout.slice(0, 200)}`);
  return JSON.parse(stdout.slice(index));
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

function listShorts(limit = DEFAULT_SCAN_LIMIT) {
  const result = runNode([SHORTS_SCRIPT, 'list', String(limit)]);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'failed to list Kurage shorts');
  }
  return parseJsonOutput(result.stdout).items || [];
}

function liveStatus() {
  const result = runNode([SHORTS_SCRIPT, 'status']);
  if (result.status !== 0) return { running: false };
  return parseJsonOutput(result.stdout).status || { running: false };
}

function liveConfigStatus() {
  const result = runNode([SHORTS_SCRIPT, 'status']);
  if (result.status !== 0) {
    return {
      ok: false,
      hasStreamKey: false,
      error: (result.stderr || result.stdout || 'failed to read live status').slice(0, 500),
    };
  }
  const parsed = parseJsonOutput(result.stdout);
  return {
    ok: true,
    hasStreamKey: Boolean(parsed.config?.hasStreamKey),
    rtmpUrl: parsed.config?.rtmpUrl || '',
    width: parsed.config?.width,
    height: parsed.config?.height,
    fps: parsed.config?.fps,
  };
}

function startBatch(items) {
  const jobIds = items.map((item) => item.jobId);
  const result = runNode([SHORTS_SCRIPT, 'start', String(jobIds.length)], {
    env: {
      ...process.env,
      KURAGE_SHORTS_JOB_IDS: jobIds.join(','),
    },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'failed to start Kurage shorts live');
  }
  return parseJsonOutput(result.stdout);
}

function stopBatch() {
  const result = runNode([SHORTS_SCRIPT, 'stop']);
  if (result.status !== 0) {
    log('failed to stop Kurage shorts live after failed confirmation', {
      error: (result.stderr || result.stdout || '').slice(0, 500),
    });
  }
}

function getYoutubeLiveUrl() {
  const config = readJson(YOUTUBE_CONFIG_PATH, {});
  return String(
    process.env.YOUTUBE_LIVE_URL ||
      process.env.KURAGE_YOUTUBE_LIVE_URL ||
      config.youtubeLiveUrl ||
      config.liveUrl ||
      '',
  ).trim();
}

function getYoutubeChannelLiveUrl() {
  const config = readJson(YOUTUBE_CONFIG_PATH, {});
  return String(
    process.env.YOUTUBE_CHANNEL_LIVE_URL ||
      process.env.KURAGE_YOUTUBE_CHANNEL_LIVE_URL ||
      config.youtubeChannelLiveUrl ||
      config.channelLiveUrl ||
      '',
  ).trim();
}

function getAnnouncementLiveUrl() {
  return getYoutubeLiveUrl() || getYoutubeChannelLiveUrl();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeYoutubeWatchUrl(url) {
  const text = String(url || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return id ? `https://www.youtube.com/watch?v=${id}` : text;
    }
    const id = parsed.searchParams.get('v');
    if (id && /(^|\.)youtube\.com$/.test(parsed.hostname)) {
      return `https://www.youtube.com/watch?v=${id}`;
    }
  } catch {}
  return text;
}

function resolveYoutubeChannelLiveUrlOnce(channelLiveUrl) {
  if (!channelLiveUrl || !commandExists('yt-dlp')) return '';
  const result = spawnSync(
    'yt-dlp',
    [
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      '--print',
      'webpage_url',
      channelLiveUrl,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: Number(process.env.KURAGE_SHORTS_YTDLP_TIMEOUT_MS || 20000),
    },
  );
  if (result.status !== 0) return '';
  const lines = String(result.stdout || '')
    .split('\n')
    .map((line) => normalizeYoutubeWatchUrl(line))
    .filter(Boolean);
  return lines.find((line) => /youtube\.com\/watch\?v=/.test(line)) || '';
}

async function resolveAnnouncementLiveUrlAfterStart() {
  const exactLiveUrl = getYoutubeLiveUrl();
  if (exactLiveUrl) {
    return { url: exactLiveUrl, source: 'configured-youtube-live-url' };
  }

  const channelLiveUrl = getYoutubeChannelLiveUrl();
  if (!channelLiveUrl) return { url: '', source: 'missing' };

  const attempts = Number(process.env.KURAGE_SHORTS_LIVE_URL_RESOLVE_ATTEMPTS || 12);
  const delayMs = Number(process.env.KURAGE_SHORTS_LIVE_URL_RESOLVE_DELAY_MS || 5000);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const resolved = resolveYoutubeChannelLiveUrlOnce(channelLiveUrl);
    if (resolved && resolved !== normalizeYoutubeWatchUrl(channelLiveUrl)) {
      log('resolved YouTube channel live URL to watch URL', { attempt, url: resolved });
      return { url: resolved, source: 'resolved-channel-live-url', attempts: attempt };
    }
    log('YouTube watch URL not resolved yet', { attempt, attempts, channelLiveUrl });
    if (attempt < attempts) await sleep(delayMs);
  }

  return { url: '', fallbackUrl: channelLiveUrl, source: 'unresolved-channel-live-url', attempts };
}

function announcementsNeedLiveUrl() {
  const aixsnsEnabled = String(process.env.KURAGE_SHORTS_ANNOUNCE_AIXSNS || '1') !== '0';
  const xEnabled = String(process.env.KURAGE_SHORTS_ANNOUNCE_X || '1') !== '0';
  return (aixsnsEnabled || xEnabled) && String(process.env.KURAGE_SHORTS_REQUIRE_LIVE_URL || '1') !== '0';
}

function getAixsnsApiUrl() {
  return String(process.env.AIXSNS_API || DEFAULT_AIXSNS_API).trim();
}

function commandExists(command) {
  const result = spawnSync('bash', ['-lc', `command -v ${JSON.stringify(command)}`], {
    encoding: 'utf8',
  });
  return result.status === 0;
}

function getBrowserUsePython() {
  return String(process.env.BROWSER_AGENT_PYTHON || DEFAULT_BROWSER_AGENT_PYTHON);
}

function browserUseXAvailable() {
  return existsSync(getBrowserUsePython()) && existsSync(X_BROWSER_USE_SCRIPT);
}

function buildAnnouncementContent(items, liveUrl) {
  const titles = items
    .map((item, index) => `${index + 1}. ${item.title}`)
    .join('\n');
  return [
    'Kurageショート動画のYouTube Live配信を開始しました。',
    '',
    `新しく追加されたショート動画${items.length}本を連続で配信中です。`,
    liveUrl,
    '',
    titles,
    '',
    '#Kurage #AI動画生成 #YouTubeLive #エクスブリッジ',
  ].join('\n');
}

function twitterAuthStatus() {
  if (!commandExists('twitter')) {
    return { authenticated: false, reason: 'twitter-cli-not-found' };
  }
  const auth = spawnSync('twitter', ['status'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    env: { ...process.env },
  });
  const output = `${auth.stdout}\n${auth.stderr}`;
  if (auth.status !== 0 || /not_authenticated/i.test(output)) {
    return {
      authenticated: false,
      reason: 'twitter-not-authenticated',
      detail: output.slice(0, 500),
    };
  }
  return { authenticated: true };
}

function postXWithBrowserUse(content) {
  if (String(process.env.KURAGE_SHORTS_X_BROWSER_USE || '1') === '0') {
    return { skipped: true, reason: 'browser-use-disabled' };
  }
  if (!browserUseXAvailable()) {
    return { skipped: true, reason: 'browser-use-not-available' };
  }

  const args = [X_BROWSER_USE_SCRIPT, '--text', content];
  if (String(process.env.BROWSER_USE_X_HEADFUL || '0') === '1') {
    args.push('--headful');
  }
  const result = spawnSync(getBrowserUsePython(), args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 4,
    timeout: Number(process.env.BROWSER_USE_X_TIMEOUT_MS || 180000),
    env: { ...process.env },
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  let parsed = {};
  try {
    const jsonStart = result.stdout.indexOf('{');
    parsed = jsonStart >= 0 ? JSON.parse(result.stdout.slice(jsonStart)) : {};
  } catch {
    parsed = {};
  }
  if (result.status !== 0 || parsed.ok === false) {
    throw new Error(`browser-use X post failed: ${output.slice(0, 1000)}`);
  }
  const url = output.match(/https?:\/\/(?:x|twitter)\.com\/[^\s"']+/)?.[0] || '';
  return {
    skipped: false,
    via: 'browser-use',
    url,
    output: output.slice(0, 1000),
  };
}

async function postAixsnsAnnouncement(items, liveUrl, content = buildAnnouncementContent(items, liveUrl)) {
  if (String(process.env.KURAGE_SHORTS_ANNOUNCE_AIXSNS || '1') === '0') {
    return { skipped: true, reason: 'disabled' };
  }
  if (!liveUrl) {
    return { skipped: true, reason: 'missing-youtube-live-url' };
  }

  const response = await fetch(getAixsnsApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author: 'kurage',
      content,
      title: 'Kurageショート動画 YouTube Live配信開始',
      description: `新しく追加されたKurageショート動画${items.length}本の連続ライブ配信告知`,
      kind: 'youtube_live_announcement',
      source_url: liveUrl,
    }),
  });
  const body = await response.text();
  let parsed = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw: body.slice(0, 500) };
  }
  if (!response.ok || parsed.ok === false) {
    throw new Error(`AIxSNS announcement failed (${response.status}): ${JSON.stringify(parsed).slice(0, 500)}`);
  }
  const item = parsed.item && typeof parsed.item === 'object' ? parsed.item : {};
  return {
    skipped: false,
    id: item.id || null,
    url: item.id ? `https://aixec.exbridge.jp/sns.php?id=${item.id}` : '',
  };
}

function postXAnnouncement(items, liveUrl) {
  if (String(process.env.KURAGE_SHORTS_ANNOUNCE_X || '1') === '0') {
    return { skipped: true, reason: 'disabled' };
  }
  if (!liveUrl) {
    return { skipped: true, reason: 'missing-youtube-live-url' };
  }
  const content = buildAnnouncementContent(items, liveUrl);
  if (!commandExists('twitter')) {
    return postXWithBrowserUse(content);
  }

  const auth = twitterAuthStatus();
  if (!auth.authenticated) {
    const fallback = postXWithBrowserUse(content);
    return {
      ...fallback,
      twitterCli: {
        skipped: true,
        reason: auth.reason,
        detail: auth.detail,
      },
    };
  }

  const result = spawnSync('twitter', ['post', content], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`X announcement failed: ${(result.stderr || result.stdout || '').slice(0, 500)}`);
  }
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const url = output.match(/https?:\/\/(?:x|twitter)\.com\/[^\s"']+/)?.[0] || '';
  return {
    skipped: false,
    via: 'twitter-cli',
    url,
    output: output.slice(0, 500),
  };
}

function currentStreamingJobIds() {
  const live = readJson(LIVE_STATE_PATH, null);
  return Array.isArray(live?.items)
    ? live.items.map((item) => item.jobId).filter(Boolean)
    : [];
}

function defaultState() {
  return {
    streamedJobIds: [],
    batches: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadState() {
  const state = readJson(WATCHER_STATE_PATH, defaultState());
  return {
    ...defaultState(),
    ...state,
    streamedJobIds: Array.isArray(state.streamedJobIds) ? state.streamedJobIds : [],
    batches: Array.isArray(state.batches) ? state.batches : [],
  };
}

function saveState(state) {
  saveJson(WATCHER_STATE_PATH, {
    ...state,
    updatedAt: new Date().toISOString(),
  });
}

function getMinBatchSize() {
  return Math.max(1, Math.floor(numberEnv('KURAGE_SHORTS_BATCH_SIZE', DEFAULT_BATCH_SIZE)));
}

function getMaxBatchSize() {
  return Math.max(getMinBatchSize(), Math.floor(numberEnv('KURAGE_SHORTS_MAX_BATCH_SIZE', DEFAULT_MAX_BATCH_SIZE)));
}

function getCooldownHours() {
  return Math.max(0, numberEnv('KURAGE_SHORTS_LIVE_COOLDOWN_HOURS', DEFAULT_COOLDOWN_HOURS));
}

function getMaxStreamsPerDay() {
  return Math.max(1, Math.floor(numberEnv('KURAGE_SHORTS_MAX_STREAMS_PER_DAY', DEFAULT_MAX_STREAMS_PER_DAY)));
}

function getPolicyTimeZone() {
  return String(process.env.KURAGE_SHORTS_POLICY_TIME_ZONE || DEFAULT_POLICY_TIME_ZONE);
}

function dateKeyInTimeZone(date, timeZone = getPolicyTimeZone()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function autoLiveBatches(state) {
  return (state.batches || []).filter((batch) => batch.reason === 'auto-live-started' && batch.recordedAt);
}

function streamPolicyStatus(state, now = new Date()) {
  const batches = autoLiveBatches(state);
  const latest = batches
    .map((batch) => ({ ...batch, startedAtMs: Date.parse(batch.recordedAt) }))
    .filter((batch) => Number.isFinite(batch.startedAtMs))
    .sort((a, b) => b.startedAtMs - a.startedAtMs)[0] || null;
  const cooldownHours = getCooldownHours();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const nextAllowedAtMs = latest ? latest.startedAtMs + cooldownMs : 0;
  const cooldownRemainingSeconds = Math.max(0, Math.ceil((nextAllowedAtMs - nowMs) / 1000));
  const todayKey = dateKeyInTimeZone(now);
  const streamsToday = batches.filter((batch) => {
    const date = new Date(batch.recordedAt);
    return Number.isFinite(date.getTime()) && dateKeyInTimeZone(date) === todayKey;
  }).length;
  const maxStreamsPerDay = getMaxStreamsPerDay();

  if (cooldownRemainingSeconds > 0) {
    return {
      canStart: false,
      reason: 'cooldown-active',
      cooldownHours,
      cooldownRemainingSeconds,
      nextAllowedAt: new Date(nextAllowedAtMs).toISOString(),
      streamsToday,
      maxStreamsPerDay,
      todayKey,
    };
  }
  if (streamsToday >= maxStreamsPerDay) {
    return {
      canStart: false,
      reason: 'daily-limit-reached',
      cooldownHours,
      cooldownRemainingSeconds: 0,
      streamsToday,
      maxStreamsPerDay,
      todayKey,
    };
  }
  return {
    canStart: true,
    reason: 'allowed',
    cooldownHours,
    cooldownRemainingSeconds: 0,
    streamsToday,
    maxStreamsPerDay,
    todayKey,
  };
}

function markStreamed(jobIds, reason, extra = {}) {
  const state = loadState();
  const streamed = new Set(state.streamedJobIds);
  for (const jobId of jobIds) streamed.add(jobId);
  state.streamedJobIds = Array.from(streamed);
  state.batches = [
    ...(state.batches || []),
    {
      reason,
      jobIds,
      ...extra,
      recordedAt: new Date().toISOString(),
    },
  ].slice(-50);
  saveState(state);
  return state;
}

function ensureInitialState() {
  if (existsSync(WATCHER_STATE_PATH)) return loadState();

  const existing = listShorts(DEFAULT_SCAN_LIMIT).map((item) => item.jobId);
  const currentJobIds = currentStreamingJobIds();
  log('initializing watcher baseline from existing Kurage shorts', {
    existingCount: existing.length,
    currentLiveJobIds: currentJobIds,
  });
  const state = markStreamed(existing, 'baseline-existing-at-watcher-start');
  if (currentJobIds.length > 0) {
    state.batches = [
      ...(state.batches || []),
      {
        reason: 'current-live-at-watcher-start',
        jobIds: currentJobIds,
        recordedAt: new Date().toISOString(),
      },
    ].slice(-50);
    saveState(state);
  }
  return state;
}

function pendingShorts() {
  const state = ensureInitialState();
  const streamed = new Set(state.streamedJobIds);
  const all = listShorts(DEFAULT_SCAN_LIMIT);
  const pending = all
    .filter((item) => !streamed.has(item.jobId))
    .sort((a, b) => a.modifiedAt - b.modifiedAt);
  return { state, all, pending };
}

async function runOnce() {
  const batchSize = getMinBatchSize();
  const maxBatchSize = getMaxBatchSize();
  const live = liveStatus();
  if (live.running) {
    log('live stream is already running; watcher will wait', { ffmpegPid: live.ffmpegPid });
    return { started: false, reason: 'live-running' };
  }

  const { state, pending } = pendingShorts();
  if (pending.length < batchSize) {
    log('not enough new Kurage shorts yet', { pending: pending.length, needed: batchSize });
    return { started: false, reason: 'not-enough-pending', pending: pending.length };
  }

  const policy = streamPolicyStatus(state);
  if (!policy.canStart) {
    log('Kurage shorts live policy is waiting before next stream', {
      pending: pending.length,
      needed: batchSize,
      maxBatchSize,
      policy,
    });
    return { started: false, reason: policy.reason, pending: pending.length, policy };
  }

  const configuredAnnouncementLiveUrl = getAnnouncementLiveUrl();
  if (!configuredAnnouncementLiveUrl && announcementsNeedLiveUrl()) {
    log('YouTube Live URL is missing; watcher will not start stream without announcement URL', {
      pending: pending.length,
      needed: batchSize,
      hint: 'Set YOUTUBE_LIVE_URL or youtubeLiveUrl, or set YOUTUBE_CHANNEL_LIVE_URL/youtubeChannelLiveUrl for the channel live page.',
    });
    return { started: false, reason: 'missing-youtube-live-url', pending: pending.length };
  }

  const liveConfig = liveConfigStatus();
  if (!liveConfig.hasStreamKey) {
    log('YouTube stream key is missing; watcher will not start stream', {
      pending: pending.length,
      needed: batchSize,
      liveConfig: {
        ok: liveConfig.ok,
        hasStreamKey: liveConfig.hasStreamKey,
        rtmpUrl: liveConfig.rtmpUrl,
        error: liveConfig.error,
      },
      hint: 'Set YOUTUBE_STREAM_KEY in the watcher environment or save streamKey in storage/youtube-live.json.',
    });
    return { started: false, reason: 'missing-youtube-stream-key', pending: pending.length };
  }

  const batch = pending.slice(0, Math.min(maxBatchSize, pending.length));
  log('starting YouTube Live for new Kurage shorts batch', {
    jobIds: batch.map((item) => item.jobId),
    batchSize: batch.length,
    pending: pending.length,
    policy,
  });
  let result;
  try {
    result = startBatch(batch);
  } catch (error) {
    log('YouTube Live RTMP start failed; batch will remain pending', {
      jobIds: batch.map((item) => item.jobId),
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      started: false,
      reason: 'youtube-rtmp-start-failed',
      pending: pending.length,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const resolvedAnnouncementLiveUrl = await resolveAnnouncementLiveUrlAfterStart();
  const announcementLiveUrl = resolvedAnnouncementLiveUrl.url;
  if (!announcementLiveUrl && announcementsNeedLiveUrl()) {
    log('YouTube Live watch URL could not be confirmed after stream start; stopping stream and keeping batch pending', {
      resolution: resolvedAnnouncementLiveUrl,
      ffmpegPid: result.status?.ffmpegPid,
    });
    stopBatch();
    return {
      started: false,
      reason: 'youtube-watch-url-not-confirmed',
      pending: pending.length,
      resolution: resolvedAnnouncementLiveUrl,
    };
  }
  let announcement = { skipped: true, reason: 'not-attempted' };
  let xAnnouncement = { skipped: true, reason: 'not-attempted' };
  try {
    announcement = await postAixsnsAnnouncement(batch, announcementLiveUrl);
    log('AIxSNS announcement handled', announcement);
  } catch (error) {
    announcement = {
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
    };
    log('AIxSNS announcement failed', announcement);
  }
  try {
    xAnnouncement = postXAnnouncement(batch, announcementLiveUrl);
    log('X announcement handled', xAnnouncement);
  } catch (error) {
    xAnnouncement = {
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
    };
    log('X announcement failed', xAnnouncement);
  }
  markStreamed(batch.map((item) => item.jobId), 'auto-live-started', {
    youtubeLiveUrl: announcementLiveUrl,
    youtubeLiveUrlResolution: resolvedAnnouncementLiveUrl,
    announcement,
    xAnnouncement,
  });
  log('started YouTube Live batch', { ffmpegPid: result.status?.ffmpegPid, announcement, xAnnouncement });
  return { started: true, result, announcement, xAnnouncement };
}

async function daemon() {
  const intervalSeconds = Number(process.env.KURAGE_SHORTS_WATCH_INTERVAL_SECONDS || DEFAULT_INTERVAL_SECONDS);
  writeFileSync(WATCHER_PID_PATH, `${process.pid}\n`, 'utf8');
  ensureInitialState();
  log('Kurage shorts live watcher started', {
    pid: process.pid,
    intervalSeconds,
    statePath: WATCHER_STATE_PATH,
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce();
    } catch (error) {
      log('watcher error', { error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

function status() {
  const { state, pending } = pendingShorts();
  const live = liveStatus();
  const pid = readPid(WATCHER_PID_PATH);
  const xAuth = twitterAuthStatus();
  const policy = streamPolicyStatus(state);
  console.log(
    JSON.stringify(
      {
        ok: true,
        watcher: {
          pid,
          running: isPidAlive(pid),
          logPath: WATCHER_LOG_PATH,
          statePath: WATCHER_STATE_PATH,
        },
        live: {
          running: Boolean(live.running),
          ffmpegPid: live.ffmpegPid,
          startedAt: live.startedAt,
          mergedVideo: live.mergedVideo,
        },
        announcement: {
          aixsnsEnabled: String(process.env.KURAGE_SHORTS_ANNOUNCE_AIXSNS || '1') !== '0',
          xEnabled: String(process.env.KURAGE_SHORTS_ANNOUNCE_X || '1') !== '0',
          hasTwitterCli: commandExists('twitter'),
          xAuthenticated: xAuth.authenticated,
          xAuthReason: xAuth.authenticated ? '' : xAuth.reason,
          browserUseFallbackEnabled: String(process.env.KURAGE_SHORTS_X_BROWSER_USE || '1') !== '0',
          browserUseFallbackAvailable: browserUseXAvailable(),
          hasYoutubeLiveUrl: Boolean(getAnnouncementLiveUrl()),
          youtubeLiveUrl: getYoutubeLiveUrl(),
          youtubeChannelLiveUrl: getYoutubeChannelLiveUrl(),
          announcementLiveUrl: getAnnouncementLiveUrl(),
          requireLiveUrl: announcementsNeedLiveUrl(),
          aixsnsApi: getAixsnsApiUrl(),
        },
        streamedCount: state.streamedJobIds.length,
        pendingCount: pending.length,
        pendingJobIds: pending.map((item) => item.jobId),
        streamPolicy: {
          minBatchSize: getMinBatchSize(),
          maxBatchSize: getMaxBatchSize(),
          ...policy,
        },
      },
      null,
      2,
    ),
  );
}

function startDetached() {
  if (!process.env.YOUTUBE_STREAM_KEY) {
    throw new Error('YOUTUBE_STREAM_KEY を環境変数で指定してください');
  }
  const existingPid = readPid(WATCHER_PID_PATH);
  if (isPidAlive(existingPid)) {
    console.log(JSON.stringify({ ok: true, alreadyRunning: true, pid: existingPid }, null, 2));
    return;
  }
  const out = spawn('bash', ['-lc', `exec >> ${JSON.stringify(WATCHER_LOG_PATH)} 2>&1; exec "$@"`, 'bash', process.execPath, WATCHER_SCRIPT, 'daemon'], {
    cwd: ROOT,
    detached: true,
    env: {
      ...process.env,
      KURAGE_SHORTS_WATCH_INTERVAL_SECONDS: process.env.KURAGE_SHORTS_WATCH_INTERVAL_SECONDS || String(DEFAULT_INTERVAL_SECONDS),
    },
    stdio: 'ignore',
  });
  out.unref();
  writeFileSync(WATCHER_PID_PATH, `${out.pid}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, pid: out.pid, logPath: WATCHER_LOG_PATH }, null, 2));
}

function stopDetached() {
  const pid = readPid(WATCHER_PID_PATH);
  if (isPidAlive(pid)) process.kill(pid, 'SIGTERM');
  console.log(JSON.stringify({ ok: true, stoppedPid: pid }, null, 2));
}

const command = process.argv[2] || 'status';
try {
  if (command === 'daemon') await daemon();
  else if (command === 'once') console.log(JSON.stringify(await runOnce(), null, 2));
  else if (command === 'start') startDetached();
  else if (command === 'stop') stopDetached();
  else if (command === 'status') status();
  else if (command === 'init-baseline') {
    const existing = listShorts(DEFAULT_SCAN_LIMIT).map((item) => item.jobId);
    console.log(JSON.stringify(markStreamed(existing, 'manual-baseline-existing'), null, 2));
  }
  else if (command === 'init-current') {
    const ids = currentStreamingJobIds();
    console.log(JSON.stringify(markStreamed(ids, 'manual-init-current'), null, 2));
  } else {
    throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}

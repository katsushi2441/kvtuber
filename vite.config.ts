import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KURAGE_PYTHON = process.env.KURAGE_TTS_PYTHON || 'python3';
const KURAGE_TTS_SCRIPT = process.env.KURAGE_TTS_SCRIPT || join(__dirname, 'scripts/kurage-edge-tts.py');
const ADMIN_TOKEN = process.env.KURAGE_ADMIN_TOKEN || 'change-me';
const KVTUBER_PORT = Number(process.env.KVTUBER_PORT || 18308);
const KVTUBER_ALLOWED_HOSTS = (process.env.KVTUBER_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);
const DEFAULT_ALLOWED_HOSTS = ['exbridge.ddns.net'];
const PROGRAMS_PATH = join(__dirname, 'storage/programs.json');
const SCHEDULE_PATH = join(__dirname, 'storage/schedule.json');
const YOUTUBE_LIVE_PATH = join(__dirname, 'storage/youtube-live.json');
const YOUTUBE_LIVE_SCRIPT = join(__dirname, 'scripts/youtube-live-rtmp.mjs');
const KDECK_BASE_URL = (process.env.KVTUBER_KDECK_BASE_URL || 'http://127.0.0.1:18301').replace(/\/+$/, '');
const KDECK_TOKEN = process.env.KVTUBER_KDECK_TOKEN || process.env.KDECK_TOKEN || '';
const KDECK_DEFAULT_CWD = process.env.KVTUBER_KDECK_DEFAULT_CWD || '/home/kojima/work/kdeck';
const KDECK_DEFAULT_LOCAL_CWD = process.env.KVTUBER_KDECK_LOCAL_CWD || '/home/kojima/work/kdeck';
const KDECK_DEFAULT_MODEL = process.env.KVTUBER_KDECK_MODEL || 'gpt-5.5';

interface BroadcastProgram {
  id: string;
  title: string;
  description: string;
  theme: string;
  topicsText: string;
  intervalSeconds: number;
  teacherMode: boolean;
}

interface ViewerStatus {
  phase: string;
  label: string;
  autonomousEnabled: boolean;
  isProcessing?: boolean;
  isSpeaking?: boolean;
  currentTopic?: string;
  nextRunAt?: number | null;
  programTitle?: string;
  commandClients?: number;
  updatedAt: number;
}

interface BroadcastSchedule {
  enabled: boolean;
  items: BroadcastScheduleItem[];
  keepYoutubeArchive: boolean;
}

interface BroadcastScheduleItem {
  id: string;
  programId: string;
  time: string;
}

interface YoutubeLiveConfig {
  enabled: boolean;
  rtmpUrl: string;
  streamKey: string;
  viewerUrl: string;
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  audioBitrate: string;
  display: string;
}

interface KdeckChatTaskRequest {
  message?: string;
  history?: Array<{
    role?: string;
    content?: string;
  }>;
  cwd?: string;
  executionMode?: string;
  targetAgent?: string;
  model?: string;
}

function readRequestBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function runKurageTts(payload: unknown, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      KURAGE_PYTHON,
      [KURAGE_TTS_SCRIPT, '--output', outputPath],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const stderr: Buffer[] = [];

    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Kurage TTS failed (${code}): ${Buffer.concat(stderr).toString('utf8')}`,
        ),
      );
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

function kurageTtsPlugin() {
  return {
    name: 'kurage-edge-tts',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        '/kurage-tts/v1/audio/speech',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          const workDir = await mkdtemp(join(tmpdir(), 'kurage-tts-'));

          const outputPath = join(workDir, 'speech.mp3');

          try {
            const rawBody = await readRequestBody(req);
            const payload = JSON.parse(rawBody || '{}');
            await runKurageTts(payload, outputPath);
            const audio = await readFile(outputPath);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Length', String(audio.byteLength));
            res.end(audio);
          } catch (error) {
            console.error(error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          } finally {
            await rm(workDir, { recursive: true, force: true }).catch(() => {});
          }
        },
      );
    },
  };
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function loadPrograms(): Promise<BroadcastProgram[]> {
  try {
    const raw = await readFile(PROGRAMS_PATH, 'utf8');
    const programs = JSON.parse(raw);
    return Array.isArray(programs) ? programs : [];
  } catch {
    return [];
  }
}

async function savePrograms(programs: BroadcastProgram[]) {
  await writeFile(
    PROGRAMS_PATH,
    `${JSON.stringify(programs, null, 2)}\n`,
    'utf8',
  );
}

function defaultSchedule(): BroadcastSchedule {
  return {
    enabled: true,
    items: [],
    keepYoutubeArchive: false,
  };
}

function normalizeTime(time: string) {
  const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeSchedule(schedule: Partial<BroadcastSchedule>) {
  const fallback = defaultSchedule();
  const rawItems = Array.isArray(schedule.items) ? schedule.items : [];
  const items = rawItems
    .map((item) => {
      const programId = String(item?.programId || '').trim();
      const time = normalizeTime(String(item?.time || ''));
      if (!programId || !time) return null;
      return {
        id: String(item?.id || `${programId}-${time}`).trim(),
        programId,
        time,
      };
    })
    .filter((item): item is BroadcastScheduleItem => Boolean(item));
  const deduped = Array.from(
    new Map(items.map((item) => [`${item.programId}-${item.time}`, item])).values(),
  ).sort((a, b) => a.time.localeCompare(b.time) || a.programId.localeCompare(b.programId));
  return {
    enabled: schedule.enabled !== false,
    items: deduped.length > 0 ? deduped : fallback.items,
    keepYoutubeArchive: Boolean(schedule.keepYoutubeArchive),
  };
}

async function loadSchedule(): Promise<BroadcastSchedule> {
  try {
    const raw = await readFile(SCHEDULE_PATH, 'utf8');
    return normalizeSchedule(JSON.parse(raw));
  } catch {
    return defaultSchedule();
  }
}

async function saveSchedule(schedule: BroadcastSchedule) {
  await writeFile(
    SCHEDULE_PATH,
    `${JSON.stringify(normalizeSchedule(schedule), null, 2)}\n`,
    'utf8',
  );
}

function defaultYoutubeLiveConfig(): YoutubeLiveConfig {
  return {
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
}

function normalizeYoutubeLiveConfig(
  config: Partial<YoutubeLiveConfig>,
  existing?: YoutubeLiveConfig,
): YoutubeLiveConfig {
  const fallback = existing || defaultYoutubeLiveConfig();
  const width = Number(config.width || fallback.width);
  const height = Number(config.height || fallback.height);
  const fps = Number(config.fps || fallback.fps);

  return {
    enabled: config.enabled !== false,
    rtmpUrl: String(config.rtmpUrl || fallback.rtmpUrl).trim(),
    streamKey:
      typeof config.streamKey === 'string'
        ? config.streamKey.trim()
        : fallback.streamKey,
    viewerUrl: String(config.viewerUrl || fallback.viewerUrl).trim(),
    width: Number.isFinite(width) && width > 0 ? width : fallback.width,
    height: Number.isFinite(height) && height > 0 ? height : fallback.height,
    fps: Number.isFinite(fps) && fps > 0 ? fps : fallback.fps,
    videoBitrate: String(config.videoBitrate || fallback.videoBitrate).trim(),
    audioBitrate: String(config.audioBitrate || fallback.audioBitrate).trim(),
    display: String(config.display || fallback.display).trim(),
  };
}

function maskYoutubeLiveConfig(config: YoutubeLiveConfig) {
  return {
    ...config,
    streamKey: '',
    hasStreamKey: Boolean(config.streamKey),
  };
}

async function loadYoutubeLiveConfig(): Promise<YoutubeLiveConfig> {
  try {
    const raw = await readFile(YOUTUBE_LIVE_PATH, 'utf8');
    return normalizeYoutubeLiveConfig(JSON.parse(raw));
  } catch {
    return defaultYoutubeLiveConfig();
  }
}

async function saveYoutubeLiveConfig(config: YoutubeLiveConfig) {
  await writeFile(
    YOUTUBE_LIVE_PATH,
    `${JSON.stringify(normalizeYoutubeLiveConfig(config), null, 2)}\n`,
    'utf8',
  );
}

function runYoutubeLiveCommand(command: 'start' | 'stop' | 'status') {
  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(process.execPath, [YOUTUBE_LIVE_SCRIPT, command], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      const output = Buffer.concat(stdout).toString('utf8').trim();
      const errorOutput = Buffer.concat(stderr).toString('utf8').trim();
      const raw = output || errorOutput || '{}';
      const parsed = JSON.parse(raw);
      if (code === 0 && parsed?.ok !== false) {
        resolve(parsed);
        return;
      }
      reject(new Error(parsed?.error || errorOutput || `youtube live failed (${code})`));
    });
  });
}

function normalizeProgram(program: Partial<BroadcastProgram>) {
  const id = String(program.id || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  const title = String(program.title || '').trim();
  const topicsText = String(program.topicsText || '').trim();
  const intervalSeconds = Number(program.intervalSeconds || 3);

  if (!id || !title || !topicsText) {
    throw new Error('program id, title, and topicsText are required');
  }

  return {
    id,
    title,
    description: String(program.description || '').trim(),
    theme: String(program.theme || title).trim(),
    topicsText,
    intervalSeconds:
      Number.isFinite(intervalSeconds) && intervalSeconds > 0
        ? intervalSeconds
        : 3,
    teacherMode: Boolean(program.teacherMode),
  };
}

function getToken(req: IncomingMessage) {
  const url = new URL(req.url || '/', 'http://localhost');
  const headerToken = req.headers['x-admin-token'];
  return (
    url.searchParams.get('token') ||
    (Array.isArray(headerToken) ? headerToken[0] : headerToken) ||
    ''
  );
}

function normalizeKdeckChatTask(body: KdeckChatTaskRequest) {
  const message = String(body.message || '').trim();
  if (!message) throw new Error('message is required');
  const history = Array.isArray(body.history)
    ? body.history
        .map((item) => ({
          role: String(item?.role || '').trim(),
          content: String(item?.content || '').trim(),
        }))
        .filter((item) => item.role && item.content)
        .slice(-12)
    : [];
  return {
    message,
    history,
    cwd: String(body.cwd || KDECK_DEFAULT_CWD).trim() || KDECK_DEFAULT_CWD,
    executionMode: String(body.executionMode || 'full-access').trim() || 'full-access',
    targetAgent: String(body.targetAgent || 'local').trim() || 'local',
    model: String(body.model || KDECK_DEFAULT_MODEL).trim() || KDECK_DEFAULT_MODEL,
  };
}

function buildKdeckChatPrompt(task: ReturnType<typeof normalizeKdeckChatTask>) {
  const history = task.history.length
    ? task.history
        .map((item) => `${item.role === 'user' ? 'ユーザー' : 'kvtuber'}: ${item.content}`)
        .join('\n')
    : 'なし';
  return [
    'あなたは Kurage AI VTuber の業務チャット担当です。',
    'ユーザーはkvtuberに自然文で相談・依頼します。',
    '通常の相談なら短く自然に返答してください。',
    '実作業が必要な依頼なら、kdeckのAgent Taskとして実行する前提で、作業内容を整理して進めてください。',
    'ブログ投稿、ファイル編集、調査、動画制作、GitHub管理など、依頼内容はブログに限定しません。',
    'デモ制作の依頼では、必要に応じてkargovでブラウザ操作や画面を録画し、解説付き動画にまとめ、kurageへ投稿し、URLを報告してください。',
    'kargovで生成したMP4をkurageへ登録するときは /home/kojima/work/kargov/scripts/register_kargov_video_to_kurage.py を使ってください。',
    'VWork blog、kargov、kurageなど複数リポジトリをまたぐ作業では /home/kojima/work を基準に必要なリポジトリへ移動してください。',
    '公開や投稿を含む依頼は、GitHub PagesのURL、kuragev.phpのURL、関連commit/push完了を確認できるまで完了扱いにしないでください。',
    '途中で失敗した場合は status を成功のように書かず、どの成果物が未完了かを最初に明記してください。',
    'できていないことをできたとは書かず、実行結果・未完了・次に必要なことを明確にしてください。',
    '',
    '会話履歴:',
    history,
    '',
    '今回のユーザー発話:',
    task.message,
    '',
    'この依頼は kvtuber -> kdeck -> AI Agent の流れで扱います。',
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

async function submitKdeckChat(prompt: string, task: ReturnType<typeof normalizeKdeckChatTask>) {
  if (!KDECK_TOKEN) {
    throw new Error('KVTUBER_KDECK_TOKEN or KDECK_TOKEN is not configured');
  }

  const response = await fetch(`${KDECK_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KDECK_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      cwd: task.cwd,
      local_cwd: KDECK_DEFAULT_LOCAL_CWD,
      model: task.model,
      execution_mode: task.executionMode,
      target_agent: task.targetAgent,
      remote_llm_backend: 'codex-cli',
      remote_model: task.model,
    }),
  });
  const result = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new Error(String(result.detail || result.error || `kdeck HTTP ${response.status}`));
  }
  return result;
}

async function loadKdeckChatJob(jobId: string) {
  if (!KDECK_TOKEN) {
    throw new Error('KVTUBER_KDECK_TOKEN or KDECK_TOKEN is not configured');
  }
  const safeJobId = jobId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeJobId) throw new Error('job_id is required');
  const response = await fetch(`${KDECK_BASE_URL}/api/chat/${encodeURIComponent(safeJobId)}`, {
    headers: {
      Authorization: `Bearer ${KDECK_TOKEN}`,
      Accept: 'application/json',
    },
  });
  const result = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new Error(String(result.detail || result.error || `kdeck HTTP ${response.status}`));
  }
  return result;
}

function adminControlPlugin() {
  const clients = new Set<ServerResponse>();
  const statusClients = new Set<ServerResponse>();
  let latestProgramCommand: unknown = null;
  let latestViewerStatus: unknown = {
    phase: 'unknown',
    label: 'viewer未接続',
    updatedAt: Date.now(),
  };

  const broadcast = (payload: unknown) => {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      client.write(data);
    }
  };

  const broadcastStatus = (payload: unknown) => {
    latestViewerStatus = payload;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of statusClients) {
      client.write(data);
    }
  };

  const startProgram = async (programId: string, autoplay = true) => {
    const programs = await loadPrograms();
    const program = programs.find((item) => item.id === programId);
    if (!program) {
      throw new Error('program not found');
    }

    const command = {
      type: 'apply_program',
      program,
      autoplay,
      sentAt: Date.now(),
    };
    latestProgramCommand = command;
    broadcast(command);
    broadcastStatus({
      phase: autoplay ? 'starting' : 'waiting',
      label:
        clients.size > 0
          ? autoplay
            ? '配信開始中'
            : 'viewer待機中'
          : 'viewer接続待ち',
      autonomousEnabled: autoplay,
      isProcessing: false,
      isSpeaking: false,
      currentTopic: '',
      nextRunAt: null,
      programTitle: program.title,
      commandClients: clients.size,
      updatedAt: Date.now(),
    } satisfies ViewerStatus);
    return {
      clients: clients.size,
      program,
      autoplay: command.autoplay,
    };
  };

  let lastScheduleRunKey = '';
  const checkSchedule = async () => {
    const schedule = await loadSchedule();
    if (!schedule.enabled) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes(),
    ).padStart(2, '0')}`;
    const dueItems = schedule.items.filter((item) => item.time === time);
    if (dueItems.length === 0) return;

    const runKey = `${now.toISOString().slice(0, 10)}-${time}-${dueItems
      .map((item) => item.id)
      .join(',')}`;
    if (runKey === lastScheduleRunKey) return;
    lastScheduleRunKey = runKey;

    for (const item of dueItems) {
      try {
        const result = await startProgram(item.programId, true);
        console.log(
          `[kurage-schedule] started ${result.program.id} at ${time}; clients=${result.clients}`,
        );
      } catch (error) {
        console.error('[kurage-schedule] failed:', error);
      }
    }
  };

  return {
    name: 'kurage-admin-control',
    configureServer(server: ViteDevServer) {
      const scheduleTimer = setInterval(() => {
        void checkSchedule();
      }, 15_000);
      server.httpServer?.once('close', () => clearInterval(scheduleTimer));

      server.middlewares.use(
        '/control/events',
        (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
          res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
          clients.add(res);
          if (latestProgramCommand) {
            res.write(`data: ${JSON.stringify(latestProgramCommand)}\n\n`);
          }

          req.on('close', () => {
            clients.delete(res);
          });
        },
      );

      server.middlewares.use(
        '/control/status-events',
        (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
          res.write(`data: ${JSON.stringify(latestViewerStatus)}\n\n`);
          statusClients.add(res);

          req.on('close', () => {
            statusClients.delete(res);
          });
        },
      );

      server.middlewares.use(
        '/control/status',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          try {
            const rawBody = await readRequestBody(req);
            const status = JSON.parse(rawBody || '{}');
            broadcastStatus({ ...status, updatedAt: Date.now() });
            sendJson(res, 200, {
              ok: true,
              clients: statusClients.size,
            });
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/command',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          if (getToken(req) !== ADMIN_TOKEN) {
            sendJson(res, 403, { error: 'invalid admin token' });
            return;
          }

          try {
            const rawBody = await readRequestBody(req);
            const command = JSON.parse(rawBody || '{}');
            broadcast({ ...command, sentAt: Date.now() });
            if (command?.type === 'stop') {
              latestProgramCommand = null;
              broadcastStatus({
                phase: 'stopped',
                label: '停止中',
                autonomousEnabled: false,
                isProcessing: false,
                isSpeaking: false,
                currentTopic: '',
                nextRunAt: null,
                updatedAt: Date.now(),
              });
            }
            sendJson(res, 200, { ok: true, clients: clients.size });
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/kdeck/chat',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          if (getToken(req) !== ADMIN_TOKEN) {
            sendJson(res, 403, { error: 'invalid admin token' });
            return;
          }

          try {
            const rawBody = await readRequestBody(req);
            const task = normalizeKdeckChatTask(JSON.parse(rawBody || '{}'));
            const prompt = buildKdeckChatPrompt(task);
            const result = await submitKdeckChat(prompt, task);
            const jobId = String(result.job_id || '').trim();
            broadcast({
              type: 'speak_now',
              text: `kdeckに依頼を送りました。ジョブIDは ${jobId || '未取得'} です。完了したら結果を確認します。`,
              instruction:
                '業務依頼を受け付け、kdeckへ送ったことを短く自然に報告してください。',
              sentAt: Date.now(),
            });
            sendJson(res, 200, {
              ok: true,
              kdeckBaseUrl: KDECK_BASE_URL,
              job: result,
              promptPreview: prompt.slice(0, 1200),
            });
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/kdeck/task',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          if (getToken(req) !== ADMIN_TOKEN) {
            sendJson(res, 403, { error: 'invalid admin token' });
            return;
          }

          try {
            const url = new URL(req.url || '/', 'http://localhost');
            const jobId = String(url.searchParams.get('job_id') || '').trim();
            const result = await loadKdeckChatJob(jobId);
            sendJson(res, 200, { ok: true, job: result });
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/programs',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method === 'GET') {
            sendJson(res, 200, { programs: await loadPrograms() });
            return;
          }

          if (req.method === 'DELETE') {
            if (getToken(req) !== ADMIN_TOKEN) {
              sendJson(res, 403, { error: 'invalid admin token' });
              return;
            }

            try {
              const rawBody = await readRequestBody(req);
              const body = JSON.parse(rawBody || '{}') as { id?: string };
              const id = String(body.id || '').trim();
              if (!id) {
                sendJson(res, 400, { error: 'program id is required' });
                return;
              }
              const programs = await loadPrograms();
              const nextPrograms = programs.filter((item) => item.id !== id);
              if (nextPrograms.length === programs.length) {
                sendJson(res, 404, { error: 'program not found' });
                return;
              }
              await savePrograms(nextPrograms);
              sendJson(res, 200, { ok: true, programs: nextPrograms });
            } catch (error) {
              sendJson(res, 400, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
            return;
          }

          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          if (getToken(req) !== ADMIN_TOKEN) {
            sendJson(res, 403, { error: 'invalid admin token' });
            return;
          }

          try {
            const rawBody = await readRequestBody(req);
            const program = normalizeProgram(JSON.parse(rawBody || '{}'));
            const programs = await loadPrograms();
            const nextPrograms = [
              program,
              ...programs.filter((item) => item.id !== program.id),
            ];
            await savePrograms(nextPrograms);
            sendJson(res, 200, { ok: true, program, programs: nextPrograms });
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/schedule',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method === 'GET') {
            sendJson(res, 200, { schedule: await loadSchedule() });
            return;
          }

          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          if (getToken(req) !== ADMIN_TOKEN) {
            sendJson(res, 403, { error: 'invalid admin token' });
            return;
          }

          try {
            const rawBody = await readRequestBody(req);
            const schedule = normalizeSchedule(JSON.parse(rawBody || '{}'));
            await saveSchedule(schedule);
            sendJson(res, 200, { ok: true, schedule });
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/youtube-live/status',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          try {
            sendJson(res, 200, await runYoutubeLiveCommand('status'));
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/youtube-live/start',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          if (getToken(req) !== ADMIN_TOKEN) {
            sendJson(res, 403, { error: 'invalid admin token' });
            return;
          }

          try {
            sendJson(res, 200, await runYoutubeLiveCommand('start'));
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/youtube-live/stop',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          if (getToken(req) !== ADMIN_TOKEN) {
            sendJson(res, 403, { error: 'invalid admin token' });
            return;
          }

          try {
            sendJson(res, 200, await runYoutubeLiveCommand('stop'));
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/youtube-live',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method === 'GET') {
            sendJson(res, 200, {
              config: maskYoutubeLiveConfig(await loadYoutubeLiveConfig()),
            });
            return;
          }

          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          if (getToken(req) !== ADMIN_TOKEN) {
            sendJson(res, 403, { error: 'invalid admin token' });
            return;
          }

          try {
            const existing = await loadYoutubeLiveConfig();
            const rawBody = await readRequestBody(req);
            const body = JSON.parse(rawBody || '{}') as Partial<YoutubeLiveConfig> & {
              clearStreamKey?: boolean;
            };
            const config = normalizeYoutubeLiveConfig(
              {
                ...body,
                streamKey: body.clearStreamKey ? '' : body.streamKey,
              },
              existing,
            );
            await saveYoutubeLiveConfig(config);
            sendJson(res, 200, {
              ok: true,
              config: maskYoutubeLiveConfig(config),
            });
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      server.middlewares.use(
        '/control/start-program',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          if (getToken(req) !== ADMIN_TOKEN) {
            sendJson(res, 403, { error: 'invalid admin token' });
            return;
          }

          try {
            const rawBody = await readRequestBody(req);
            const body = JSON.parse(rawBody || '{}') as {
              programId?: string;
              autoplay?: boolean;
            };
            const result = await startProgram(
              body.programId || '',
              body.autoplay !== false,
            );
            sendJson(res, 200, {
              ok: true,
              clients: result.clients,
              program: result.program,
              autoplay: result.autoplay,
            });
          } catch (error) {
            sendJson(res, error instanceof Error && error.message === 'program not found' ? 404 : 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), kurageTtsPlugin(), adminControlPlugin()],
  build: {
    target: ['es2020', 'safari14'],
  },
  server: {
    host: '0.0.0.0',
    port: KVTUBER_PORT,
    strictPort: true,
    allowedHosts: Array.from(
      new Set([...DEFAULT_ALLOWED_HOSTS, ...KVTUBER_ALLOWED_HOSTS]),
    ),
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', 'http://127.0.0.1:11434');
          });
        },
        rewrite: (path) => path.replace(/^\/ollama/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: KVTUBER_PORT,
    strictPort: true,
  },
});

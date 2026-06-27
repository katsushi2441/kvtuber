import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_BROADCAST_PROGRAMS,
  type BroadcastProgram,
} from '../programs';

type ViewerStatus = {
  phase?: string;
  label?: string;
  autonomousEnabled?: boolean;
  programTitle?: string;
  currentTopic?: string;
  nextTopic?: string;
  topicIndex?: number;
  topicCount?: number;
  turnCount?: number;
  audioUnlocked?: boolean;
  commandClients?: number;
  updatedAt?: number;
};

type BroadcastSchedule = {
  enabled: boolean;
  items: BroadcastScheduleItem[];
  keepYoutubeArchive: boolean;
};

type BroadcastScheduleItem = {
  id: string;
  programId: string;
  time: string;
};

type YoutubeLiveConfig = {
  enabled: boolean;
  rtmpUrl: string;
  streamKey: string;
  hasStreamKey?: boolean;
  viewerUrl: string;
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  audioBitrate: string;
  display: string;
};

type YoutubeLiveStatus = {
  running?: boolean;
  startedAt?: string;
  stoppedAt?: string;
  viewerUrl?: string;
  ffmpegPid?: number;
  logs?: {
    ffmpeg?: string;
    chrome?: string;
  };
};

function getInitialToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || localStorage.getItem('kurage-admin-token') || '';
}

function createBlankProgram(): BroadcastProgram {
  return {
    id: `program-${new Date().toISOString().slice(0, 10)}`,
    title: '新しい番組',
    description: '',
    theme: 'VTuberくらげが、視聴者に向けてわかりやすく解説する番組。',
    topicsText: [
      'こんにちは、VTuberくらげです。今日はこの番組のテーマを、はじめての人にもわかりやすく話していきます。',
      'まず背景から整理します。このテーマは、難しく見えても小さく分けるとかなり扱いやすくなります。',
      'たとえば、最初の一歩は大きな完成品を目指すことではなく、試せる小さな作業を1つ決めることです。',
      '今日のまとめです。気になったところを1つだけ選んで、次の作業として試してみてください。',
    ].join('\n'),
    intervalSeconds: 3,
    teacherMode: true,
  };
}

function countTopics(program: BroadcastProgram) {
  return program.topicsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export function AdminConsole() {
  const [token, setToken] = useState(getInitialToken);
  const [programs, setPrograms] = useState<BroadcastProgram[]>(
    DEFAULT_BROADCAST_PROGRAMS,
  );
  const [selectedProgramId, setSelectedProgramId] = useState(
    DEFAULT_BROADCAST_PROGRAMS[0]?.id || '',
  );
  const selectedProgram =
    programs.find((program) => program.id === selectedProgramId) || programs[0];
  const [draft, setDraft] = useState<BroadcastProgram>(
    selectedProgram || createBlankProgram(),
  );
  const [viewerStatus, setViewerStatus] = useState<ViewerStatus>({
    phase: 'unknown',
    label: 'viewer未接続',
  });
  const [schedule, setSchedule] = useState<BroadcastSchedule>({
    enabled: true,
    items: [],
    keepYoutubeArchive: false,
  });
  const [youtubeLiveConfig, setYoutubeLiveConfig] = useState<YoutubeLiveConfig>({
    enabled: true,
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: '',
    hasStreamKey: false,
    viewerUrl: 'http://127.0.0.1:18308/viewer?broadcast=1',
    width: 1280,
    height: 720,
    fps: 30,
    videoBitrate: '2500k',
    audioBitrate: '128k',
    display: ':98',
  });
  const [youtubeLiveStatus, setYoutubeLiveStatus] = useState<YoutubeLiveStatus>({
    running: false,
  });
  const [scheduleTimesText, setScheduleTimesText] = useState('');
  const [youtubeStreamKeyText, setYoutubeStreamKeyText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [status, setStatus] = useState('');
  const [isSending, setIsSending] = useState(false);

  const authToken = token.trim();
  const isLive = Boolean(viewerStatus.autonomousEnabled);
  const viewerLabel = viewerStatus.label || '状態不明';
  const activeProgramTitle = viewerStatus.programTitle || '未選択';
  const topicProgress = viewerStatus.topicCount
    ? `${viewerStatus.topicIndex || 0}/${viewerStatus.topicCount}件`
    : '未開始';
  const viewerConnectionLabel =
    typeof viewerStatus.commandClients === 'number'
      ? `viewer接続: ${viewerStatus.commandClients}件`
      : '';

  const selectedProgramTopicCount = useMemo(
    () => (selectedProgram ? countTopics(selectedProgram) : 0),
    [selectedProgram],
  );
  const scheduleRows = schedule.items
    .map((item) => ({
      ...item,
      program: programs.find((program) => program.id === item.programId),
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const saveToken = () => {
    if (authToken) localStorage.setItem('kurage-admin-token', authToken);
  };

  const loadPrograms = async () => {
    const response = await fetch('/control/programs');
    const result = await response.json();
    if (Array.isArray(result.programs) && result.programs.length > 0) {
      setPrograms(result.programs);
      setSelectedProgramId((current) => current || result.programs[0].id);
    }
  };

  const loadSchedule = async () => {
    const response = await fetch('/control/schedule');
    const result = await response.json();
    if (result.schedule) {
      setSchedule(result.schedule);
      setScheduleTimesText('');
    }
  };

  const loadYoutubeLive = async () => {
    const [configResponse, statusResponse] = await Promise.all([
      fetch('/control/youtube-live'),
      fetch('/control/youtube-live/status'),
    ]);
    const configResult = await configResponse.json();
    const statusResult = await statusResponse.json();
    if (configResult.config) {
      setYoutubeLiveConfig(configResult.config);
      setYoutubeStreamKeyText('');
    }
    if (statusResult.status) setYoutubeLiveStatus(statusResult.status);
  };

  const requestWithToken = async (path: string, init: RequestInit) => {
    if (!authToken) throw new Error('管理者トークンを入力してください');
    saveToken();
    const url = new URL(path, window.location.origin);
    url.searchParams.set('token', authToken);
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  };

  const runAction = async (label: string, action: () => Promise<void>) => {
    setIsSending(true);
    setStatus(`${label}中...`);
    try {
      await action();
      setStatus(`${label}しました`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSending(false);
    }
  };

  const programForSave = () => {
    const title = draft.title.trim();
    const description = draft.description.trim();
    return {
      ...draft,
      title,
      description,
      theme: `${title}。${description || '視聴者にわかりやすく解説する番組。'}`,
      topicsText: draft.topicsText.trim(),
    };
  };

  const saveProgram = () =>
    runAction('番組を保存', async () => {
      const program = programForSave();
      const result = await requestWithToken('/control/programs', {
        method: 'POST',
        body: JSON.stringify(program),
      });
      const nextPrograms = result.programs as BroadcastProgram[];
      setPrograms(nextPrograms);
      setSelectedProgramId(result.program.id);
    });

  const deleteProgram = () =>
    runAction('番組を削除', async () => {
      if (!selectedProgram) throw new Error('削除する番組がありません');
      const result = await requestWithToken('/control/programs', {
        method: 'DELETE',
        body: JSON.stringify({ id: selectedProgram.id }),
      });
      const nextPrograms = result.programs as BroadcastProgram[];
      setPrograms(nextPrograms);
      const nextSelected = nextPrograms[0] || createBlankProgram();
      setSelectedProgramId(nextSelected.id);
      setDraft(nextSelected);
    });

  const startProgram = () =>
    runAction('配信開始', async () => {
      if (!selectedProgram) throw new Error('配信する番組がありません');
      await requestWithToken('/control/start-program', {
        method: 'POST',
        body: JSON.stringify({ programId: selectedProgram.id, autoplay: true }),
      });
    });

  const stopProgram = () =>
    runAction('停止', async () => {
      await requestWithToken('/control/command', {
        method: 'POST',
        body: JSON.stringify({ type: 'stop' }),
      });
      setViewerStatus((current) => ({
        ...current,
        phase: 'stopped',
        label: '停止中',
        autonomousEnabled: false,
      }));
    });

  const saveProgramSchedule = () =>
    runAction('配信時間を保存', async () => {
      if (!selectedProgram) throw new Error('番組を選択してください');
      const times = scheduleTimesText
        .split('\n')
        .map((time) => time.trim())
        .filter(Boolean);
      if (times.length === 0) throw new Error('配信時刻を入力してください');

      const addedItems = times.map((time) => ({
        id: `${selectedProgram.id}-${time}`,
        programId: selectedProgram.id,
        time,
      }));
      const mergedItems = Array.from(
        new Map(
          [...schedule.items, ...addedItems].map((item) => [
            `${item.programId}-${item.time}`,
            item,
          ]),
        ).values(),
      );
      const nextSchedule = {
        ...schedule,
        items: mergedItems,
        keepYoutubeArchive: false,
      };
      const result = await requestWithToken('/control/schedule', {
        method: 'POST',
        body: JSON.stringify(nextSchedule),
      });
      setSchedule(result.schedule);
      setScheduleTimesText('');
    });

  const deleteScheduleItem = (itemId: string) =>
    runAction('配信予定を削除', async () => {
      const nextSchedule = {
        ...schedule,
        items: schedule.items.filter((item) => item.id !== itemId),
      };
      const result = await requestWithToken('/control/schedule', {
        method: 'POST',
        body: JSON.stringify(nextSchedule),
      });
      setSchedule(result.schedule);
    });

  const replyToComment = () =>
    runAction('コメントへ返答', async () => {
      const comment = commentText.trim();
      if (!comment) throw new Error('コメントを入力してください');
      await requestWithToken('/control/command', {
        method: 'POST',
        body: JSON.stringify({
          type: 'speak_now',
          text: `視聴者コメント: ${comment}`,
          instruction:
            '視聴者コメントに自然に返答してください。短く、聞き取りやすく、番組の流れを壊さないように答えてください。返答後は通常の番組進行に戻ります。',
        }),
      });
      setCommentText('');
    });

  const saveYoutubeLive = () =>
    runAction('YouTube配信設定を保存', async () => {
      const result = await requestWithToken('/control/youtube-live', {
        method: 'POST',
        body: JSON.stringify({
          ...youtubeLiveConfig,
          streamKey: youtubeStreamKeyText.trim() || undefined,
        }),
      });
      if (result.config) {
        setYoutubeLiveConfig(result.config);
        setYoutubeStreamKeyText('');
      }
    });

  const startYoutubeLive = () =>
    runAction('YouTube配信を開始', async () => {
      if (youtubeStreamKeyText.trim()) {
        await requestWithToken('/control/youtube-live', {
          method: 'POST',
          body: JSON.stringify({
            ...youtubeLiveConfig,
            streamKey: youtubeStreamKeyText.trim(),
          }),
        });
        setYoutubeStreamKeyText('');
      }
      const result = await requestWithToken('/control/youtube-live/start', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (result.status) setYoutubeLiveStatus(result.status);
      await loadYoutubeLive();
    });

  const stopYoutubeLive = () =>
    runAction('YouTube配信を停止', async () => {
      const result = await requestWithToken('/control/youtube-live/stop', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (result.status) setYoutubeLiveStatus(result.status);
      await loadYoutubeLive();
    });

  useEffect(() => {
    void loadPrograms().catch((error) => {
      console.warn('Failed to load broadcast programs:', error);
    });
    void loadSchedule().catch((error) => {
      console.warn('Failed to load broadcast schedule:', error);
    });
    void loadYoutubeLive().catch((error) => {
      console.warn('Failed to load YouTube Live settings:', error);
    });
  }, []);

  useEffect(() => {
    if (selectedProgram) setDraft(selectedProgram);
  }, [selectedProgram]);

  useEffect(() => {
    const source = new EventSource('/control/status-events');
    source.onmessage = (event) => {
      try {
        setViewerStatus(JSON.parse(event.data) as ViewerStatus);
      } catch (error) {
        console.warn('Failed to parse viewer status:', error);
      }
    };
    source.onerror = () => {
      setViewerStatus((current) => ({
        ...current,
        phase: 'disconnected',
        label: 'viewer状態取得待ち',
      }));
    };
    return () => source.close();
  }, []);

  return (
    <div className="admin-page admin-simple-page">
      <header className="admin-simple-hero">
        <div>
          <div className="admin-kicker">Kurage Program Manager</div>
          <h1>番組管理</h1>
          <p>番組を作って、選んで、普通viewerまたは配信用viewerで開始します。</p>
        </div>
        <div className="admin-viewer-actions">
          <a className="admin-viewer-link-secondary" href="/chat" target="_blank">
            kvtuberと対話
          </a>
          <a className="admin-viewer-link-secondary" href="/viewer" target="_blank">
            普通viewerを開く
          </a>
          <a
            className="admin-viewer-link"
            href="/viewer?broadcast=1"
            target="_blank"
          >
            配信用viewerを開く
          </a>
        </div>
      </header>

      <section className="admin-simple-status">
        <div className={`admin-state-pill ${isLive ? 'is-live' : ''}`}>
          <span className="admin-state-dot" />
          {isLive ? '配信中' : '停止中'}
        </div>
        <div className="admin-state-pill">viewer: {viewerLabel}</div>
        {viewerConnectionLabel && (
          <div className="admin-state-pill">{viewerConnectionLabel}</div>
        )}
        <div className="admin-state-pill">現在の番組: {activeProgramTitle}</div>
        <div className="admin-state-pill">進行: {topicProgress}</div>
      </section>

      <main className="admin-simple-grid">
        <section className="admin-card admin-simple-card">
          <div className="admin-section-heading">
            <h2>番組を作る</h2>
            <button
              className="admin-secondary"
              disabled={isSending}
              onClick={() => {
                const next = createBlankProgram();
                setDraft(next);
                setSelectedProgramId(next.id);
              }}
            >
              新規番組
            </button>
          </div>

          <label className="admin-field">
            <span>番組名</span>
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>

          <label className="admin-field">
            <span>説明</span>
            <input
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>

          <label className="admin-field">
            <span>台本 1行1セリフ</span>
            <textarea
              value={draft.topicsText}
              rows={10}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  topicsText: event.target.value,
                }))
              }
            />
          </label>

          <div className="admin-program-grid">
            <label className="admin-field">
              <span>発話間隔</span>
              <select
                value={draft.intervalSeconds}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    intervalSeconds: Number(event.target.value),
                  }))
                }
              >
                <option value={3}>3秒</option>
                <option value={5}>5秒</option>
                <option value={10}>10秒</option>
                <option value={15}>15秒</option>
                <option value={30}>30秒</option>
                <option value={60}>60秒</option>
              </select>
            </label>
            <label className="admin-field admin-check-field">
              <span>人格</span>
              <label>
                <input
                  type="checkbox"
                  checked={draft.teacherMode}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      teacherMode: event.target.checked,
                    }))
                  }
                />
                くらげ先生モード
              </label>
            </label>
          </div>

          <div className="admin-actions">
            <button
              className="admin-primary"
              disabled={isSending || !draft.title || !draft.topicsText}
              onClick={saveProgram}
            >
              番組を保存
            </button>
            <button
              className="admin-danger"
              disabled={isSending || !selectedProgram}
              onClick={deleteProgram}
            >
              選択中の番組を削除
            </button>
          </div>
        </section>

        <aside className="admin-card admin-simple-card">
          <h2>配信する</h2>
          <label className="admin-field">
            <span>配信番組</span>
            <select
              value={selectedProgramId}
              onChange={(event) => setSelectedProgramId(event.target.value)}
            >
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.title}
                </option>
              ))}
            </select>
          </label>

          {selectedProgram && (
            <div className="admin-program-summary">
              <strong>{selectedProgram.title}</strong>
              <p>{selectedProgram.description || '説明なし'}</p>
              <span>
                {selectedProgramTopicCount}トピック / {selectedProgram.intervalSeconds}秒間隔
              </span>
            </div>
          )}

          <div className="admin-actions admin-main-actions">
            <button
              className="admin-primary"
              disabled={isSending || !selectedProgram}
              onClick={startProgram}
            >
              配信開始
            </button>
            <button
              className="admin-danger"
              disabled={isSending}
              onClick={stopProgram}
            >
              停止
            </button>
          </div>

          <div className="admin-schedule-panel">
            <h3>指定時間配信</h3>
            <div className="admin-schedule-preview">
              <div className="admin-schedule-preview-title">配信予定</div>
              {schedule.enabled && scheduleRows.length > 0 ? (
                <ol>
                  {scheduleRows.map((item) => (
                    <li key={item.id}>
                      <strong>{item.time}</strong>
                      <span>{item.program?.title || '番組が見つかりません'}</span>
                      <button
                        className="admin-schedule-delete"
                        disabled={isSending}
                        onClick={() => deleteScheduleItem(item.id)}
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ol>
              ) : schedule.enabled ? (
                <p>配信予定はまだありません。番組を選んで配信時刻を保存してください。</p>
              ) : (
                <p>指定時間配信はOFFです。</p>
              )}
            </div>
            <label className="admin-field admin-check-field">
              <span>スケジュール</span>
              <label>
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                />
                毎日自動で配信する
              </label>
            </label>
            <label className="admin-field">
              <span>
                「{selectedProgram?.title || '選択中の番組'}」の配信時刻 1行1つ
              </span>
              <textarea
                value={scheduleTimesText}
                rows={4}
                placeholder="例:\n10:00\n14:00"
                onChange={(event) => setScheduleTimesText(event.target.value)}
              />
            </label>
            <button
              className="admin-secondary"
              disabled={isSending || !selectedProgram}
              onClick={saveProgramSchedule}
            >
              この番組の配信時間を保存
            </button>
            <p className="admin-hint">
              番組ごとに配信時間を保存すると、上の配信予定一覧に追加されます。YouTubeのアーカイブを残さない設定はYouTube Live側で無効にしてください。
            </p>
          </div>

          <div className="admin-youtube-live-panel">
            <div className="admin-youtube-live-header">
              <h3>YouTube経由で配信</h3>
              <span
                className={`admin-youtube-live-badge ${
                  youtubeLiveStatus.running ? 'is-live' : ''
                }`}
              >
                {youtubeLiveStatus.running ? 'RTMP送信中' : '停止中'}
              </span>
            </div>
            <p className="admin-hint">
              配信用viewerを1つだけChromeで開き、その画面と音声をYouTube Liveへ送ります。
            </p>
            <label className="admin-field">
              <span>RTMP URL</span>
              <input
                value={youtubeLiveConfig.rtmpUrl}
                onChange={(event) =>
                  setYoutubeLiveConfig((current) => ({
                    ...current,
                    rtmpUrl: event.target.value,
                  }))
                }
              />
            </label>
            <label className="admin-field">
              <span>
                ストリームキー
                {youtubeLiveConfig.hasStreamKey ? '（保存済み）' : ''}
              </span>
              <input
                value={youtubeStreamKeyText}
                type="password"
                placeholder={
                  youtubeLiveConfig.hasStreamKey
                    ? '変更するときだけ入力'
                    : 'YouTube Studioのストリームキー'
                }
                onChange={(event) => setYoutubeStreamKeyText(event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>配信用viewer URL</span>
              <input
                value={youtubeLiveConfig.viewerUrl}
                onChange={(event) =>
                  setYoutubeLiveConfig((current) => ({
                    ...current,
                    viewerUrl: event.target.value,
                  }))
                }
              />
            </label>
            <div className="admin-youtube-live-grid">
              <label className="admin-field">
                <span>幅</span>
                <input
                  value={youtubeLiveConfig.width}
                  type="number"
                  onChange={(event) =>
                    setYoutubeLiveConfig((current) => ({
                      ...current,
                      width: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="admin-field">
                <span>高さ</span>
                <input
                  value={youtubeLiveConfig.height}
                  type="number"
                  onChange={(event) =>
                    setYoutubeLiveConfig((current) => ({
                      ...current,
                      height: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="admin-field">
                <span>FPS</span>
                <input
                  value={youtubeLiveConfig.fps}
                  type="number"
                  onChange={(event) =>
                    setYoutubeLiveConfig((current) => ({
                      ...current,
                      fps: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <div className="admin-actions admin-youtube-live-actions">
              <button
                className="admin-secondary"
                disabled={isSending}
                onClick={saveYoutubeLive}
              >
                設定保存
              </button>
              <button
                className="admin-primary"
                disabled={
                  isSending ||
                  youtubeLiveStatus.running ||
                  (!youtubeLiveConfig.hasStreamKey && !youtubeStreamKeyText.trim())
                }
                onClick={startYoutubeLive}
              >
                YouTube配信開始
              </button>
              <button
                className="admin-danger"
                disabled={isSending || !youtubeLiveStatus.running}
                onClick={stopYoutubeLive}
              >
                YouTube配信停止
              </button>
            </div>
            {youtubeLiveStatus.startedAt && (
              <p className="admin-hint">
                開始: {new Date(youtubeLiveStatus.startedAt).toLocaleString()}
                {youtubeLiveStatus.logs?.ffmpeg
                  ? ` / ログ: ${youtubeLiveStatus.logs.ffmpeg}`
                  : ''}
              </p>
            )}
          </div>

          <div className="admin-comment-interrupt">
            <h3>視聴者コメントに返答</h3>
            <label className="admin-field">
              <span>拾いたいコメント</span>
              <textarea
                value={commentText}
                rows={5}
                placeholder="例: 山田さんから「AIに何を頼めばいいですか？」"
                onChange={(event) => setCommentText(event.target.value)}
              />
            </label>
            <button
              className="admin-secondary"
              disabled={isSending || !commentText.trim()}
              onClick={replyToComment}
            >
              クラゲに返答させる
            </button>
            <p className="admin-hint">
              返答後は自動で番組台本の続きに戻ります。
            </p>
          </div>

          <details className="admin-token-details">
            <summary>管理者トークン</summary>
            <label className="admin-field">
              <span>トークン</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="kurage-admin"
                type="password"
              />
            </label>
          </details>
        </aside>
      </main>

      {status && <div className="admin-status">{status}</div>}
    </div>
  );
}

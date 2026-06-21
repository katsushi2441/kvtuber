import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminConsole } from './components/AdminConsole';
import type { AvatarImageKey, AvatarImageUrls } from './components/AvatarPanel';
import { AutonomousBroadcastPanel } from './components/AutonomousBroadcastPanel';
import { ChatPanel } from './components/ChatPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useAudioLipsync } from './hooks/useAudioLipsync';
import { useAituberCore } from './hooks/useAituberCore';
import { useSettings } from './hooks/useSettings';
import { useTwitchComments } from './hooks/useTwitchComments';
import { useYoutubeComments } from './hooks/useYoutubeComments';
import {
  DEFAULT_BROADCAST_PROGRAMS,
  findBroadcastProgram,
  type BroadcastProgram,
} from './programs';
import type { TwitchChatMessage } from './services/twitch/twitchService';
import type { YouTubeChatMessage } from './services/youtube/youtubeService';
import type { ChatMessage } from './types/chat';
import './styles/app.css';

const DEFAULT_AUTONOMOUS_THEME =
  'A friendly AI VTuber introduces the current program topic.';
const DEFAULT_AUTONOMOUS_TOPICS = [
  "Introduce yourself and today's theme",
  'Explain why a browser-based VTuber viewer is useful',
  'Describe how scheduled programs work',
  'Invite viewers to ask questions',
].join('\n');
const VIBE_CODING_THEME =
  'A sample teacher mode for explaining software development with AI assistance.';
const VIBE_CODING_TOPICS = [
  'Explain the session goal',
  'Break a broad idea into small tasks',
  'Describe how to verify changes safely',
  'Suggest one practical exercise for viewers',
].join('\n');
const DEFAULT_SYSTEM_PROMPT =
  'You are a friendly AI VTuber host. Explain the current topic clearly, briefly, and naturally. If viewers comment, respond to them in a warm live-stream style.';
const VIBE_CODING_SYSTEM_PROMPT = [
  'You are a friendly AI VTuber teacher.',
  'Explain software development topics in a practical, beginner-friendly way.',
  'Keep answers short enough for live narration.',
  'When useful, suggest one clear next step.',
].join('\n');

type AdminControlCommand =
  | { type: 'connected' }
  | { type: 'speak_now'; text?: string; instruction?: string }
  | { type: 'add_topic'; topic?: string }
  | { type: 'set_topics'; topicsText?: string }
  | { type: 'set_interval'; seconds?: number }
  | { type: 'set_autonomous'; enabled?: boolean }
  | { type: 'set_teacher_mode'; enabled?: boolean }
  | {
      type: 'apply_program';
      program?: BroadcastProgram;
      programId?: string;
      autoplay?: boolean;
    }
  | { type: 'stop' };

function parseTopics(topicsText: string): string[] {
  return topicsText
    .split('\n')
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function buildAutonomousPrompt(
  theme: string,
  topic: string,
  turnCount: number,
  vibeCodingTeacherMode: boolean,
) {
  return [
    'これは自律配信モードの内部プロンプトです。視聴者にはこの指示を見せず、あなたの自然な発話だけを返してください。',
    `配信テーマ: ${theme || DEFAULT_AUTONOMOUS_THEME}`,
    `今回の話題: ${topic}`,
    `現在の自律発話ターン: ${turnCount + 1}`,
    vibeCodingTeacherMode
      ? 'あなたは「VTuberくらげ」という、バイブコーディングを教えるクラゲ型AI先生です。'
      : 'あなたはKurage AI Navigatorというクラゲ型AITuberです。',
    'ライブ配信中のように、明るく、短く、聞き取りやすい日本語で話してください。',
    vibeCodingTeacherMode
      ? '初心者に向けて、AIへの頼み方、作業の分け方、確認の仕方が伝わるように話してください。'
      : '経営者や開発者に、AI活用・動画生成・業務自動化を整理して伝えてください。',
    '20秒以内で話せる長さにしてください。',
    '前置きとして「内部プロンプト」や「今回の話題」は言わないでください。',
    '最後は軽くコメントや質問を促してください。ただし毎回同じ締め方にしないでください。',
  ].join('\n');
}

function buildAdminSpeakPrompt(text: string, instruction: string) {
  return [
    'これは管理者からのリアルタイム指示です。視聴者にはこの指示文を見せず、自然な発話だけを返してください。',
    `話す内容: ${text}`,
    instruction ? `話し方の指示: ${instruction}` : '',
    'ライブ配信中のVTuberとして、聞き取りやすく、短く、自然に話してください。',
  ]
    .filter(Boolean)
    .join('\n');
}

function LiveApp({ viewerOnly = false }: { viewerOnly?: boolean }) {
  const searchParams = new URLSearchParams(window.location.search);
  const isBroadcastViewer =
    viewerOnly && searchParams.get('broadcast') === '1';
  const initialProgram =
    findBroadcastProgram(searchParams.get('program') || '') ||
    DEFAULT_BROADCAST_PROGRAMS[0];
  const { play, stop, mouthLevel, isSpeaking, isAudioUnlocked, unlockAudio } =
    useAudioLipsync();
  const settingsHook = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [streamErrorMessage, setStreamErrorMessage] = useState('');
  const [audioUnlockError, setAudioUnlockError] = useState('');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(
    null,
  );
  const [avatarImageUrls, setAvatarImageUrls] = useState<AvatarImageUrls>({});
  const [vibeCodingTeacherMode, setVibeCodingTeacherMode] = useState(
    initialProgram.teacherMode,
  );
  const [activeProgramTitle, setActiveProgramTitle] = useState(
    initialProgram.title,
  );
  const [autonomousEnabled, setAutonomousEnabled] = useState(
    viewerOnly && !isBroadcastViewer,
  );
  const [autonomousTheme, setAutonomousTheme] = useState(initialProgram.theme);
  const [autonomousTopicsText, setAutonomousTopicsText] = useState(
    initialProgram.topicsText,
  );
  const [autonomousIntervalSeconds, setAutonomousIntervalSeconds] = useState(
    initialProgram.intervalSeconds,
  );
  const [autonomousTopicIndex, setAutonomousTopicIndex] = useState(0);
  const [autonomousTurnCount, setAutonomousTurnCount] = useState(0);
  const [currentTopicLabel, setCurrentTopicLabel] = useState('');
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  const [scriptMessages, setScriptMessages] = useState<ChatMessage[]>([]);
  const [scriptPartialResponse, setScriptPartialResponse] = useState('');
  const [scriptProcessing, setScriptProcessing] = useState(false);
  const backgroundObjectUrlRef = useRef<string | null>(null);
  const avatarObjectUrlRef = useRef<AvatarImageUrls>({});
  const handleControlCommandRef = useRef<(command: AdminControlCommand) => void>(
    () => {},
  );

  const handleAudioPlay = useCallback(
    async (arrayBuffer: ArrayBuffer) => {
      if (!arrayBuffer || arrayBuffer.byteLength < 16) return;
      try {
        await play(arrayBuffer);
      } catch (error) {
        console.warn('Audio playback skipped:', error);
      }
    },
    [play],
  );

  const handleUnlockAudio = useCallback(async () => {
    try {
      await unlockAudio();
      setAudioUnlockError('');
    } catch (error) {
      setAudioUnlockError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [unlockAudio]);

  const { messages, isProcessing, partialResponse, processChat } =
    useAituberCore({
      onAudioPlay: handleAudioPlay,
      settings: settingsHook.settings,
      getApiKeyForProvider: settingsHook.getApiKeyForProvider,
      systemPrompt: vibeCodingTeacherMode
        ? VIBE_CODING_SYSTEM_PROMPT
        : DEFAULT_SYSTEM_PROMPT,
    });
  const visibleMessages =
    isBroadcastViewer && scriptMessages.length > 0
      ? scriptMessages.slice(-1)
      : scriptMessages.length > 0
        ? scriptMessages
        : messages;
  const visiblePartialResponse = scriptPartialResponse || partialResponse;
  const effectiveProcessing = isProcessing || scriptProcessing;

  const speakScriptText = useCallback(
    async (text: string) => {
      const speechText = text
        .trim()
        .replace(/^オープニング。?/, '')
        .replace(/^締め。?/, '')
        .trim();
      if (!speechText) return;

      setScriptProcessing(true);
      setScriptPartialResponse(speechText);
      setScriptMessages([
        {
          id: `script-${Date.now()}`,
          role: 'assistant',
          content: speechText,
          timestamp: Date.now(),
        },
      ]);

      try {
        const response = await fetch('/kurage-tts/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'kurage-edge-tts',
            voice: settingsHook.settings.tts.speaker || 'ja-JP-NanamiNeural',
            input: speechText,
          }),
        });
        if (!response.ok) throw new Error(`TTS failed: HTTP ${response.status}`);
        const audio = await response.arrayBuffer();
        setScriptPartialResponse('');
        await handleAudioPlay(audio);
      } catch (error) {
        console.error('script speech failed:', error);
        setScriptPartialResponse('');
      } finally {
        setScriptProcessing(false);
      }
    },
    [handleAudioPlay, settingsHook.settings.tts.speaker],
  );

  const handleSend = useCallback(
    (text: string) => {
      // Stop previous audio if speech is currently playing
      stop();
      processChat(text);
    },
    [stop, processChat],
  );

  const handleYoutubeComment = useCallback(
    (comment: YouTubeChatMessage) => {
      stop();
      processChat(
        `「${comment.userName}」さんのコメント: ${comment.userComment}`,
      );
    },
    [processChat, stop],
  );

  const autonomousTopics = parseTopics(autonomousTopicsText);
  const nextAutonomousTopic =
    autonomousTopics.length > 0
      ? autonomousTopics[autonomousTopicIndex % autonomousTopics.length]
      : '';
  const viewerStatusPayload = useMemo(() => {
    const phase = !autonomousEnabled
      ? 'stopped'
      : effectiveProcessing
        ? 'generating'
        : isSpeaking
          ? 'speaking'
          : nextAutonomousTopic
            ? 'waiting'
            : 'no_topics';
    const label =
      phase === 'generating'
        ? '生成中'
        : phase === 'speaking'
          ? '発話中'
          : phase === 'waiting'
            ? '待機中'
            : phase === 'no_topics'
              ? '話題なし'
              : '停止中';

    return {
      phase,
      label,
      autonomousEnabled,
      isProcessing: effectiveProcessing,
      isSpeaking,
      currentTopic: currentTopicLabel,
      nextTopic: nextAutonomousTopic,
      topicIndex: autonomousTopicIndex,
      topicCount: autonomousTopics.length,
      turnCount: autonomousTurnCount,
      intervalSeconds: autonomousIntervalSeconds,
      nextRunAt,
      teacherMode: vibeCodingTeacherMode,
      audioUnlocked: isAudioUnlocked,
      broadcastMode: isBroadcastViewer,
      programTitle: activeProgramTitle,
    };
  }, [
    activeProgramTitle,
    autonomousEnabled,
    autonomousIntervalSeconds,
    autonomousTopicIndex,
    autonomousTopics.length,
    autonomousTurnCount,
    currentTopicLabel,
    isAudioUnlocked,
    effectiveProcessing,
    isSpeaking,
    isBroadcastViewer,
    nextAutonomousTopic,
    nextRunAt,
    vibeCodingTeacherMode,
  ]);

  const postViewerStatus = useCallback(() => {
    if (!viewerOnly) return;
    void fetch('/control/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(viewerStatusPayload),
    }).catch((error) => {
      console.warn('Failed to post viewer status:', error);
    });
  }, [viewerOnly, viewerStatusPayload]);

  const postViewerStatusOverride = useCallback(
    (payload: Record<string, unknown>) => {
      if (!viewerOnly) return;
      void fetch('/control/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...viewerStatusPayload,
          ...payload,
          updatedAt: Date.now(),
        }),
      }).catch((error) => {
        console.warn('Failed to post viewer status override:', error);
      });
    },
    [viewerOnly, viewerStatusPayload],
  );

  const runAutonomousTurn = useCallback(() => {
    if (effectiveProcessing || isSpeaking || !nextAutonomousTopic) return;

    setCurrentTopicLabel(nextAutonomousTopic);
    setNextRunAt(null);

    if (isBroadcastViewer) {
      void speakScriptText(nextAutonomousTopic);
      setAutonomousTopicIndex((index) => index + 1);
      setAutonomousTurnCount((count) => count + 1);
      return;
    }

    const prompt = buildAutonomousPrompt(
      autonomousTheme,
      nextAutonomousTopic,
      autonomousTurnCount,
      vibeCodingTeacherMode,
    );

    processChat(prompt, { displayUserMessage: false });
    setAutonomousTopicIndex((index) => index + 1);
    setAutonomousTurnCount((count) => count + 1);
  }, [
    autonomousTheme,
    autonomousTurnCount,
    effectiveProcessing,
    isBroadcastViewer,
    isSpeaking,
    nextAutonomousTopic,
    processChat,
    speakScriptText,
    vibeCodingTeacherMode,
  ]);

  const handleVibeCodingTeacherModeChange = useCallback((enabled: boolean) => {
    setVibeCodingTeacherMode(enabled);
    setActiveProgramTitle(enabled ? 'くらげ先生デフォルト' : '汎用VTuberデフォルト');
    setAutonomousTopicIndex(0);
    setAutonomousTurnCount(0);
    setAutonomousTheme(enabled ? VIBE_CODING_THEME : DEFAULT_AUTONOMOUS_THEME);
    setAutonomousTopicsText(
      enabled ? VIBE_CODING_TOPICS : DEFAULT_AUTONOMOUS_TOPICS,
    );
  }, []);

  const applyBroadcastProgram = useCallback(
    (program: BroadcastProgram, autoplay = false) => {
      stop();
      setScriptMessages([]);
      setScriptPartialResponse('');
      setScriptProcessing(false);
      setActiveProgramTitle(program.title);
      setVibeCodingTeacherMode(program.teacherMode);
      setAutonomousTheme(program.theme);
      setAutonomousTopicsText(program.topicsText.trim());
      setAutonomousIntervalSeconds(program.intervalSeconds);
      setAutonomousTopicIndex(0);
      setAutonomousTurnCount(0);
      setCurrentTopicLabel('');
      setNextRunAt(null);
      setAutonomousEnabled(autoplay);
    },
    [stop],
  );

  const handleControlCommand = useCallback(
    (command: AdminControlCommand) => {
      if (command.type === 'connected') return;

      if (command.type === 'stop') {
        stop();
        setScriptMessages([]);
        setScriptPartialResponse('');
        setScriptProcessing(false);
        setAutonomousEnabled(false);
        setCurrentTopicLabel('');
        setNextRunAt(null);
        postViewerStatusOverride({
          phase: 'stopped',
          label: '停止中',
          autonomousEnabled: false,
          isProcessing: false,
          isSpeaking: false,
          currentTopic: '',
          nextRunAt: null,
        });
        return;
      }

      if (command.type === 'set_autonomous') {
        setAutonomousEnabled(Boolean(command.enabled));
        return;
      }

      if (command.type === 'set_interval') {
        const seconds = Number(command.seconds);
        if (Number.isFinite(seconds) && seconds > 0) {
          setAutonomousIntervalSeconds(seconds);
        }
        return;
      }

      if (command.type === 'set_teacher_mode') {
        handleVibeCodingTeacherModeChange(Boolean(command.enabled));
        return;
      }

      if (command.type === 'apply_program') {
        const program =
          command.program ||
          findBroadcastProgram(command.programId || '') ||
          DEFAULT_BROADCAST_PROGRAMS[0];
        applyBroadcastProgram(program, Boolean(command.autoplay));
        return;
      }

      if (command.type === 'add_topic' && command.topic?.trim()) {
        setAutonomousTopicsText((current) =>
          `${current.trim()}\n${command.topic?.trim()}`.trim(),
        );
        return;
      }

      if (command.type === 'set_topics' && command.topicsText?.trim()) {
        setAutonomousTopicsText(command.topicsText.trim());
        setAutonomousTopicIndex(0);
        setAutonomousTurnCount(0);
        setCurrentTopicLabel('');
        setNextRunAt(null);
        return;
      }

      if (command.type === 'speak_now' && command.text?.trim()) {
        stop();
        setCurrentTopicLabel('管理者の今すぐ話す指示');
        setNextRunAt(null);
        processChat(
          buildAdminSpeakPrompt(
            command.text.trim(),
            command.instruction?.trim() || '',
          ),
          { displayUserMessage: false },
        );
      }
    },
    [
      applyBroadcastProgram,
      handleVibeCodingTeacherModeChange,
      postViewerStatusOverride,
      processChat,
      stop,
    ],
  );

  useEffect(() => {
    handleControlCommandRef.current = handleControlCommand;
  }, [handleControlCommand]);

  useEffect(() => {
    if (!viewerOnly) return;

    const source = new EventSource('/control/events');
    source.onmessage = (event) => {
      try {
        handleControlCommandRef.current(
          JSON.parse(event.data) as AdminControlCommand,
        );
      } catch (error) {
        console.warn('Failed to handle admin control command:', error);
      }
    };
    source.onerror = () => {
      console.warn('Admin control stream disconnected; retrying...');
    };
    return () => source.close();
  }, [viewerOnly]);

  useEffect(() => {
    if (!isBroadcastViewer || isAudioUnlocked) return;
    let attempts = 0;
    const tryUnlock = () => {
      attempts += 1;
      void unlockAudio().catch((error) => {
        if (attempts <= 1) {
          console.warn('Broadcast audio unlock skipped:', error);
        }
      });
    };

    tryUnlock();
    const timer = window.setInterval(() => {
      if (attempts >= 10) {
        window.clearInterval(timer);
        return;
      }
      tryUnlock();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isAudioUnlocked, isBroadcastViewer, unlockAudio]);

  useEffect(() => {
    if (!autonomousEnabled || !nextAutonomousTopic) return;
    if (effectiveProcessing || isSpeaking) {
      setNextRunAt(null);
      return;
    }

    const delayMs =
      autonomousTurnCount === 0 ? 800 : autonomousIntervalSeconds * 1000;
    setNextRunAt(Date.now() + delayMs);
    const timer = window.setTimeout(runAutonomousTurn, delayMs);
    return () => window.clearTimeout(timer);
  }, [
    autonomousEnabled,
    autonomousIntervalSeconds,
    autonomousTurnCount,
    effectiveProcessing,
    isSpeaking,
    nextAutonomousTopic,
    runAutonomousTurn,
  ]);

  useEffect(() => {
    if (!viewerOnly) return;
    postViewerStatus();
  }, [postViewerStatus, viewerOnly]);

  useEffect(() => {
    if (!viewerOnly) return;
    const timer = window.setInterval(postViewerStatus, 1000);
    return () => window.clearInterval(timer);
  }, [postViewerStatus, viewerOnly]);

  const handleTwitchComment = useCallback(
    (comment: TwitchChatMessage) => {
      stop();
      processChat(
        `「${comment.userName}」さんのコメント: ${comment.userComment}`,
      );
    },
    [processChat, stop],
  );

  const handleBackgroundImageChange = useCallback((file: File | null) => {
    if (backgroundObjectUrlRef.current) {
      URL.revokeObjectURL(backgroundObjectUrlRef.current);
      backgroundObjectUrlRef.current = null;
    }

    if (!file) {
      setBackgroundImageUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    backgroundObjectUrlRef.current = nextUrl;
    setBackgroundImageUrl(nextUrl);
  }, []);

  const handleAvatarImageChange = useCallback(
    (key: AvatarImageKey, file: File | null) => {
      const previousUrl = avatarObjectUrlRef.current[key];
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
        delete avatarObjectUrlRef.current[key];
      }

      setAvatarImageUrls((prev) => {
        if (!file) {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        }

        const nextUrl = URL.createObjectURL(file);
        avatarObjectUrlRef.current[key] = nextUrl;
        return { ...prev, [key]: nextUrl };
      });
    },
    [],
  );

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('access_token')) return;

    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('access_token');
    const state = params.get('state');
    const savedState = sessionStorage.getItem('twitchOauthState');

    if (token && state && state === savedState) {
      settingsHook.updateTwitchAccessToken(token);
      setStreamErrorMessage('');
      sessionStorage.removeItem('twitchOauthState');
    }

    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    );
  }, []);

  useYoutubeComments({
    youtubeLiveId: settingsHook.settings.stream.youtubeLiveId,
    youtubeApiKey: settingsHook.settings.stream.youtubeApiKey,
    isEnabled:
      settingsHook.settings.stream.platform === 'youtube' &&
      settingsHook.settings.stream.youtubeEnabled,
    intervalMs: settingsHook.settings.stream.youtubeCommentIntervalMs,
    onComment: handleYoutubeComment,
  });

  useTwitchComments({
    twitchChannel: settingsHook.settings.stream.twitchChannel,
    twitchClientId: settingsHook.settings.stream.twitchClientId,
    twitchAccessToken: settingsHook.settings.stream.twitchAccessToken,
    isEnabled:
      settingsHook.settings.stream.platform === 'twitch' &&
      settingsHook.settings.stream.twitchEnabled,
    intervalMs: settingsHook.settings.stream.twitchCommentIntervalMs,
    onComment: handleTwitchComment,
    onTokenExpired: () => {
      settingsHook.updateTwitchAccessToken('');
      settingsHook.updateTwitchEnabled(false);
      setStreamErrorMessage('Twitch access token expired. Please reconnect.');
    },
    onError: (message) => {
      setStreamErrorMessage(message);
      if (message) {
        console.warn(message);
      }
    },
  });

  // Close the dialog with the Escape key
  useEffect(() => {
    if (!settingsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen]);

  useEffect(() => {
    const backgroundObjectUrl = backgroundObjectUrlRef;
    const avatarObjectUrls = avatarObjectUrlRef;

    return () => {
      if (backgroundObjectUrl.current) {
        URL.revokeObjectURL(backgroundObjectUrl.current);
      }
      Object.values(avatarObjectUrls.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  return (
    <div
      className={`app ${viewerOnly ? 'viewer-app' : ''} ${
        isBroadcastViewer ? 'broadcast-viewer-app' : ''
      }`}
    >
      {!viewerOnly && (
      <header className="app-header">
        <h1>Kurage AI Navigator Live</h1>
        <button
          className="settings-button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-label="Settings"
        >
          ⚙
        </button>
      </header>
      )}
      <main className="app-main">
        {!viewerOnly && (
          <AutonomousBroadcastPanel
          enabled={autonomousEnabled}
          vibeCodingTeacherMode={vibeCodingTeacherMode}
          theme={autonomousTheme}
          topicsText={autonomousTopicsText}
          intervalSeconds={autonomousIntervalSeconds}
          nextTopicLabel={nextAutonomousTopic}
          isProcessing={effectiveProcessing}
          isSpeaking={isSpeaking}
          turnCount={autonomousTurnCount}
          onEnabledChange={setAutonomousEnabled}
          onVibeCodingTeacherModeChange={handleVibeCodingTeacherModeChange}
          onThemeChange={setAutonomousTheme}
          onTopicsTextChange={(topicsText) => {
            setAutonomousTopicsText(topicsText);
            setAutonomousTopicIndex(0);
            setAutonomousTurnCount(0);
          }}
          onIntervalSecondsChange={setAutonomousIntervalSeconds}
          onSpeakNow={runAutonomousTurn}
        />
        )}
        <ChatPanel
          messages={visibleMessages}
          partialResponse={visiblePartialResponse}
          isProcessing={effectiveProcessing}
          onSend={handleSend}
          mouthLevel={mouthLevel}
          isSpeaking={isSpeaking}
          backgroundImageUrl={backgroundImageUrl}
          avatarImageUrls={avatarImageUrls}
          hideInput={viewerOnly}
        />
        {viewerOnly && !isBroadcastViewer && !isAudioUnlocked && (
          <div className="viewer-audio-chip">
            <button onClick={handleUnlockAudio}>音声OFF / クリックでON</button>
            {audioUnlockError && (
              <span className="viewer-audio-error">{audioUnlockError}</span>
            )}
          </div>
        )}
      </main>

      {settingsOpen && !viewerOnly && (
        <div
          className="settings-dialog-overlay"
          onClick={() => setSettingsOpen(false)}
        >
          <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-dialog-header">
              <h2>Settings</h2>
              <button
                className="settings-dialog-close"
                onClick={() => setSettingsOpen(false)}
              >
                &times;
              </button>
            </div>
            <SettingsPanel
              {...settingsHook}
              isProcessing={effectiveProcessing}
              backgroundImageUrl={backgroundImageUrl}
              avatarImageUrls={avatarImageUrls}
              streamErrorMessage={streamErrorMessage}
              onBackgroundImageChange={handleBackgroundImageChange}
              onAvatarImageChange={handleAvatarImageChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path === '/admin') {
    return <AdminConsole />;
  }
  return <LiveApp viewerOnly={path !== '/studio'} />;
}

import { useEffect, useRef, useState } from 'react';
import { AvatarBackground } from './AvatarPanel';

type KdeckJobStatus = {
  job_id?: string;
  status?: string;
  message?: string;
  error?: string;
  detail?: string;
  elapsed?: number;
  target_agent?: string;
  execution_mode?: string;
  business_status?: string;
  process_ok?: boolean;
  ok?: boolean;
  cwd?: string;
};

type KvtuberChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  jobId?: string;
  status?: string;
};

type ChatRoute = 'auto' | 'ollama' | 'kdeck';

const OLLAMA_CHAT_MODEL = 'gemma4:12b-it-qat';

const KDECK_REQUEST_PATTERNS = [
  /投稿/,
  /公開/,
  /転載/,
  /アップロード/,
  /youtube/i,
  /kurage/i,
  /kargov/i,
  /vwork/i,
  /github/i,
  /commit|コミット/i,
  /push|プッシュ/i,
  /実装/,
  /修正/,
  /変更/,
  /作成/,
  /生成/,
  /録画/,
  /登録/,
  /保存/,
  /デプロイ/,
  /ファイル/,
  /フォルダ/,
  /コード/,
  /調査/,
  /検索/,
  /確認して/,
  /やって/,
  /して$/,
  /してください$/,
];

function initialToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || localStorage.getItem('kurage-admin-token') || '';
}

function initialJobId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('job_id') || params.get('jobId') || '';
}

function jobResultText(job: KdeckJobStatus) {
  return (
    job.message ||
    job.error ||
    job.detail ||
    JSON.stringify(job, null, 2)
  );
}

function shouldUseKdeck(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return false;

  if (/^(雑談|会話|相談だけ|質問だけ|教えて|どう思う|なぜ|なんで|とは|かな|？|\?)/.test(trimmed)) {
    return false;
  }

  return KDECK_REQUEST_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function resolveRoute(message: string, route: ChatRoute) {
  if (route === 'auto') {
    return shouldUseKdeck(message) ? 'kdeck' : 'ollama';
  }
  return route;
}

function buildOllamaMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  message: string,
) {
  return [
    {
      role: 'system',
      content:
        'あなたは「Kurage AI VTuber」というクラゲ型AIアシスタントです。通常会話ではOllama上のLLMとして、短く自然な日本語で返答します。ユーザーが投稿、実装、録画、ファイル編集、Git操作など実作業を依頼した場合は、自分では実行したと言わず「kdeckへ依頼できます」と案内してください。',
    },
    ...history.slice(-10),
    { role: 'user', content: message },
  ];
}

export function KvtuberChatPage() {
  const [token, setToken] = useState(initialToken);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<KvtuberChatMessage[]>([
    {
      id: 'hello',
      role: 'assistant',
      content:
        'こんにちは。ふつうの会話はOllamaで返答します。投稿・実装・録画・commit/pushなど実作業が必要な依頼だけ、kdeckへ渡して実行します。',
    },
  ]);
  const [lastJob, setLastJob] = useState<KdeckJobStatus | null>(null);
  const [status, setStatus] = useState('ready');
  const [isSending, setIsSending] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const initialJobIdRef = useRef(initialJobId());
  const loadedInitialJobRef = useRef(false);

  useEffect(
    () => () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    },
    [],
  );

  const authToken = token.trim();
  const isWorking = status === 'submitting' || status === 'running';

  const updateAssistantMessage = (
    id: string,
    patch: Partial<KvtuberChatMessage>,
  ) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      ),
    );
  };

  const requestWithToken = async (path: string, init: RequestInit) => {
    if (!authToken) throw new Error('管理者トークンを入力してください');
    localStorage.setItem('kurage-admin-token', authToken);
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

  const requestOllamaChat = async (
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) => {
    const response = await fetch('/ollama/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        messages: buildOllamaMessages(history, message),
        stream: false,
        temperature: 0.7,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error?.message || result.error || `Ollama HTTP ${response.status}`);
    }
    const content = result.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('Ollamaの返答を取得できませんでした');
    }
    return content.trim();
  };

  const pollJob = (jobId: string, assistantMessageId: string) => {
    const run = async () => {
      try {
        const result = await requestWithToken(
          `/control/kdeck/task?job_id=${encodeURIComponent(jobId)}`,
          { method: 'GET' },
        );
        const job = result.job as KdeckJobStatus;
        setLastJob(job);

        if (job.status === 'running') {
          updateAssistantMessage(assistantMessageId, {
            content: `kdeckで実行中です。${
              job.elapsed ? `経過 ${job.elapsed}秒。` : '状態を確認しています。'
            }完了したらこの吹き出しに返答を表示します。`,
            status: job.status,
          });
          pollTimerRef.current = window.setTimeout(
            () => pollJob(jobId, assistantMessageId),
            1500,
          );
          return;
        }

        updateAssistantMessage(assistantMessageId, {
          content: jobResultText(job),
          status: job.business_status || job.status || 'finished',
        });
        setStatus(job.business_status || job.status || 'finished');
      } catch (error) {
        updateAssistantMessage(assistantMessageId, {
          content: `状態取得に失敗しました: ${
            error instanceof Error ? error.message : String(error)
          }`,
          status: 'failed',
        });
        setStatus('failed');
      }
    };
    void run();
  };

  useEffect(() => {
    const jobId = initialJobIdRef.current.trim();
    if (!jobId || loadedInitialJobRef.current || !authToken) return;
    loadedInitialJobRef.current = true;
    const assistantMessageId = `assistant-resume-${jobId}`;
    setMessages((current) => [
      ...current,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: `kdeckの実行結果を読み込みます。Job ID: ${jobId}`,
        jobId,
        status: 'loading',
      },
    ]);
    setStatus('running');
    pollJob(jobId, assistantMessageId);
    // pollJob is intentionally kept outside the dependency list so a resumed
    // job is loaded only once after the admin token becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const sendMessage = async (route: ChatRoute = 'auto') => {
    const message = input.trim();
    if (!message || isSending) return;
    const selectedRoute = resolveRoute(message, route);

    const userMessage: KvtuberChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    };
    const assistantMessage: KvtuberChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content:
        selectedRoute === 'kdeck'
          ? 'kdeckへ依頼しています...'
          : 'Ollamaで返答を考えています...',
      status: selectedRoute === 'kdeck' ? 'submitting' : 'ollama',
    };
    const history: Array<{ role: 'user' | 'assistant'; content: string }> =
      messages.map((item) => ({
        role: item.role,
        content: item.content,
      }));
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput('');
    setIsSending(true);
    setStatus(selectedRoute === 'kdeck' ? 'submitting' : 'chatting');

    try {
      if (selectedRoute === 'ollama') {
        const reply = await requestOllamaChat(message, history);
        updateAssistantMessage(assistantMessage.id, {
          content: reply,
          status: 'ollama',
        });
        setStatus('ready');
        return;
      }

      const result = await requestWithToken('/control/kdeck/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          history,
          cwd: '/home/kojima/work/kdeck',
          executionMode: 'full-access',
          targetAgent: 'local',
        }),
      });
      const job = result.job as KdeckJobStatus;
      setLastJob(job);
      const jobId = job.job_id || '';
      if (!jobId) {
        updateAssistantMessage(assistantMessage.id, {
          content: jobResultText(job),
          status: 'failed',
        });
        setStatus('failed');
        return;
      }
      updateAssistantMessage(assistantMessage.id, {
        content: `了解しました。kdeckで実行を開始しました。Job ID: ${jobId}`,
        jobId,
        status: job.status || 'running',
      });
      setStatus(job.status || 'running');
      pollJob(jobId, assistantMessage.id);
    } catch (error) {
      updateAssistantMessage(assistantMessage.id, {
        content: `送信に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`,
        status: 'failed',
      });
      setStatus('failed');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="kvtuber-chat-page">
      <header className="kvtuber-chat-hero">
        <div>
          <div className="admin-kicker">Kurage AI VTuber Chat</div>
          <h1>kvtuberに依頼する</h1>
          <p>
            ふつうの会話はOllamaで返答し、成果物を作る依頼だけkdeckへ渡します。kdeckの実行結果もこの画面に返します。
          </p>
        </div>
        <nav className="kvtuber-chat-nav">
          <a href="/viewer" target="_blank">viewer</a>
          <a href="/admin" target="_blank">admin</a>
        </nav>
      </header>

      <main className="kvtuber-chat-shell">
        <section className="kvtuber-chat-log" aria-live="polite">
          <div className="kvtuber-chat-avatar-card">
            <AvatarBackground mouthLevel={isWorking ? 3 : 0} isSpeaking={isWorking} />
            <div>
              <span>Kurage AI VTuber</span>
              <strong>{isWorking ? 'kdeckで実行中' : '待機中'}</strong>
            </div>
          </div>
          {messages.map((message) => (
            <article
              className={`kvtuber-chat-bubble is-${message.role}`}
              key={message.id}
            >
              <div className="kvtuber-chat-bubble-meta">
                <span>{message.role === 'user' ? 'あなた' : 'kvtuber'}</span>
                {message.status && <b>{message.status}</b>}
              </div>
              <p>{message.content}</p>
              {message.jobId && <code>Job ID: {message.jobId}</code>}
            </article>
          ))}
          <section className="kvtuber-chat-composer">
            <label className="admin-field kvtuber-chat-input">
              <span>kvtuberへの相談・作業依頼</span>
              <textarea
                value={input}
                rows={8}
                placeholder="例: 最近のAI VTuberってどう思う？ / VWork blogに記事を書いて投稿し、その流れをkargovで録画して、kurageに投稿して。"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    void sendMessage();
                  }
                }}
              />
            </label>
            <div className="kvtuber-chat-composer-footer">
              <p>
                自動判定では、会話はOllama、実作業はkdeckへ送ります。誤判定しそうな時は下のボタンで明示できます。
              </p>
              <div className="kvtuber-chat-actions">
                <button
                  className="admin-secondary kvtuber-chat-send"
                  disabled={isSending || !input.trim()}
                  onClick={() => void sendMessage('ollama')}
                >
                  会話だけ
                </button>
                <button
                  className="admin-secondary kvtuber-chat-send"
                  disabled={isSending || !input.trim()}
                  onClick={() => void sendMessage('kdeck')}
                >
                  kdeckへ作業依頼
                </button>
                <button
                  className="admin-primary kvtuber-chat-send"
                  disabled={isSending || !input.trim()}
                  onClick={() => void sendMessage('auto')}
                >
                  自動判定で送信
                </button>
              </div>
            </div>
          </section>
        </section>

        <aside className="kvtuber-chat-side">
          <div className="kvtuber-chat-status">
            <span>状態</span>
            <strong>{status}</strong>
            {lastJob?.job_id && <code>{lastJob.job_id}</code>}
          </div>
          <label className="admin-field">
            <span>管理者トークン</span>
            <input
              value={token}
              type="password"
              placeholder="kurage-admin"
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <p className="admin-hint">
            管理者トークンはkdeckへ作業依頼するときだけ必要です。Ollamaとの通常会話はトークンなしでも使えます。
          </p>
        </aside>
      </main>
    </div>
  );
}

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

function initialToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || localStorage.getItem('kurage-admin-token') || '';
}

const DEFAULT_DEMO_REQUEST = [
  'kvtuberにブログ投稿を依頼して、kdeckに実行させてみた、という内容でVWork blogに記事を書いて投稿して。',
  'その作業の流れをkargovで録画して、解説付きのデモ動画にまとめて、kurageに投稿して。',
  '最後にVWork blogの記事URL、kurage動画URL、実行したcommitを報告して。',
].join('\n');

function jobResultText(job: KdeckJobStatus) {
  return (
    job.message ||
    job.error ||
    job.detail ||
    JSON.stringify(job, null, 2)
  );
}

export function KvtuberChatPage() {
  const [token, setToken] = useState(initialToken);
  const [input, setInput] = useState(DEFAULT_DEMO_REQUEST);
  const [messages, setMessages] = useState<KvtuberChatMessage[]>([
    {
      id: 'hello',
      role: 'assistant',
      content:
        'kvtuberに相談や作業依頼をしてください。必要な作業はkdeckへ渡し、実行中の状態と返答をここに表示します。',
    },
  ]);
  const [lastJob, setLastJob] = useState<KdeckJobStatus | null>(null);
  const [status, setStatus] = useState('ready');
  const [isSending, setIsSending] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

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

  const sendMessage = async () => {
    const message = input.trim();
    if (!message || isSending) return;

    const userMessage: KvtuberChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    };
    const assistantMessage: KvtuberChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: 'kdeckへ依頼しています...',
      status: 'submitting',
    };
    const history = messages.map((item) => ({
      role: item.role,
      content: item.content,
    }));
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput('');
    setIsSending(true);
    setStatus('submitting');

    try {
      const result = await requestWithToken('/control/kdeck/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          history,
          cwd: '/home/kojima/work',
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
            codexやClaude Codeのように、kvtuberへ自然文で依頼します。kdeckの実行結果もこの画面に返します。
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
                placeholder="例: VWork blogに記事を書いて投稿し、その流れをkargovで録画して、kurageにデモ動画として投稿して。最後にURLとcommitを報告して。"
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
                送信後はkdeckの状態を自動で確認し、完了した返答をチャット欄に表示します。
              </p>
              <button
                className="admin-primary kvtuber-chat-send"
                disabled={isSending || !input.trim()}
                onClick={() => void sendMessage()}
              >
                kvtuberへ送信
              </button>
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
            この画面は番組管理ではなく、kvtuberへの業務依頼専用です。入力欄は中央のメイン領域にあります。
          </p>
        </aside>
      </main>
    </div>
  );
}

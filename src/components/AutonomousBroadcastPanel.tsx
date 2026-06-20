interface AutonomousBroadcastPanelProps {
  enabled: boolean;
  vibeCodingTeacherMode: boolean;
  theme: string;
  topicsText: string;
  intervalSeconds: number;
  nextTopicLabel: string;
  isProcessing: boolean;
  isSpeaking: boolean;
  turnCount: number;
  onEnabledChange: (enabled: boolean) => void;
  onVibeCodingTeacherModeChange: (enabled: boolean) => void;
  onThemeChange: (theme: string) => void;
  onTopicsTextChange: (topicsText: string) => void;
  onIntervalSecondsChange: (seconds: number) => void;
  onSpeakNow: () => void;
}

export function AutonomousBroadcastPanel({
  enabled,
  vibeCodingTeacherMode,
  theme,
  topicsText,
  intervalSeconds,
  nextTopicLabel,
  isProcessing,
  isSpeaking,
  turnCount,
  onEnabledChange,
  onVibeCodingTeacherModeChange,
  onThemeChange,
  onTopicsTextChange,
  onIntervalSecondsChange,
  onSpeakNow,
}: AutonomousBroadcastPanelProps) {
  const isBusy = isProcessing || isSpeaking;

  return (
    <section className={`autonomous-panel ${enabled ? 'is-live' : ''}`}>
      <div className="autonomous-header">
        <div>
          <div className="autonomous-kicker">
            {vibeCodingTeacherMode ? 'Vibe Coding Dojo' : 'Autonomous Live'}
          </div>
          <h2>
            {vibeCodingTeacherMode
              ? 'バイブコーディング先生モード'
              : '自律配信モード'}
          </h2>
        </div>
        <button
          className={`autonomous-toggle ${enabled ? 'is-live' : ''}`}
          onClick={() => onEnabledChange(!enabled)}
        >
          {enabled ? '停止' : '開始'}
        </button>
      </div>

      <div className="autonomous-mode-row">
        <button
          className={`autonomous-mode-pill ${
            vibeCodingTeacherMode ? 'is-active' : ''
          }`}
          onClick={() => onVibeCodingTeacherModeChange(true)}
        >
          くらげ先生
        </button>
        <button
          className={`autonomous-mode-pill ${
            !vibeCodingTeacherMode ? 'is-active' : ''
          }`}
          onClick={() => onVibeCodingTeacherModeChange(false)}
        >
          汎用VTuber
        </button>
        <span className="autonomous-mode-hint">
          {vibeCodingTeacherMode
            ? 'AI開発の考え方、頼み方、確認方法を教える人格です'
            : '通常のKurage AI Navigator人格です'}
        </span>
      </div>

      <div className="autonomous-grid">
        <label className="autonomous-field autonomous-field-theme">
          <span>配信テーマ</span>
          <input
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
            placeholder="例: Kurage VTuber動画生成モードの紹介"
          />
        </label>

        <label className="autonomous-field autonomous-field-interval">
          <span>発話間隔</span>
          <select
            value={intervalSeconds}
            onChange={(e) => onIntervalSecondsChange(Number(e.target.value))}
          >
            <option value={3}>3秒</option>
            <option value={5}>5秒</option>
            <option value={10}>10秒</option>
            <option value={15}>15秒</option>
            <option value={30}>30秒</option>
            <option value={45}>45秒</option>
            <option value={60}>60秒</option>
          </select>
        </label>
      </div>

      <label className="autonomous-field">
        <span>話題キュー 1行1トピック</span>
        <textarea
          value={topicsText}
          onChange={(e) => onTopicsTextChange(e.target.value)}
          rows={4}
          placeholder="自己紹介\n今日のテーマ\n視聴者への問いかけ"
        />
      </label>

      <div className="autonomous-status-row">
        <div className="autonomous-status">
          <span className={`autonomous-dot ${enabled ? 'is-live' : ''}`} />
          {enabled ? (isBusy ? '発話中または生成中' : '待機中') : '停止中'}
          {turnCount > 0 ? ` / ${turnCount}ターン` : ''}
        </div>
        <div className="autonomous-next">次: {nextTopicLabel || '話題なし'}</div>
      </div>

      <button
        className="autonomous-speak-now"
        onClick={onSpeakNow}
        disabled={isBusy || !nextTopicLabel}
      >
        今すぐ1トピック話す
      </button>
    </section>
  );
}

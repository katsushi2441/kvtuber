import { type CSSProperties, useEffect, useState } from 'react';

interface AvatarPanelProps {
  mouthLevel: number;
  isSpeaking: boolean;
  smoothedValue: number;
  avatarImageUrls?: AvatarImageUrls;
}

const AVATAR_IMAGES = {
  mouth_close_eyes_open: '/avatar/kurage_avatar_idle.png',
  mouth_close_eyes_close: '/avatar/kurage_avatar_idle.png',
  mouth_open_eyes_open: '/avatar/kurage_avatar_talk_open.png',
  mouth_open_eyes_close: '/avatar/kurage_avatar_talk_wide.png',
} as const;

export type AvatarImageKey = keyof typeof AVATAR_IMAGES;
export type AvatarImageUrls = Partial<Record<AvatarImageKey, string>>;

const INOCHI_LAYER_IMAGES = {
  bell: '/avatar/inochi2d/kurage_layers/10_bell_body.png',
  innerTentacles: '/avatar/inochi2d/kurage_layers/20_inner_tentacles.png',
  leftTentacles: '/avatar/inochi2d/kurage_layers/30_left_tentacles.png',
  rightTentacles: '/avatar/inochi2d/kurage_layers/40_right_tentacles.png',
  mouthClosed: '/avatar/inochi2d/kurage_layers/50_mouth_closed.png',
  mouthOpen: '/avatar/inochi2d/kurage_layers/51_mouth_open.png',
  mouthWide: '/avatar/inochi2d/kurage_layers/52_mouth_wide.png',
} as const;

/** Hook for random blinking */
function useBlink() {
  const [eyesClosed, setEyesClosed] = useState(false);

  useEffect(() => {
    let blinkTimeout: ReturnType<typeof setTimeout>;
    let openTimeout: ReturnType<typeof setTimeout>;

    const scheduleBlink = () => {
      // Blink every 2-6 seconds
      const interval = 2000 + Math.random() * 4000;
      blinkTimeout = setTimeout(() => {
        setEyesClosed(true);
        // Keep eyes closed for 100-200ms
        openTimeout = setTimeout(
          () => {
            setEyesClosed(false);
            scheduleBlink();
          },
          100 + Math.random() * 100,
        );
      }, interval);
    };

    scheduleBlink();
    return () => {
      clearTimeout(blinkTimeout);
      clearTimeout(openTimeout);
    };
  }, []);

  return eyesClosed;
}

/** Fallback SVG when image is unavailable */
function FallbackAvatar({
  mouthOpen,
  eyesClosed,
}: { mouthOpen: boolean; eyesClosed: boolean }) {
  const mouthHeight = mouthOpen ? 14 : 2;
  const mouthY = 130 - mouthHeight / 2;
  return (
    <svg
      width="200"
      height="200"
      viewBox="0 0 200 200"
      style={{ display: 'block', margin: '0 auto' }}
    >
      {/* Face */}
      <circle
        cx="100"
        cy="100"
        r="80"
        fill="#FFE0B2"
        stroke="#E0A060"
        strokeWidth="2"
      />
      {/* Left eye */}
      {eyesClosed ? (
        <line
          x1="58"
          y1="85"
          x2="82"
          y2="85"
          stroke="#333"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <circle cx="70" cy="85" r="8" fill="#333" />
      )}
      {/* Right eye */}
      {eyesClosed ? (
        <line
          x1="118"
          y1="85"
          x2="142"
          y2="85"
          stroke="#333"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <circle cx="130" cy="85" r="8" fill="#333" />
      )}
      {/* Mouth */}
      <ellipse
        cx="100"
        cy={mouthY + mouthHeight / 2}
        rx={mouthOpen ? 15 : 12}
        ry={Math.max(mouthHeight / 2, 1)}
        fill={mouthOpen ? '#C62828' : '#333'}
        stroke="#333"
        strokeWidth="1"
      />
    </svg>
  );
}

function isUsingCanonicalKurageAssets(avatarImageUrls?: AvatarImageUrls) {
  return !avatarImageUrls || Object.keys(avatarImageUrls).length === 0;
}

function InochiKurageRig({
  mouthLevel,
  isSpeaking,
  eyesClosed,
}: {
  mouthLevel: number;
  isSpeaking: boolean;
  eyesClosed: boolean;
}) {
  const mouthOpen = isSpeaking && mouthLevel >= 1;
  const mouthWide = isSpeaking && mouthLevel >= 3;
  const energy = Math.min(Math.max(mouthLevel / 4, 0), 1);

  return (
    <div
      className={`inochi-kurage-rig ${isSpeaking ? 'is-speaking' : ''} ${
        eyesClosed ? 'eyes-closed' : ''
      }`}
      style={{ '--kurage-energy': energy } as CSSProperties}
      aria-label="Kurage Inochi2D-style layered rig avatar"
    >
      <img
        className="inochi-kurage-layer inochi-kurage-inner"
        src={INOCHI_LAYER_IMAGES.innerTentacles}
        alt=""
      />
      <img
        className="inochi-kurage-layer inochi-kurage-left"
        src={INOCHI_LAYER_IMAGES.leftTentacles}
        alt=""
      />
      <img
        className="inochi-kurage-layer inochi-kurage-right"
        src={INOCHI_LAYER_IMAGES.rightTentacles}
        alt=""
      />
      <img
        className="inochi-kurage-layer inochi-kurage-bell"
        src={INOCHI_LAYER_IMAGES.bell}
        alt=""
      />
      <img
        className="inochi-kurage-layer inochi-kurage-mouth"
        src={INOCHI_LAYER_IMAGES.mouthClosed}
        alt=""
      />
      {mouthOpen && (
        <img
          className="inochi-kurage-layer inochi-kurage-mouth inochi-kurage-mouth-open"
          src={mouthWide ? INOCHI_LAYER_IMAGES.mouthWide : INOCHI_LAYER_IMAGES.mouthOpen}
          alt=""
        />
      )}
      {eyesClosed && <div className="inochi-kurage-blink inochi-kurage-blink-left" />}
      {eyesClosed && <div className="inochi-kurage-blink inochi-kurage-blink-right" />}
    </div>
  );
}

function CustomLayeredAvatar({
  mouthLevel,
  isSpeaking,
  avatarImageUrls,
  onBaseError,
}: {
  mouthLevel: number;
  isSpeaking: boolean;
  avatarImageUrls?: AvatarImageUrls;
  onBaseError: (src: string) => void;
}) {
  const mouthOpen = isSpeaking && mouthLevel >= 1;
  const mouthWide = isSpeaking && mouthLevel >= 3;
  const energy = Math.min(Math.max(mouthLevel / 4, 0), 1);
  const baseSrc =
    avatarImageUrls?.mouth_close_eyes_open || AVATAR_IMAGES.mouth_close_eyes_open;
  const mouthSrc =
    (mouthWide
      ? avatarImageUrls?.mouth_open_eyes_close
      : avatarImageUrls?.mouth_open_eyes_open) ||
    avatarImageUrls?.mouth_open_eyes_open ||
    AVATAR_IMAGES.mouth_open_eyes_open;

  return (
    <div
      className={`custom-layered-avatar ${isSpeaking ? 'is-speaking' : ''}`}
      style={{ '--avatar-mouth-energy': energy } as CSSProperties}
      aria-label="Layered avatar with mouth-only lipsync"
    >
      <img
        src={baseSrc}
        alt="Avatar"
        className="custom-avatar-layer custom-avatar-base"
        onError={() => onBaseError(baseSrc)}
      />
      {mouthOpen && (
        <img
          src={mouthSrc}
          alt=""
          className="custom-avatar-layer custom-avatar-mouth-overlay"
        />
      )}
    </div>
  );
}

export function AvatarPanel({
  mouthLevel,
  isSpeaking,
  smoothedValue,
  avatarImageUrls,
}: AvatarPanelProps) {
  const eyesClosed = useBlink();
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  const baseImageSrc =
    avatarImageUrls?.mouth_close_eyes_open || AVATAR_IMAGES.mouth_close_eyes_open;
  const showInochiRig = isUsingCanonicalKurageAssets(avatarImageUrls);
  const showCustomLayeredAvatar =
    !showInochiRig && Boolean(baseImageSrc) && failedImageSrc !== baseImageSrc;
  const mouthOpen = isSpeaking && mouthLevel >= 1;

  // Debug bar width (0-100%)
  const barWidth = Math.min((smoothedValue / 0.12) * 100, 100);

  return (
    <div className="avatar-panel">
      <div className="avatar-container">
        {showInochiRig && (
          <InochiKurageRig
            mouthLevel={mouthLevel}
            isSpeaking={isSpeaking}
            eyesClosed={eyesClosed}
          />
        )}
        {showCustomLayeredAvatar && (
          <CustomLayeredAvatar
            mouthLevel={mouthLevel}
            isSpeaking={isSpeaking}
            avatarImageUrls={avatarImageUrls}
            onBaseError={setFailedImageSrc}
          />
        )}
        {!showInochiRig && !showCustomLayeredAvatar && (
          <FallbackAvatar mouthOpen={mouthOpen} eyesClosed={eyesClosed} />
        )}
      </div>

      {/* Debug display */}
      <div className="debug-panel">
        <div className="debug-bar-container">
          <div className="debug-bar" style={{ width: `${barWidth}%` }} />
        </div>
        <div className="debug-info">
          <span>Mouth: {mouthLevel}/4</span>
          <span>RMS: {smoothedValue.toFixed(4)}</span>
          <span>{isSpeaking ? '🔊 Speaking' : '🔇 Idle'}</span>
        </div>
      </div>
    </div>
  );
}

/** Avatar composited into the chat background */
export function AvatarBackground({
  mouthLevel,
  isSpeaking,
  avatarImageUrls,
}: Omit<AvatarPanelProps, 'smoothedValue'>) {
  const eyesClosed = useBlink();
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  const baseImageSrc =
    avatarImageUrls?.mouth_close_eyes_open || AVATAR_IMAGES.mouth_close_eyes_open;
  const showInochiRig = isUsingCanonicalKurageAssets(avatarImageUrls);
  const showCustomLayeredAvatar =
    !showInochiRig && Boolean(baseImageSrc) && failedImageSrc !== baseImageSrc;
  const mouthOpen = isSpeaking && mouthLevel >= 1;

  return (
    <div className="avatar-background">
      <div className="avatar-container">
        {showInochiRig && (
          <InochiKurageRig
            mouthLevel={mouthLevel}
            isSpeaking={isSpeaking}
            eyesClosed={eyesClosed}
          />
        )}
        {showCustomLayeredAvatar && (
          <CustomLayeredAvatar
            mouthLevel={mouthLevel}
            isSpeaking={isSpeaking}
            avatarImageUrls={avatarImageUrls}
            onBaseError={setFailedImageSrc}
          />
        )}
        {!showInochiRig && !showCustomLayeredAvatar && (
          <FallbackAvatar mouthOpen={mouthOpen} eyesClosed={eyesClosed} />
        )}
      </div>
    </div>
  );
}

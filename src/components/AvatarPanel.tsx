import { useEffect, useState } from 'react';

interface AvatarPanelProps {
  mouthLevel: number;
  isSpeaking: boolean;
  smoothedValue: number;
  avatarImageUrls?: AvatarImageUrls;
}

const AVATAR_IMAGES = {
  mouth_close_eyes_open: '/avatar/lipsync/kurage_mouth_0.png',
  mouth_close_eyes_close: '/avatar/lipsync/kurage_mouth_0.png',
  mouth_open_eyes_open: '/avatar/lipsync/kurage_mouth_3.png',
  mouth_open_eyes_close: '/avatar/lipsync/kurage_mouth_4.png',
} as const;

export type AvatarImageKey = keyof typeof AVATAR_IMAGES;
export type AvatarImageUrls = Partial<Record<AvatarImageKey, string>>;

/**
 * Registration-stable lip-sync frames for the default Kurage avatar.
 * All five frames are the SAME base image with only the mouth pixels redrawn
 * (see scripts/make-kurage-lipsync.py), so swapping them changes nothing but
 * the mouth — no head/body drift. Index = mouth openness 0 (closed) .. 4 (wide).
 */
const KURAGE_LIPSYNC_FRAMES = [
  '/avatar/lipsync/kurage_mouth_0.png',
  '/avatar/lipsync/kurage_mouth_1.png',
  '/avatar/lipsync/kurage_mouth_2.png',
  '/avatar/lipsync/kurage_mouth_3.png',
  '/avatar/lipsync/kurage_mouth_4.png',
] as const;

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
  // A user-uploaded custom avatar: we can't know where its mouth is, so just
  // swap their closed/open stills (no synthetic mouth overlay).
  const customBase = avatarImageUrls?.mouth_close_eyes_open;
  if (customBase) {
    const customOpen = avatarImageUrls?.mouth_open_eyes_open || customBase;
    const src = isSpeaking && mouthLevel >= 1 ? customOpen : customBase;
    return (
      <div className="custom-layered-avatar" aria-label="Avatar">
        <img
          src={src}
          alt="Avatar"
          className="custom-avatar-layer custom-avatar-frame"
          onError={() => onBaseError(customBase)}
        />
      </div>
    );
  }

  // Default Kurage avatar: render all lip-sync frames stacked and reveal only
  // the active one. Because every frame shares the same base, the only visible
  // change is the mouth — zero positional drift, and preloading avoids flicker.
  const active = isSpeaking ? Math.min(Math.max(mouthLevel, 0), 4) : 0;
  return (
    <div className="custom-layered-avatar" aria-label="Avatar with mouth-only lipsync">
      {KURAGE_LIPSYNC_FRAMES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === 0 ? 'Avatar' : ''}
          aria-hidden={i !== 0}
          loading="eager"
          decoding="sync"
          className="custom-avatar-layer custom-avatar-frame"
          style={{ opacity: i === active ? 1 : 0 }}
          onError={i === 0 ? () => onBaseError(src) : undefined}
        />
      ))}
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
  const showCustomLayeredAvatar =
    Boolean(baseImageSrc) && failedImageSrc !== baseImageSrc;
  const mouthOpen = isSpeaking && mouthLevel >= 1;

  // Debug bar width (0-100%)
  const barWidth = Math.min((smoothedValue / 0.12) * 100, 100);

  return (
    <div className="avatar-panel">
      <div className="avatar-container">
        {showCustomLayeredAvatar && (
          <CustomLayeredAvatar
            mouthLevel={mouthLevel}
            isSpeaking={isSpeaking}
            avatarImageUrls={avatarImageUrls}
            onBaseError={setFailedImageSrc}
          />
        )}
        {!showCustomLayeredAvatar && (
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
  const showCustomLayeredAvatar =
    Boolean(baseImageSrc) && failedImageSrc !== baseImageSrc;
  const mouthOpen = isSpeaking && mouthLevel >= 1;

  return (
    <div className="avatar-background">
      <div className="avatar-container">
        {showCustomLayeredAvatar && (
          <CustomLayeredAvatar
            mouthLevel={mouthLevel}
            isSpeaking={isSpeaking}
            avatarImageUrls={avatarImageUrls}
            onBaseError={setFailedImageSrc}
          />
        )}
        {!showCustomLayeredAvatar && (
          <FallbackAvatar mouthOpen={mouthOpen} eyesClosed={eyesClosed} />
        )}
      </div>
    </div>
  );
}

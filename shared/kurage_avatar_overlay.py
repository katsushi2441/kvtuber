"""Shared Kurage avatar overlay helpers.

kvtuber owns the canonical avatar assets and motion recipe. Kurage products
should import this module instead of copying avatar paths or motion constants.
"""
from __future__ import annotations

import html
import os
from pathlib import Path

ROOT = Path(os.environ.get("KURAGE_AVATAR_ROOT", "/home/kojima/work/kvtuber/public/avatar"))
LIPSYNC_DIR = Path(os.environ.get("KURAGE_AVATAR_LIPSYNC_DIR", str(ROOT / "lipsync")))
FRAME_COUNT = 5
MOUTH_CYCLE_SEC = 0.35
MOUTH_STEP_SEC = 0.07
SWAY_X_PX = 2
BREATH_Y_PX = 5
SWAY_SPEED = 1.013
BREATH_SPEED = 0.604


def avatar_frames() -> list[Path]:
    """Return canonical mouth-only lip-sync PNG frames."""
    return [LIPSYNC_DIR / f"kurage_mouth_{i}.png" for i in range(FRAME_COUNT)]


def available_avatar_frames() -> list[Path]:
    """Return existing canonical frames, preserving order."""
    return [p for p in avatar_frames() if p.exists()]


def validate_avatar_frames() -> bool:
    """True when the full canonical mouth-only set is available."""
    frames = avatar_frames()
    return len(frames) == FRAME_COUNT and all(p.exists() for p in frames)


def build_hyperframes_vtuber_overlay(total_dur: float, title: str) -> tuple[str, str, str]:
    """Build the shared Kurage VTuber overlay for HyperFrames videos."""
    safe_title = html.escape(title)
    overlay_html = f"""
    <div id="vtuber-layer" aria-label="Kurage VTuber explainer overlay">
      <div class="vtuber-badge">Kurage解説</div>
      <div class="vtuber-card">
        <div class="vtuber-copy">
          <div class="vtuber-name">Kurage AI Navigator</div>
          <div class="vtuber-topic">{safe_title}</div>
        </div>
        <div class="vtuber-avatar-wrap">
          <div class="vtuber-glow"></div>
          <div class="vtuber-motion-rig">
            <div class="vtuber-breath-rig">
              <img id="vtuber-frame-0" class="vtuber-avatar vtuber-avatar-frame" src="assets/avatar_lipsync_0.png" alt="Kurage avatar">
              <img id="vtuber-frame-1" class="vtuber-avatar vtuber-avatar-frame" src="assets/avatar_lipsync_1.png" alt="">
              <img id="vtuber-frame-2" class="vtuber-avatar vtuber-avatar-frame" src="assets/avatar_lipsync_2.png" alt="">
              <img id="vtuber-frame-3" class="vtuber-avatar vtuber-avatar-frame" src="assets/avatar_lipsync_3.png" alt="">
              <img id="vtuber-frame-4" class="vtuber-avatar vtuber-avatar-frame" src="assets/avatar_lipsync_4.png" alt="">
            </div>
          </div>
        </div>
      </div>
    </div>"""

    overlay_css = """
    #vtuber-layer {
      position: absolute; inset: 0; z-index: 22; pointer-events: none;
      font-family: "Noto Sans JP", sans-serif;
    }
    .vtuber-badge {
      position: absolute; top: 24px; right: 22px;
      padding: 8px 13px; border-radius: 999px;
      color: #07536a; background: rgba(255,255,255,0.94);
      border: 1px solid rgba(7,138,166,0.22);
      box-shadow: 0 10px 28px rgba(49, 121, 139, 0.16);
      font-size: 15px; font-weight: 900; letter-spacing: 0.04em;
    }
    .vtuber-card {
      position: absolute; right: 18px; bottom: 22px;
      width: 252px; min-height: 248px; border-radius: 28px;
      background:
        radial-gradient(circle at 78% 12%, rgba(255,255,255,0.92), transparent 28%),
        linear-gradient(145deg, rgba(255,255,255,0.94), rgba(231, 249, 255, 0.9));
      border: 1px solid rgba(7,138,166,0.22);
      box-shadow: 0 20px 48px rgba(49, 121, 139, 0.18), inset 0 1px 0 rgba(255,255,255,0.86);
      overflow: hidden;
    }
    .vtuber-card::before {
      content: ""; position: absolute; inset: auto -40px -70px -30px; height: 142px;
      background: radial-gradient(ellipse at center, rgba(111, 218, 236, 0.34), transparent 70%);
    }
    .vtuber-copy {
      position: absolute; left: 17px; right: 17px; top: 15px; z-index: 2;
      color: #17313a; text-shadow: none;
    }
    .vtuber-name {
      display: inline-block; padding: 5px 9px; border-radius: 999px;
      background: #e5faff; border: 1px solid rgba(7,138,166,0.18);
      color: #078aa6;
      font-size: 13px; font-weight: 900; letter-spacing: 0.03em;
    }
    .vtuber-topic {
      margin-top: 8px; max-height: 45px; overflow: hidden;
      font-size: 16px; font-weight: 900; line-height: 1.35;
    }
    .vtuber-avatar-wrap {
      position: absolute; right: -6px; bottom: -10px;
      width: 224px; height: 224px; z-index: 1;
    }
    .vtuber-glow {
      position: absolute; left: 26px; right: 12px; bottom: 20px; height: 92px;
      border-radius: 999px; background: rgba(102, 211, 230, 0.26);
      filter: blur(16px);
    }
    .vtuber-motion-rig,
    .vtuber-breath-rig {
      position: absolute; inset: 0;
    }
    .vtuber-motion-rig {
      animation: vtuberBodySway 6.2s ease-in-out infinite;
      transform-origin: 50% 92%;
    }
    .vtuber-breath-rig {
      animation: vtuberBreath 5.2s ease-in-out infinite;
      transform-origin: 50% 62%;
    }
    .vtuber-avatar {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: contain; filter: drop-shadow(0 16px 22px rgba(49, 121, 139, 0.22));
      transform-origin: 54% 66%;
    }
    .vtuber-avatar-frame {
      opacity: 0;
      transition: none;
    }
    #vtuber-frame-0 {
      opacity: 1;
    }
    body.vtuber-enabled .scene-text {
      bottom: 292px; padding: 0 30px;
    }
    @keyframes vtuberBreath {
      0%, 100% { transform: translateY(0) scaleX(1) scaleY(1); }
      50% { transform: translateY(-3%) scaleX(1.016) scaleY(1.03); }
    }
    @keyframes vtuberBodySway {
      0%, 100% { transform: rotate(-0.9deg) translateX(-0.5%); }
      50% { transform: rotate(0.9deg) translateX(0.5%); }
    }"""

    mouth_js = []
    t = 2.0
    while t < total_dur:
        level = int((round(t * 100) // 28) % FRAME_COUNT)
        mouth_js.append(
            f'    tl.set(".vtuber-avatar-frame", {{opacity:0}}, {t:.2f})'
            f'.set("#vtuber-frame-{level}", {{opacity:1}}, {t:.2f});'
        )
        t += 0.28
    mouth_js.append(
        f'    tl.set(".vtuber-avatar-frame", {{opacity:0}}, {total_dur:.2f})'
        f'.set("#vtuber-frame-0", {{opacity:1}}, {total_dur:.2f});'
    )

    overlay_js = f"""
    tl.from("#vtuber-layer", {{opacity:0, y:38, scale:0.96, duration:0.55, ease:"power3.out"}}, 1.15);
{chr(10).join(mouth_js)}"""

    return overlay_html, overlay_css, overlay_js


def ffmpeg_avatar_position(margin_x: int, margin_y: int) -> tuple[str, str]:
    """Return shared ffmpeg x/y expressions for subtle avatar motion."""
    margin_x = max(0, int(margin_x))
    margin_y = max(0, int(margin_y))
    x_expr = f"W-w-{margin_x}+sin(t*{SWAY_SPEED})*{SWAY_X_PX}"
    y_expr = f"H-h-{margin_y}-abs(sin(t*{BREATH_SPEED}))*{BREATH_Y_PX}"
    return x_expr, y_expr


def build_ffmpeg_lipsync_overlay(frame_count: int, width: int, margin_x: int, margin_y: int) -> tuple[str, str]:
    """Build the shared ffmpeg filter graph for Kurage mouth-only overlay."""
    x_expr, y_expr = ffmpeg_avatar_position(margin_x, margin_y)
    scaled = [f"[{i + 1}:v]format=rgba,scale={int(width)}:-1[f{i}]" for i in range(frame_count)]
    overlays = [f"[0:v][f0]overlay=x={x_expr}:y={y_expr}:format=auto[v0]"]
    for i in range(1, frame_count):
        start = (i - 1) * MOUTH_STEP_SEC
        end = i * MOUTH_STEP_SEC
        overlays.append(
            f"[v{i - 1}][f{i}]overlay=x={x_expr}:y={y_expr}:"
            f"enable='between(mod(t,{MOUTH_CYCLE_SEC:.2f}),{start:.2f},{end:.2f})':format=auto[v{i}]"
        )
    return ";".join(scaled + overlays), f"[v{frame_count - 1}]"

#!/usr/bin/env python3
"""Generate registration-stable lip-sync frames for the Kurage bishoujo avatar.

Why this exists
---------------
Earlier attempts generated a separate full image per mouth state (or drew a CSS
mouth overlay). Those all drift: the head/hair/dress are different generations,
so the whole character jumps between frames -> "position shifted / creepy".

This script takes ONE locked base image and edits only a tiny region around the
mouth. Every pixel outside that region is identical across all frames, so by
construction there is zero positional shift. The closed frame keeps her natural
smile; the open frames draw a clean anime mouth (no dark blob, no stray stroke).

Run:  python3 scripts/make-kurage-lipsync.py
Out:  public/avatar/lipsync/kurage_mouth_{0..4}.png  (1200x1200 RGBA)
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "public" / "avatar" / "generated" / "kurage_bishoujo_idle.png"
OUT_DIR = ROOT / "public" / "avatar" / "lipsync"

# Mouth center on the 1200x1200 canvas. Must sit directly below the midpoint
# between the eyes: measured iris centers are x=535 and x=676 -> midpoint 605,
# and the original closed smile is at x=608. We use 607 so every mouth state
# (closed smile and all open frames) is centered there -> no horizontal drift.
CX, CY = 607, 513
PAD = 70          # half-size of the work crop around the mouth
SS = 6            # supersample factor for smooth, anti-aliased edges

# Mouth open levels: (half_width, half_height, draw_tongue)
LEVELS = {
    1: (16, 5, False),   # barely open
    2: (18, 10, True),   # mid
    3: (19, 14, True),   # open
    4: (20, 18, True),   # wide
}


def _outline(ox, oy, w, h, top_flat=0.6, bottom=1.0):
    pts = []
    n = 64
    for i in range(n + 1):
        t = -math.pi + (i / n) * 2 * math.pi
        ry = h * (top_flat if math.sin(t) < 0 else bottom)
        pts.append((ox + w * math.cos(t), oy + ry * math.sin(t)))
    return pts


def _clean_base(src: Image.Image) -> Image.Image:
    """Erase the closed smile using a contour-free skin strip copied from the chin.

    The smile sits at y=511..516; clean skin (no jaw/neck contour) is y=519..545.
    """
    b = src.copy()
    patch = src.crop((560, 519, 640, 539))
    b.paste(patch, (560, 505))
    return b


def _draw_mouth(cleaned: Image.Image, width: int, height: int, tongue: bool) -> Image.Image:
    box = (CX - PAD, CY - PAD, CX + PAD, CY + PAD)
    crop = cleaned.crop(box).resize((PAD * 2 * SS, PAD * 2 * SS), Image.LANCZOS).convert("RGBA")
    d = ImageDraw.Draw(crop)
    ox = oy = PAD * SS
    w, h = width * SS, height * SS

    # inner mouth
    d.polygon(_outline(ox, oy, w, h), fill=(80, 22, 30, 255))
    # upper inner shadow
    d.polygon(
        _outline(ox, oy - int(h * 0.4), w, int(h * 0.6), top_flat=0.9, bottom=0.45),
        fill=(52, 12, 18, 255),
    )
    if tongue and height > 6:
        d.ellipse((ox - int(w * 0.58), oy + int(h * 0.10), ox + int(w * 0.58), oy + int(h * 0.98)),
                  fill=(221, 127, 139, 255))
        d.ellipse((ox - int(w * 0.30), oy + int(h * 0.42), ox + int(w * 0.30), oy + int(h * 0.92)),
                  fill=(233, 152, 162, 210))
    # soft lower-lip highlight
    d.ellipse((ox - int(w * 0.66), oy + h - SS, ox + int(w * 0.66), oy + h + 5 * SS),
              fill=(245, 202, 202, 110))
    # thin upper-lip line, tapering at the corners (stays inside the mouth width)
    n = 40
    for i in range(n):
        t = math.pi + (i / (n - 1)) * math.pi
        x = ox + (w * 0.97) * math.cos(t)
        y = oy + (h * 0.6) * math.sin(t)
        r = max(2.1 * SS * (1 - abs((i / (n - 1)) - 0.5) * 1.3), 0.5 * SS)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(150, 84, 88, 255))

    small = crop.resize((PAD * 2, PAD * 2), Image.LANCZOS)
    out = cleaned.copy()
    out.paste(small, (box[0], box[1]), small)
    return out


def main() -> None:
    src = Image.open(BASE).convert("RGBA")
    cleaned = _clean_base(src)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Level 0 = closed: keep her natural resting smile (the untouched base).
    src.save(OUT_DIR / "kurage_mouth_0.png")
    for level, (w, h, tongue) in LEVELS.items():
        _draw_mouth(cleaned, w, h, tongue).save(OUT_DIR / f"kurage_mouth_{level}.png")
    print(f"wrote 5 frames to {OUT_DIR}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Lip-sync frames for the bishoujo2 (v2) Kurage avatar.

Same drift-free approach as make-kurage-lipsync.py: one locked base, only the
mouth pixels are redrawn, and the mouth is centered under the midpoint between
the eyes (measured eye-midpoint x=639, original smile x=637 -> use 637).

Run:  python3 scripts/make-bishoujo2-lipsync.py
Out:  public/avatar/lipsync/kurage_mouth_{0..4}.png
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "public" / "avatar" / "generated" / "bishoujo2_idle.png"
OUT_DIR = ROOT / "public" / "avatar" / "lipsync"

CX, CY = 620, 653      # mouth center, directly under the nose (nose highlight x=620)
PAD = 100
SS = 6

LEVELS = {
    1: (28, 9, False),
    2: (32, 17, True),
    3: (34, 24, True),
    4: (36, 30, True),
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
    """Erase the closed smile (y~648-656) with a clean skin strip from below."""
    b = src.copy()
    b.paste(src.crop((585, 665, 695, 685)), (585, 645))
    return b


def _draw(cleaned: Image.Image, width: int, height: int, tongue: bool) -> Image.Image:
    box = (CX - PAD, CY - PAD, CX + PAD, CY + PAD)
    crop = cleaned.crop(box).resize((PAD * 2 * SS, PAD * 2 * SS), Image.LANCZOS).convert("RGBA")
    d = ImageDraw.Draw(crop)
    ox = oy = PAD * SS
    w, h = width * SS, height * SS
    d.polygon(_outline(ox, oy, w, h), fill=(120, 46, 52, 255))
    d.polygon(_outline(ox, oy - int(h * 0.4), w, int(h * 0.6), top_flat=0.9, bottom=0.45),
              fill=(86, 28, 34, 255))
    if tongue and height > 8:
        d.ellipse((ox - int(w * 0.58), oy + int(h * 0.10), ox + int(w * 0.58), oy + int(h * 0.98)),
                  fill=(226, 132, 144, 255))
        d.ellipse((ox - int(w * 0.30), oy + int(h * 0.42), ox + int(w * 0.30), oy + int(h * 0.92)),
                  fill=(236, 158, 168, 210))
    d.ellipse((ox - int(w * 0.66), oy + h - 2 * SS, ox + int(w * 0.66), oy + h + 7 * SS),
              fill=(247, 206, 206, 110))
    n = 40
    for i in range(n):
        t = math.pi + (i / (n - 1)) * math.pi
        x = ox + (w * 0.97) * math.cos(t)
        y = oy + (h * 0.62) * math.sin(t)
        r = max(3.0 * SS * (1 - abs((i / (n - 1)) - 0.5) * 1.3), 0.8 * SS)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(150, 84, 88, 255))
    small = crop.resize((PAD * 2, PAD * 2), Image.LANCZOS)
    out = cleaned.copy()
    out.paste(small, (box[0], box[1]), small)
    return out


def _draw_closed(cleaned: Image.Image) -> Image.Image:
    """Gentle closed smile, centered at (CX, CY) so the resting frame is aligned
    under the nose just like the open frames (no horizontal jump)."""
    box = (CX - PAD, CY - PAD, CX + PAD, CY + PAD)
    crop = cleaned.crop(box).resize((PAD * 2 * SS, PAD * 2 * SS), Image.LANCZOS).convert("RGBA")
    d = ImageDraw.Draw(crop)
    ox = oy = PAD * SS
    w = 30 * SS
    # upward-curving smile line drawn as tapering dots
    n = 60
    for i in range(n):
        t = i / (n - 1)
        x = ox + (t - 0.5) * 2 * w
        y = oy + (abs(t - 0.5) ** 1.7) * 14 * SS - 3 * SS  # dip down in the middle, lift corners
        r = max(2.6 * SS * (1 - abs(t - 0.5) * 1.5), 0.7 * SS)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(176, 104, 104, 255))
    # soft lower-lip highlight
    d.ellipse((ox - int(w * 0.5), oy + int(10 * SS), ox + int(w * 0.5), oy + int(18 * SS)),
              fill=(247, 206, 206, 90))
    small = crop.resize((PAD * 2, PAD * 2), Image.LANCZOS)
    out = cleaned.copy()
    out.paste(small, (box[0], box[1]), small)
    return out


def main() -> None:
    src = Image.open(BASE).convert("RGBA")
    cleaned = _clean_base(src)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    _draw_closed(cleaned).save(OUT_DIR / "kurage_mouth_0.png")  # closed smile, re-centered
    for level, (w, h, tongue) in LEVELS.items():
        _draw(cleaned, w, h, tongue).save(OUT_DIR / f"kurage_mouth_{level}.png")
    print(f"wrote 5 frames to {OUT_DIR}")


if __name__ == "__main__":
    main()

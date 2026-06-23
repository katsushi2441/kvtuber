#!/usr/bin/env python3
"""OpenAI-compatible TTS shim backed by edge-tts.

The Vite dev server pipes a JSON payload to stdin and passes --output. This
keeps the default OSS path self-contained while allowing deployments to replace
this script via KURAGE_TTS_SCRIPT.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

DEFAULT_VOICE = os.environ.get('KURAGE_TTS_VOICE', 'ja-JP-NanamiNeural')
DEFAULT_RATE = os.environ.get('KURAGE_TTS_RATE', '+10%')
DEFAULT_PITCH = os.environ.get('KURAGE_TTS_PITCH', '-15Hz')
KURAGE_TTS_NORMALIZER_DIR = Path(
    os.environ.get('KURAGE_TTS_NORMALIZER_DIR', '/home/kojima/work/kurage/backend'),
)

if KURAGE_TTS_NORMALIZER_DIR.exists() and str(KURAGE_TTS_NORMALIZER_DIR) not in sys.path:
    sys.path.insert(0, str(KURAGE_TTS_NORMALIZER_DIR))

try:
    from tts_normalizer import normalize_tts_text as _kurage_normalize_tts_text
except Exception:  # pragma: no cover - standalone fallback
    _kurage_normalize_tts_text = None


def normalize_tts_text(text: str) -> str:
    if _kurage_normalize_tts_text is not None:
        return _kurage_normalize_tts_text(text)
    replacements = {
        'Kurage': 'クラゲ',
        'VWork': 'ブイワーク',
        'kdeck': 'ケーデック',
        'kvtuber': 'ケーブイチューバー',
        'AIxSNS': 'エーアイエックス エスエヌエス',
        'VTuber': 'ブイチューバー',
        'YouTube': 'ユーチューブ',
        'VOICEVOX': 'ボイスボックス',
        'Live2D': 'ライブツーディー',
        'VRM': 'ブイアールエム',
        'LLM': 'エルエルエム',
        'TTS': 'ティーティーエス',
        'API': 'エーピーアイ',
    }
    normalized = text or ''
    for src, dst in sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True):
        normalized = normalized.replace(src, dst)
    return normalized


def _rate_from_speed(speed: object) -> str:
    try:
        value = float(speed)
    except (TypeError, ValueError):
        return DEFAULT_RATE

    if not value or value == 1.0:
        return DEFAULT_RATE

    percent = round((value - 1.0) * 100)
    percent = max(-50, min(100, percent))
    return f'{percent:+d}%'


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    payload = json.load(sys.stdin)
    text = str(payload.get('input') or '').strip()
    if not text:
        print('input is required', file=sys.stderr)
        return 2
    tts_text = normalize_tts_text(text)

    voice = str(payload.get('voice') or DEFAULT_VOICE).strip() or DEFAULT_VOICE
    rate = _rate_from_speed(payload.get('speed'))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    import edge_tts

    communicate = edge_tts.Communicate(
        tts_text,
        voice=voice,
        rate=rate,
        pitch=DEFAULT_PITCH,
    )
    await communicate.save(str(output_path))
    return 0


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))

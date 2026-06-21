#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / 'public' / 'avatar'
OUT_DIR = SRC_DIR / 'inochi2d' / 'kurage_layers'
CANVAS = (1200, 1200)

# Inochi Creator can assemble these as separate source layers.  The crop boxes
# keep each part on the same 1200x1200 transparent canvas so alignment remains
# stable when imported or previewed over each other.
LAYERS = [
    {
        'name': '00_shadow_reference_full',
        'source': 'kurage_avatar_idle.png',
        'box': (0, 0, 1200, 1200),
        'role': 'reference only; hide before final rig if desired',
    },
    {
        'name': '10_bell_body',
        'source': 'kurage_avatar_idle.png',
        'box': (205, 0, 1005, 500),
        'role': 'main bell/body mesh; rig for breathe, tilt, and squash',
    },
    {
        'name': '20_inner_tentacles',
        'source': 'kurage_avatar_idle.png',
        'box': (310, 355, 920, 1200),
        'role': 'central tentacle group; rig for slow vertical sway',
    },
    {
        'name': '30_left_tentacles',
        'source': 'kurage_avatar_idle.png',
        'box': (145, 380, 520, 1120),
        'role': 'left ribbon/tentacle group; rig for delayed side sway',
    },
    {
        'name': '40_right_tentacles',
        'source': 'kurage_avatar_idle.png',
        'box': (690, 380, 1060, 1120),
        'role': 'right ribbon/tentacle group; rig for delayed side sway',
    },
    {
        'name': '50_mouth_closed',
        'source': 'kurage_avatar_idle.png',
        'box': (630, 260, 760, 330),
        'role': 'mouth closed expression layer',
    },
    {
        'name': '51_mouth_open',
        'source': 'kurage_avatar_talk_open.png',
        'box': (630, 260, 760, 330),
        'role': 'mouth open expression layer driven by audio volume',
    },
    {
        'name': '52_mouth_wide',
        'source': 'kurage_avatar_talk_wide.png',
        'box': (630, 260, 760, 330),
        'role': 'wide mouth expression for higher audio volume',
    },
]


def make_layer(src: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    layer = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    crop = src.crop(box)
    layer.alpha_composite(crop, (box[0], box[1]))
    return layer


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        'name': 'Kurage Inochi2D Starter Layer Kit',
        'format': 'source-layer-kit',
        'canvas': {'width': CANVAS[0], 'height': CANVAS[1]},
        'source': 'public/avatar canonical Kurage PNG avatar',
        'notes': [
            'This is not a finished .inp puppet. It is a starter layer kit for Inochi Creator.',
            'Import the PNG layers into Inochi Creator, mesh bell/tentacle layers, then export .inp.',
            'All layers keep the same canvas size so their positions line up without manual offsets.',
        ],
        'layers': [],
    }
    cache: dict[str, Image.Image] = {}
    for item in LAYERS:
        src_name = item['source']
        if src_name not in cache:
            cache[src_name] = Image.open(SRC_DIR / src_name).convert('RGBA')
        output_name = f"{item['name']}.png"
        make_layer(cache[src_name], item['box']).save(OUT_DIR / output_name)
        manifest['layers'].append({
            'file': output_name,
            'source': src_name,
            'box': item['box'],
            'role': item['role'],
        })
    (OUT_DIR / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print(f'Generated {len(LAYERS)} layers in {OUT_DIR}') 


if __name__ == '__main__':
    main()

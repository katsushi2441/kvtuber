#!/usr/bin/env python3
"""生成したKurageキャラ素材を、既存のffmpeg合成方式で動かして確認する。

既存 shared/kurage_avatar_overlay.py は「口だけのPNG」をbase動画へoverlayし、
enable='between(mod(t,..))' で切り替える方式。ここもその流儀を踏襲する。

違いは、目と口を独立に動かせるようにした点。
generate_character.py が作る差分はベースとピクセル単位で同一なので、
ベースとの差分領域だけを切り出せば「目パーツ」「口パーツ」になる。
これで まばたき と 口パク を別々のタイミングで走らせられる。

    python3 scripts/render_character_demo.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared.kurage_avatar_overlay import (  # noqa: E402
    BREATH_SPEED,
    BREATH_Y_PX,
    SWAY_SPEED,
    SWAY_X_PX,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
CHAR_DIR = REPO_ROOT / "outputs" / "character"
PARTS_DIR = CHAR_DIR / "parts"
DEMO_PATH = CHAR_DIR / "demo.mp4"

# 目と口の担当範囲。実測では目がy225-286、口がy285-307で2pxだけ重なるため、
# ここで切り分けて二重描画を防ぐ。
EYE_MAX_Y = 284
MOUTH_MIN_Y = 285

EYE_VARIANTS = ["eye_half", "eye_close"]
MOUTH_VARIANTS = ["mouth_round", "mouth_open_small", "mouth_open_wide"]

# 表示サイズ（動画内でのキャラの幅）と配置余白
AVATAR_WIDTH = 420
MARGIN_X = 40
MARGIN_Y = 0
DURATION = 12.0
FPS = 30
CANVAS = "1280x720"

# まばたき: 3.4秒ごとに half → close → half（人間のまばたきは約0.1〜0.2秒）
BLINK_CYCLE = 3.4
BLINK_HALF_IN = (0.00, 0.05)
BLINK_CLOSE = (0.05, 0.15)
BLINK_HALF_OUT = (0.15, 0.20)

# 口パク: 0.4秒周期で 閉じ→お→え→あ→え を回す（喋っている区間だけ）
MOUTH_CYCLE = 0.40
MOUTH_SLOTS = [
    (None, 0.00, 0.08),                 # 閉じ（ベースのまま）
    ("mouth_round", 0.08, 0.16),
    ("mouth_open_small", 0.16, 0.24),
    ("mouth_open_wide", 0.24, 0.32),
    ("mouth_open_small", 0.32, 0.40),
]
# 喋っている区間（秒）。無音区間では口を閉じたままにして、周期回しっぱなしを避ける。
SPEECH_SPANS = [(0.8, 4.6), (6.0, 10.8)]


def extract_parts() -> dict:
    """ベースとの差分領域を切り出して、パーツPNGと位置情報を作る。"""
    from PIL import Image
    import numpy as np

    base_path = CHAR_DIR / "kurage_base.png"
    if not base_path.is_file():
        raise SystemExit("先に generate_character.py で素材を作ってください")
    PARTS_DIR.mkdir(parents=True, exist_ok=True)

    base_img = Image.open(base_path).convert("RGBA")
    base = np.asarray(base_img, dtype=int)
    manifest: dict = {"base": base_path.name, "size": list(base_img.size), "parts": {}}

    for name in EYE_VARIANTS + MOUTH_VARIANTS:
        src = CHAR_DIR / f"kurage_{name}.png"
        if not src.is_file():
            print(f"  skip（未生成）: {name}")
            continue
        var_img = Image.open(src).convert("RGBA")
        var = np.asarray(var_img, dtype=int)
        changed = np.abs(base - var).sum(axis=2) > 30

        # 目/口の担当範囲の外は無視する
        mask = np.zeros_like(changed)
        if name in EYE_VARIANTS:
            mask[: EYE_MAX_Y + 1] = True
        else:
            mask[MOUTH_MIN_Y:] = True
        changed = changed & mask

        ys, xs = np.nonzero(changed)
        if len(ys) == 0:
            print(f"  skip（差分なし）: {name}")
            continue
        pad = 2
        x0, x1 = max(0, xs.min() - pad), min(base.shape[1] - 1, xs.max() + pad)
        y0, y1 = max(0, ys.min() - pad), min(base.shape[0] - 1, ys.max() + pad)

        part = var_img.crop((x0, y0, x1 + 1, y1 + 1))
        out = PARTS_DIR / f"{name}.png"
        part.save(out)
        manifest["parts"][name] = {"file": out.name, "x": int(x0), "y": int(y0),
                                   "w": part.width, "h": part.height}
        print(f"  {name:<18} {part.width}x{part.height} @ ({x0},{y0}) -> {out.name}")

    (PARTS_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest


def _spans_enable(spans: list[tuple[float, float]]) -> str:
    """ffmpegのenable式: 指定区間のいずれかに入っていれば有効。"""
    return "+".join(f"between(t,{a:.2f},{b:.2f})" for a, b in spans) if spans else "0"


def build_filter(manifest: dict) -> tuple[list[str], str]:
    """ベース＋目パーツ＋口パーツのフィルタグラフを組む。"""
    size = manifest["size"]
    scale = AVATAR_WIDTH / size[0]
    canvas_w, canvas_h = (int(v) for v in CANVAS.split("x"))
    base_h = round(size[1] * scale)

    # shared側の ffmpeg_avatar_position は W-w を使うが、あれはベース1枚を置く前提。
    # パーツを重ねる場合 w はパーツ自身の幅になり、位置がずれて画面外へ飛ぶ。
    # ここではベースの配置を数値で確定させ、パーツはそこからの相対で置く。
    base_x = f"{canvas_w - AVATAR_WIDTH - MARGIN_X}+sin(t*{SWAY_SPEED})*{SWAY_X_PX}"
    base_y = f"{canvas_h - base_h - MARGIN_Y}-abs(sin(t*{BREATH_SPEED}))*{BREATH_Y_PX}"

    inputs = [str(CHAR_DIR / manifest["base"])]
    chains = [f"[1:v]format=rgba,scale={AVATAR_WIDTH}:-1[base]"]
    overlays = [f"[0:v][base]overlay=x={base_x}:y={base_y}:format=auto[v0]"]

    idx = 1  # ffmpegの入力番号（0はbackground、1はキャラベース）
    stage = 0

    def add_part(name: str, enable: str) -> None:
        nonlocal idx, stage
        info = manifest["parts"].get(name)
        if not info:
            return
        idx += 1
        pw = max(1, round(info["w"] * scale))
        # パーツはベースと同じ倍率で縮小し、ベースの左上からの相対位置に置く
        px = f"({base_x})+{info['x'] * scale:.2f}"
        py = f"({base_y})+{info['y'] * scale:.2f}"
        chains.append(f"[{idx}:v]format=rgba,scale={pw}:-1[p{stage}]")
        overlays.append(
            f"[v{stage}][p{stage}]overlay=x={px}:y={py}:enable='{enable}':format=auto[v{stage + 1}]"
        )
        inputs.append(str(PARTS_DIR / info["file"]))
        stage += 1

    # まばたき（周期）
    add_part("eye_half",
             f"between(mod(t,{BLINK_CYCLE}),{BLINK_HALF_IN[0]},{BLINK_HALF_IN[1]})"
             f"+between(mod(t,{BLINK_CYCLE}),{BLINK_HALF_OUT[0]},{BLINK_HALF_OUT[1]})")
    add_part("eye_close",
             f"between(mod(t,{BLINK_CYCLE}),{BLINK_CLOSE[0]},{BLINK_CLOSE[1]})")

    # 口パク（喋っている区間だけ周期を回す）
    speech = _spans_enable(SPEECH_SPANS)
    for part_name, a, b in MOUTH_SLOTS:
        if part_name is None:
            continue
        add_part(part_name, f"({speech})*between(mod(t,{MOUTH_CYCLE}),{a},{b})")

    graph = ";".join(chains + overlays)
    return inputs, graph, f"[v{stage}]"


def render(manifest: dict) -> Path:
    inputs, graph, last = build_filter(manifest)
    cmd = ["ffmpeg", "-v", "error", "-y",
           "-f", "lavfi", "-i", f"color=c=0x0f2233:s={CANVAS}:r={FPS}:d={DURATION}"]
    for path in inputs:
        cmd += ["-loop", "1", "-t", str(DURATION), "-i", path]
    cmd += ["-filter_complex", graph, "-map", last,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), str(DEMO_PATH)]
    print(f"  入力 {len(inputs)}枚 / フィルタ {len(graph)}文字")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg失敗: {(result.stderr or '')[-1500:]}")
    return DEMO_PATH


def main() -> int:
    print("パーツ切り出し:")
    manifest = extract_parts()
    print("レンダリング:")
    path = render(manifest)
    print(f"完了: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

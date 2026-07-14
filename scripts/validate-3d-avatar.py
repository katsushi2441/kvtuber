#!/usr/bin/env python3
"""Fail fast when Blender exits zero without producing a usable avatar."""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path


def read_glb_json(path: Path) -> dict:
    raw = path.read_bytes()
    if len(raw) < 20:
        raise ValueError("GLB is too small")
    magic, version, total = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67 or version != 2 or total != len(raw):
        raise ValueError("Invalid GLB header")
    chunk_length, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError("GLB JSON chunk is missing")
    return json.loads(raw[20 : 20 + chunk_length].decode("utf-8").rstrip("\0 "))


def png_size(path: Path) -> tuple[int, int]:
    raw = path.read_bytes()[:24]
    if len(raw) != 24 or raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Preview is not a PNG")
    return struct.unpack(">II", raw[16:24])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    model = args.output_dir / "kurage-3d-avatar.glb"
    preview = args.output_dir / "kurage-3d-avatar-preview.png"
    blend = args.output_dir / "kurage-3d-avatar.blend"
    manifest = args.output_dir / "manifest.json"
    for path in (model, preview, blend, manifest):
        if not path.is_file() or path.stat().st_size == 0:
            raise SystemExit(f"missing artifact: {path}")

    gltf = read_glb_json(model)
    target_names = {
        name
        for mesh in gltf.get("meshes", [])
        for name in mesh.get("extras", {}).get("targetNames", [])
    }
    required = {
        "Expressions_mouthOpen_max",
        "Expressions_eyeClosedL_max",
        "Expressions_eyeClosedR_max",
    }
    missing = sorted(required - target_names)
    if not gltf.get("skins"):
        raise SystemExit("avatar has no skin/armature")
    if missing:
        raise SystemExit(f"missing facial morphs: {', '.join(missing)}")

    width, height = png_size(preview)
    if (width, height) != (720, 960):
        raise SystemExit(f"unexpected preview size: {width}x{height}")

    print(
        json.dumps(
            {
                "ok": True,
                "modelBytes": model.stat().st_size,
                "meshes": len(gltf.get("meshes", [])),
                "skins": len(gltf.get("skins", [])),
                "facialMorphs": len(target_names),
                "preview": f"{width}x{height}",
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

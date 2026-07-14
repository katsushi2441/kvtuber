#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BLENDER=${BLENDER:-/home/kojima/work/kblender/tools/blender-4.2.0-linux-x64/blender}
OUTPUT_DIR=${OUTPUT_DIR:-$ROOT/outputs/simplified-kurage}

if [[ ! -x "$BLENDER" ]]; then
  echo "Blender executable not found: $BLENDER" >&2
  exit 1
fi

"$BLENDER" --background --factory-startup \
  --python "$ROOT/scripts/blender/build_simplified_kurage_animation.py" \
  -- --output-dir "$OUTPUT_DIR"

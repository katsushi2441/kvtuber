#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BLENDER=${BLENDER:-/home/kojima/work/kblender/tools/blender-4.2.0-linux-x64/blender}
OUTPUT_DIR=${1:-"$ROOT/public/avatar3d/generated"}

if [[ ! -x "$BLENDER" ]]; then
  echo "Blender executable not found: $BLENDER" >&2
  exit 1
fi
if [[ ! -e "$HOME/.config/blender/4.2/scripts/addons/mb-lab" ]]; then
  echo "MB-Lab is not configured. Run npm run avatar3d:setup first." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f \
  "$OUTPUT_DIR/kurage-3d-avatar.blend" \
  "$OUTPUT_DIR/kurage-3d-avatar.glb" \
  "$OUTPUT_DIR/kurage-3d-avatar-preview.png" \
  "$OUTPUT_DIR/manifest.json"

"$BLENDER" --background \
  --python "$ROOT/scripts/blender/build_kurage_3d_avatar.py" \
  -- --output-dir "$OUTPUT_DIR" --character f_an01

# Blender can return zero for Python exceptions, so artifacts and morphs are
# independently validated before this command reports success.
python3 "$ROOT/scripts/validate-3d-avatar.py" "$OUTPUT_DIR"

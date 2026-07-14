#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BLENDER_ROOT=${BLENDER_ROOT:-/home/kojima/work/kblender/tools/blender-4.2.0-linux-x64}
ADDONS_DIR=${BLENDER_ADDONS_DIR:-"$HOME/.config/blender/4.2/scripts/addons"}
HAMR_REF=${HAMR_REF:-94a7419885727cc3d03fcfab1d17c4aa1fadac47}
MBLAB_REF=${MBLAB_REF:-063bff04e60f3e7c651fda628c30f5d83f3f3078}

if [[ ! -x "$BLENDER_ROOT/blender" ]]; then
  echo "Blender 4.2 not found: $BLENDER_ROOT/blender" >&2
  exit 1
fi

mkdir -p "$ROOT/vendor" "$ADDONS_DIR"
if [[ ! -d "$ROOT/vendor/hamr/.git" ]]; then
  git clone https://github.com/hrabanazviking/Hamr.git "$ROOT/vendor/hamr"
fi
if [[ ! -d "$ROOT/vendor/mb-lab/.git" ]]; then
  git clone https://github.com/animate1978/MB-Lab.git "$ROOT/vendor/mb-lab"
fi

for repo in hamr mb-lab; do
  if [[ -n "$(git -C "$ROOT/vendor/$repo" status --short)" ]]; then
    echo "Refusing to overwrite local vendor changes: vendor/$repo" >&2
    exit 1
  fi
done
git -C "$ROOT/vendor/hamr" checkout --quiet --detach "$HAMR_REF"
git -C "$ROOT/vendor/mb-lab" checkout --quiet --detach "$MBLAB_REF"

ln -sfn "$ROOT/vendor/mb-lab" "$ADDONS_DIR/mb-lab"

echo "Blender: $BLENDER_ROOT/blender"
echo "MB-Lab: $ADDONS_DIR/mb-lab -> $ROOT/vendor/mb-lab"
echo "Hamr: $ROOT/vendor/hamr (evaluation/reference only)"

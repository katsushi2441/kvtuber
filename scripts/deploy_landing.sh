#!/usr/bin/env bash
# Deploy the bilingual static introduction to kvtuber.exbridge.jp.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
. /home/kojima/work/aixec/.env
set +a

remote="/web/kvtuber_exbridge_jp"
files=(
  index.html
  kvtuber.html
  styles.css
  assets/kurage-avatar.webp
  assets/ogp.png
)

for file in "${files[@]}"; do
  curl --fail --silent --show-error --ftp-create-dirs \
    -T "landing/${file}" \
    "ftp://${FTP_USER}:${FTP_PASS}@${FTP_HOST}${remote}/${file}"
  echo "deployed landing/${file}"
done

echo "-> https://kvtuber.exbridge.jp/"

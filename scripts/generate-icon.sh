#!/usr/bin/env bash
# Generate build/icon.png (1024x1024) and build/icon.icns from scripts/icon.html.
# Requires Chrome (renders the SVG) and macOS sips/iconutil for the .icns.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p build

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --screenshot="build/icon.png" \
  --window-size=1024,1024 --default-background-color=00000000 \
  --hide-scrollbars "file://$PWD/scripts/icon.html" 2>/dev/null

if [[ "$(uname)" == "Darwin" ]]; then
  rm -rf build/icon.iconset
  mkdir -p build/icon.iconset
  for size in 16 32 128 256 512; do
    sips -z $size $size build/icon.png --out "build/icon.iconset/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z $double $double build/icon.png --out "build/icon.iconset/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns build/icon.iconset -o build/icon.icns
  rm -rf build/icon.iconset
fi

echo "Generated: build/icon.png $(test -f build/icon.icns && echo 'and build/icon.icns')"

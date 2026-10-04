#!/bin/sh
# Builds the Chrome Web Store upload: only what the extension needs at runtime.
set -e
cd "$(dirname "$0")"
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
rm -f "dist/sizer-$version.zip"
zip -qr "dist/sizer-$version.zip" manifest.json icons brand/mark.svg src ui -x "*.DS_Store" "ui/_*"
echo "dist/sizer-$version.zip"

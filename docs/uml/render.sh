#!/bin/sh
# Render every Mermaid source in this folder to SVG and PNG.
# Uses the installed Chrome instead of downloading one.
set -e
cd "$(dirname "$0")"
export PUPPETEER_SKIP_DOWNLOAD=1
for f in ${1:-*.mmd}; do
  name="${f%.mmd}"
  npx -y @mermaid-js/mermaid-cli@11 -q -i "$f" -o "$name.svg" -p puppeteer.json -c config.json
  npx -y @mermaid-js/mermaid-cli@11 -q -i "$f" -o "$name.png" -p puppeteer.json -c config.json -s 2 -b white
  echo "rendered $name"
done

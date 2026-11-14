#!/bin/sh
# Render the one-page Municipal Readiness Report to PDF and a PNG preview.
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf="$PWD/municipal-readiness-report.pdf" "file://$PWD/readiness-report.html" 2>/dev/null
pdfinfo municipal-readiness-report.pdf | grep -E "Pages|Page size"
pdftoppm -png -r 110 -singlefile -f 1 -l 1 municipal-readiness-report.pdf preview

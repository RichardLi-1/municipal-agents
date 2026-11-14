#!/bin/sh
# Contact sheet of a render: one frame per bar, taken on its third beat, 7 across, read
# left to right (row 1 is bars 1-7, row 2 bars 8-14, ...).
# scripts/contact-sheet.sh <video.mp4> <sheet.jpg>
set -e
in="$1"; out="${2:-sheet.jpg}"
tmp=$(mktemp -d)
bar=1
while [ $bar -le 70 ]; do
  t=$(echo "0.576 + ($bar - 1) * 240 / 116 + 2 * 60 / 116" | bc -l)
  ffmpeg -v error -y -ss "$t" -i "$in" -frames:v 1 -vf scale=400:-1 "$tmp/$(printf %03d $bar).jpg"
  bar=$((bar + 1))
done
ffmpeg -v error -y -pattern_type glob -i "$tmp/*.jpg" -vf "tile=7x10:padding=4:color=gray" -frames:v 1 "$out"
rm -rf "$tmp"
echo "$out"

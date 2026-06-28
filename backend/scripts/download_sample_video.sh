#!/usr/bin/env bash
set -euo pipefail

OUTPUT_PATH="${1:-tmp/tracking/sample-people.mp4}"
SOURCE_URL="${FLORISIGHT_SAMPLE_VIDEO_URL:-https://filesamples.com/samples/video/mp4/sample_640x360.mp4}"

mkdir -p "$(dirname "$OUTPUT_PATH")"
curl -L "$SOURCE_URL" -o "$OUTPUT_PATH"
echo "Downloaded sample video to $OUTPUT_PATH"

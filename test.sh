#!/usr/bin/env bash

URL="${1:-rtmp://localhost/test}"

ffmpeg -re \
  -f lavfi -i "testsrc2=size=1920x1080:rate=30" \
  -f lavfi -i "sine=frequency=1000:sample_rate=44100" \
  -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
  -g 60 -b:v 2500k \
  -c:a aac -b:a 128k \
  -f flv "$URL"
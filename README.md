# Kurage AI VTuber (kvtuber)

AI VTuber runtime for scripted/autonomous talking avatars, broadcast viewers,
TTS, lip-sync, admin control, schedules, and YouTube Live workflows.

This repository contains reusable system code only. Production programs,
schedules, stream keys, generated audio, avatar assets, and deployment secrets
must stay outside Git.

## Features

- React/Vite AI VTuber viewer
- PNG avatar display and audio-driven lip sync
- admin console for programs, schedules, and comment interruption
- dedicated broadcast viewer URL: `/viewer?broadcast=1`
- local TTS proxy endpoint compatible with OpenAI-style speech calls
- YouTube Live RTMP helper using Chrome/Xvfb/ffmpeg
- storage-driven programs and schedules so genres/content can be added without
  changing runtime code

## Install

```bash
npm install
cp -r storage.sample storage
cp .env.sample .env
npm run dev -- --host 0.0.0.0 --port 18308
```

Open:

- admin/app: `http://localhost:18308/`
- broadcast viewer: `http://localhost:18308/viewer?broadcast=1`

## Data Boundary

Do not commit:

- `storage/`
- YouTube stream keys
- production program scripts
- generated audio/video
- private avatar assets unless their license allows redistribution
- `.env` files

`storage.sample/` documents the expected shape for programs, schedules, and
YouTube Live config.

## YouTube Live

The RTMP helper is configured through `storage/youtube-live.json` or the admin
API. Keep `streamKey` empty in committed files. The runtime launches a dedicated
Chrome profile and captures the fixed broadcast viewer into ffmpeg.

## Relationship to Kurage

`kvtuber` is the reusable AI avatar runtime. Application repositories can provide
brand-specific avatars, scripts, content packs, and deployment settings.

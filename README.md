# Kurage AI VTuber (kvtuber)

`kvtuber` is the product repository for a browser-based AI VTuber broadcast runtime. It provides scripted/autonomous talking avatars, broadcast viewers, TTS, lip-sync, admin control, schedules, and YouTube Live/RTMP workflows.

This repository root is the product itself. Local upstream/reference projects can live inside this folder while developing, but Git tracks only the reusable `kvtuber` system code.

## Structure

```text
kvtuber/
  src/              React/Vite viewer, admin console, hooks, and services
  scripts/          local TTS and YouTube Live/RTMP helper scripts
  public/           redistributable placeholder assets only
  storage.sample/   sample program/schedule/youtube-live data
  storage/          local production programs and stream settings, ignored by Git
  Open-LLM-VTuber/  optional local upstream checkout/reference, ignored by Git
  aituber-onair/    optional local upstream/reference checkout, ignored by Git
```


## Design Rule: White Studio

Do not use black or dark-mode backgrounds for kvtuber viewer, broadcast viewer, admin console, screenshots, or demo videos. Kurage should use a bright White Studio look: white/off-white backgrounds, pale aqua accents, readable dark text, and light subtitle cards. Avoid `background: #000`, dark navy full-screen panels, black translucent subtitle boxes, and cyberpunk-style dark gradients.

## Features

- React/Vite AI VTuber viewer
- PNG/SVG avatar display and audio-driven lip sync
- admin console for programs, schedules, and comment interruption
- dedicated broadcast viewer URL: `/viewer?broadcast=1`
- local TTS proxy endpoint compatible with OpenAI-style speech calls
- YouTube Live RTMP helper using Chrome/Xvfb/ffmpeg
- storage-driven programs and schedules so genres/content can be added without changing runtime code

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

## Reference Projects

`Open-LLM-VTuber/` and `aituber-onair/` are allowed as local reference or upstream checkouts, but they are not part of this repository history. Keep experiments, upstream working trees, downloaded models, private avatars, generated media, and production data outside Git.

`kvtuber` uses `@aituber-onair/core` as an npm dependency. The local `aituber-onair/` folder is only for reference or experimentation.

## Data Boundary

Do not commit:

- `storage/`
- `Open-LLM-VTuber/`
- `aituber-onair/`
- YouTube stream keys
- production program scripts
- generated audio/video/screenshots
- private avatar assets unless their license allows redistribution
- `.env` files

`storage.sample/` documents the expected shape for programs, schedules, and YouTube Live config.

## YouTube Live

The RTMP helper is configured through `storage/youtube-live.json` or the admin API. Keep `streamKey` empty in committed files. The runtime launches a dedicated Chrome profile and captures the fixed broadcast viewer into ffmpeg.

## Relationship to Kurage

`kvtuber` is the reusable AI avatar runtime. Application repositories can provide brand-specific avatars, scripts, content packs, and deployment settings.

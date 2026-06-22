# Kurage AI VTuber (kvtuber)

`kvtuber` is the product repository for a browser-based AI VTuber broadcast runtime. It provides scripted/autonomous talking avatars, broadcast viewers, TTS, lip-sync, admin control, schedules, and YouTube Live/RTMP workflows.

This repository root is the product itself. Local upstream/reference projects can live inside this folder while developing, but Git tracks only the reusable `kvtuber` system code.

## Positioning: Agent-Executing VTuber

Kurage AI VTuber is not only a talking avatar or a livestream character. It is designed as an **Agent-executing VTuber**: a character-facing interface that can receive natural-language work requests, hand them to `kdeck` as AI Agent Tasks, and return real deliverables such as published articles, generated videos, Kurage URLs, and Git commits.

Most AI VTuber projects focus on conversation, memory, voice, Live2D, chat reactions, or livestream entertainment. Most AI agent products focus on task execution through chat, IDEs, browsers, or workflow dashboards. Kurage AI VTuber connects those two worlds: the VTuber becomes the friendly operator for real AI work.

This makes `kvtuber` a world-first-class product concept: **a VTuber that can act as the front desk, narrator, and progress reporter for autonomous AI Agent work**. We do not claim that AI avatars, MCP tools, or autonomous agents are new by themselves. The distinctive claim is the integration:

```text
VTuber personality
  -> natural-language work request
  -> kdeck Agent Task execution
  -> real artifacts and URLs
  -> result report back inside the VTuber experience
```

The goal is to move VTubers beyond "AI characters that talk" and toward **AI characters that get work done**.

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
- Inochi2D-style layered Kurage rig prototype using canonical PNG layer cuts
- admin console for programs, schedules, and comment interruption
- normal viewer URL for regular viewing and interaction checks: `/viewer`
- dedicated broadcast viewer URL for OBS/YouTube capture: `/viewer?broadcast=1`
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

- admin: `http://localhost:18308/admin`
- studio app with settings: `http://localhost:18308/studio`
- normal viewer: `http://localhost:18308/viewer`
- broadcast viewer: `http://localhost:18308/viewer?broadcast=1`

Viewer roles:

- `/viewer` is the normal viewer. Use it for ordinary viewing, autonomous talking checks, and non-OBS interaction.
- `/viewer?broadcast=1` is the fixed broadcast viewer. Use it for OBS, Playwright/browser capture, RTMP, and YouTube Live.
- `/studio` is the operator-facing app with settings and manual chat controls.

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

Kurage Shorts live automation is disabled by default. YouTube Live still requires a supervised YouTube Studio page, so do not run unattended automatic live streams in production. Start the watcher only for supervised manual operation:

```bash
KURAGE_SHORTS_LIVE_ENABLED=1 \
YOUTUBE_STREAM_KEY="..." \
YOUTUBE_LIVE_URL="https://www.youtube.com/..." \
npm run youtube-live:shorts-watch -- start
```

Set either `YOUTUBE_LIVE_URL` for the exact broadcast URL or `YOUTUBE_CHANNEL_LIVE_URL` for the channel live page. When only the channel live page is configured, the watcher starts the RTMP stream and then uses `yt-dlp` to resolve the active `watch?v=...` URL before posting AIxSNS announcements. If the active watch URL cannot be confirmed, the watcher stops the stream and keeps the batch pending instead of marking it as successfully streamed. The watcher also refuses to start unless `KURAGE_SHORTS_LIVE_ENABLED=1` and the effective runtime config has a YouTube stream key. Set `KURAGE_SHORTS_REQUIRE_LIVE_URL=0` only for local tests where announcements do not matter.

When an announcement URL is available, the watcher posts a live announcement to AIxSNS after the RTMP stream starts. AgentReach is intentionally not used for X posting because its supported scope is internet/platform retrieval, not write actions such as posting, replying, or liking.

When live automation is explicitly enabled for supervised operation, production throttling prevents worker bursts from creating back-to-back live streams. The watcher turns pending videos into explicit reservations in `storage/kurage-shorts-live-watcher.json`, then starts each reserved batch only when its `scheduledFor` time arrives. Failed confirmations stay pending instead of being marked as streamed:

```bash
# Defaults: wait for at least 5 new shorts, reserve 5 at a time,
# leave 8 hours between streams, and cap automatic streams at 3 per day.
KURAGE_SHORTS_BATCH_SIZE=5
KURAGE_SHORTS_RESERVATION_BATCH_SIZE=5
KURAGE_SHORTS_MAX_BATCH_SIZE=10
KURAGE_SHORTS_LIVE_COOLDOWN_HOURS=8
KURAGE_SHORTS_MAX_STREAMS_PER_DAY=3
KURAGE_SHORTS_POLICY_TIME_ZONE="Asia/Tokyo"
```

If 10 to 20 videos are generated in a short worker burst, they are reserved as 5-video batches spaced by the cooldown window instead of triggering immediate consecutive live streams. The production cadence is three automatic live streams per day at roughly 8-hour intervals. Use `npm run youtube-live:shorts-watch -- status` to inspect the reservation list and next scheduled start.

To recover from a stopped live stream, requeue every short after the problem video and reserve the first recovered batch immediately:

```bash
npm run youtube-live:shorts-watch -- requeue-after 8b1d36f792634947
```

X announcement posting is disabled by default. Do not enable automatic X posting for production live streams; use manual X posting only when explicitly requested. If a one-off test is needed, set `KURAGE_SHORTS_ANNOUNCE_X=1` temporarily and verify the text before posting:

```bash
export TWITTER_AUTH_TOKEN="..."
export TWITTER_CT0="..."
twitter status
```

If `twitter-cli` is authenticated, the Kurage Shorts watcher also posts the YouTube Live URL to X. If authentication is missing or expired, the watcher falls back to `browser-use` and operates the already-authenticated Chrome profile at `/home/kojima/work/browser_agent/chrome-profile` without extracting cookies. If both methods fail, it logs the real reason and continues the YouTube Live plus AIxSNS flow without inventing a fake X result.

Browser-use fallback settings:

```bash
# Default: enabled.
KURAGE_SHORTS_X_BROWSER_USE=1

# Optional: connect to an already-running authenticated Chrome instead.
BROWSER_USE_CDP_URL="http://127.0.0.1:9223"

# Optional: show the browser through VNC/DISPLAY.
BROWSER_USE_X_HEADFUL=1
```

## YouTube Shorts Upload Automation

Use `scripts/watch-kurage-shorts-upload.mjs` for unattended normal YouTube Shorts uploads. This is separate from YouTube Live. It does not require YouTube Studio, OBS, RTMP, or a stream key.

The watcher selects existing Kurage videos in this order:

- only completed Kurage jobs with a real vertical short video, 180 seconds or less
- skip any job that already has `youtube_url` or `youtube_video_id`
- sort remaining videos by `views` descending, then by newest video file
- upload one video at a time as public YouTube Shorts
- after success, write `youtube_url`, `youtube_video_id`, and upload timestamps back to the Kurage job JSON
- after success, announce the upload to AIxSNS and, when enabled, X using the same concise text

Production cadence:

```bash
KURAGE_SHORTS_UPLOAD_COOLDOWN_HOURS=8
KURAGE_SHORTS_UPLOAD_MAX_PER_DAY=3
KURAGE_SHORTS_UPLOAD_TIME_ZONE="Asia/Tokyo"
KURAGE_SHORTS_UPLOAD_ANNOUNCE_AIXSNS=1
KURAGE_SHORTS_UPLOAD_ANNOUNCE_X=1
```

AIxSNS announcements must use `author: "kurage"` and keep the Kurage public URL (`https://kurage.exbridge.jp/kuragev.php?id=...`) in both `content` and `source_url`. X announcements use the same text. If `twitter-cli` is not authenticated, the watcher falls back to `browser-use` with the authenticated Chrome profile; X failures are logged but do not roll back or block the successful YouTube upload.

Run once:

```bash
npm run youtube-shorts:upload-watch -- run-once
```

Inspect status and the next candidate:

```bash
npm run youtube-shorts:upload-watch -- status
```

Run as a user service:

```bash
mkdir -p ~/.config/systemd/user
cp systemd/kvtuber-youtube-shorts-upload-watcher.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kvtuber-youtube-shorts-upload-watcher.service
```

Do not use the old live-stream watcher for unattended posting. The live watcher is for supervised YouTube Live only. The upload watcher is the production automation for posting high-view Kurage videos to YouTube Shorts.

## Relationship to Kurage

`kvtuber` is the reusable AI avatar runtime. Application repositories can provide brand-specific avatars, scripts, content packs, and deployment settings.

## Kurage Inochi2D Starter Kit

The canonical Kurage PNG avatar now has an Inochi2D-oriented starter layer kit in `public/avatar/inochi2d/`. It is not a finished `.inp` puppet yet; it is a layered source package for Inochi Creator plus a browser-side Inochi2D-style rig prototype used by the viewer.

Regenerate the layer kit after updating `public/avatar/kurage_avatar_*.png`:

```bash
python3 scripts/make-kurage-inochi2d-kit.py
```

Manual Inochi Creator work is still required for a real `.inp` puppet: mesh creation, deformation parameters, physics, and export.

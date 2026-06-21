# Local Setup Notes

This repository is intentionally data-light. Runtime data should be created from the sample files and customized locally.

```bash
npm install
cp -r storage.sample storage
cp .env.sample .env
```


## Design Rule: White Studio

Do not use black or dark-mode backgrounds for kvtuber viewer, broadcast viewer, admin console, screenshots, or demo videos. Kurage should use a bright White Studio look: white/off-white backgrounds, pale aqua accents, readable dark text, and light subtitle cards. Avoid `background: #000`, dark navy full-screen panels, black translucent subtitle boxes, and cyberpunk-style dark gradients.

Useful environment variables:

```env
KURAGE_ADMIN_TOKEN=change-me
KURAGE_TTS_PYTHON=python3
KURAGE_TTS_SCRIPT=scripts/kurage-edge-tts.py
KURAGE_TTS_VOICE=ja-JP-NanamiNeural
KURAGE_TTS_RATE=+10%
KURAGE_TTS_PITCH=-15Hz
KVTUBER_PORT=18308
KVTUBER_ALLOWED_HOSTS=
```

Production deployments should keep schedules, stream keys, private avatars, generated audio, and generated video outside Git.

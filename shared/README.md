# Kurage Avatar Shared Helper

`kurage_avatar_overlay.py` is the single Python helper for Kurage avatar video overlays.

- Canonical assets live in `public/avatar/lipsync/kurage_mouth_0..4.png`.
- Kurage HyperFrames videos import `build_hyperframes_vtuber_overlay()`.
- Kurage Voice Pro imports `build_ffmpeg_lipsync_overlay()`.
- Do not copy old avatar images or reimplement mouth/blink/motion logic in each product.
- No synthetic black blink bars. Add real face parts only when proper assets exist.

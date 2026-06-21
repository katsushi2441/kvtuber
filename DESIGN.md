# kvtuber Design Rules

## Non-Negotiable Rule: White Studio, Not Dark Mode

kvtuber viewer, broadcast viewer, admin console, demo videos, screenshots, and YouTube-facing visuals must not use black or dark-mode backgrounds.

This project represents Kurage as a product for business owners, seminars, YouTube, and public demos. The visual direction is a bright "White Studio" look:

- white / off-white / pale aqua backgrounds
- light cards with subtle blue borders
- clean business-friendly contrast
- coastal, polished, optimistic atmosphere
- readable subtitles in white translucent cards
- soft shadows, not black panels

## Forbidden

- `background: #000`
- black or near-black full-screen backgrounds
- dark navy studio screens
- black translucent subtitle boxes
- dark-mode admin UI
- black title overlays for video compositions
- "cool" cyberpunk or horror-like dark gradients

## Required For Broadcast Viewer

- `/viewer?broadcast=1` must be bright enough to look good on YouTube and OBS.
- The avatar should sit on a light stage, not in a black void.
- The speech/subtitle card should be white or pale aqua with dark ink text.
- The viewer must remain readable on laptop, mobile, and 1280x720 capture.

## Required For Admin

- Admin screens should feel like a clean control room for business users.
- Use bright surfaces and clear state badges.
- Avoid visual confusion caused by dark cards, dim text, or low-contrast controls.

## Why This Rule Exists

The project repeatedly produced black-background VTuber/demo screens. That is explicitly not acceptable for Kurage. The desired product impression is bright, trustworthy, and commercial, not dark-mode developer tooling.

# Kurage Avatar Canonical Assets

This directory is the single canonical source for the kvtuber Kurage PNG avatar.

Use only these files in kvtuber runtime code:

- `kurage_avatar_idle.png`
- `kurage_avatar_talk_open.png`
- `kurage_avatar_talk_wide.png`

Do not pick similarly named files from `kurage/`, `kuragevp/`, generated job folders, or reference OSS folders. Those copies may be old, generated, or misaligned.

The talk images must keep the mouth aligned with the closed-mouth position in `kurage_avatar_idle.png`. If the mouth is regenerated, update these canonical files and commit them so the latest avatar is not lost in ignored local files.

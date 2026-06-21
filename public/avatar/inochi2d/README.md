# Kurage Inochi2D Starter Kit

This directory contains the first Inochi2D-oriented layer kit for the canonical Kurage avatar.

It is intentionally a starter kit, not a finished `.inp` puppet. Inochi2D production normally needs manual rigging in Inochi Creator: mesh creation, parameters, deformation keys, physics, and export to `.inp`.

## Files

- `kurage_layers/00_shadow_reference_full.png`: full reference image for alignment.
- `kurage_layers/10_bell_body.png`: bell/body layer.
- `kurage_layers/20_inner_tentacles.png`: central tentacle group.
- `kurage_layers/30_left_tentacles.png`: left tentacle group.
- `kurage_layers/40_right_tentacles.png`: right tentacle group.
- `kurage_layers/50_mouth_closed.png`: closed-mouth expression layer.
- `kurage_layers/51_mouth_open.png`: open-mouth expression layer.
- `kurage_layers/52_mouth_wide.png`: wide-mouth expression layer.
- `kurage_layers/manifest.json`: layer roles and crop boxes.

All PNGs keep the same 1200x1200 canvas so they align when stacked.

## Inochi Creator Workflow

1. Open Inochi Creator.
2. Create a new puppet or import these PNGs as aligned layers.
3. Use `00_shadow_reference_full.png` only as an alignment/reference layer.
4. Mesh `10_bell_body.png` for breathing, squash, pitch, and yaw.
5. Mesh `20_inner_tentacles.png`, `30_left_tentacles.png`, and `40_right_tentacles.png` with delayed sway parameters.
6. Drive mouth parameters with `50_mouth_closed.png`, `51_mouth_open.png`, and `52_mouth_wide.png`.
7. Export the finished puppet as `.inp` when the manual rig looks good.

## Runtime Prototype

The current kvtuber runtime uses these layers directly in `AvatarPanel.tsx` as an Inochi2D-style browser rig. This gives Kurage a more lively layered motion before a real `.inp` renderer is integrated.

## Regeneration

Run this from the repository root after updating the canonical PNG avatar:

```bash
python3 scripts/make-kurage-inochi2d-kit.py
```

Do not generate Kurage avatar variants from random copied files. The canonical sources are in `public/avatar/`.

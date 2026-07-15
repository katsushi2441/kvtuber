# Anime Kurage VRM Motion Preview Assets

This directory is a browser proof for the real VRM + VRMA motion pipeline.
It uses a validation VRM base styled toward the anime Kurage-san shown in
`https://kurage.exbridge.jp/kuragev.php?id=4876ffe09f9a4119`.

Current v0 direction (colors fixed 2026-07-15 — silver hair, green eyes,
aqua-ivory dress, teal shoes, ivory tights; face paint and blue horns removed):

- Real VRM humanoid base, not Hunyuan GLB skinning.
- Real `.vrma` playback on VRM bones through `@pixiv/three-vrm-animation`.
- Silver/white hair, green eye impression, cyan futuristic outfit direction.
- Small orange hair clips inspired by the anime reference.

Files:

- `models/kurage-vrm-base.vrm`: VRoid Studio sample model copied from the local kblender asset pack (`AvatarSample_F.vrm`).
- `motions/*.vrma`: generated with `/home/kojima/work/kblender/scripts/generate_kurage_vrma_preview_motions.mjs` using `vendor/text-to-vrma/src/vrmaBuilder.js`.
- `concepts/ernie-kurage-outfit-a.png`: ERNIE-Image-Turbo reference for the clean aqua, ivory, and warm-gray outfit direction.
- `textures/` (2026-07-15 color pass, generated from the VRM's own textures by
  hue-masked recolor — see anime reference `kuragev.php?id=4876ffe09f9a4119`):
  - `kurage-outfit-ivory.png`: dress base, soft aqua-to-ivory vertical gradient
    (replaces the flat muddy-teal `kurage-outfit-ernie-a.png`, kept for reference).
  - `kurage-body-ivory.png`: body skin texture with the painted navy cyber-suit /
    tights recolored to ivory-white tights and gloves.
  - `kurage-face-clean.png`: face skin with the cyan cyber face-paint marks
    removed (filled with the surrounding skin tone).
  - `kurage-iris-green.png`: iris texture unified to the reference green
    (the original cyan iris fought the green multiply and split the eye colors).
  - `kurage-hair03-silver.png`: hair accessory sheet (horns/mesh) desaturated
    from blue to silver to match the silver hair.

Reference for the VRoid sample model pack:

- https://opengameart.org/content/vroid-studio-cc0-models
- https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use

Next step: bake the Anime Kurage appearance into a dedicated VRM/VRoid model
instead of relying on runtime styling.

# Anime Kurage VRM Motion Preview Assets

This directory is a browser proof for the real VRM + VRMA motion pipeline.
It uses a validation VRM base styled toward the anime Kurage-san shown in
`https://kurage.exbridge.jp/kuragev.php?id=4876ffe09f9a4119`.

Current v0 direction:

- Real VRM humanoid base, not Hunyuan GLB skinning.
- Real `.vrma` playback on VRM bones through `@pixiv/three-vrm-animation`.
- Silver/white hair, green eye impression, cyan futuristic outfit direction.
- Small orange hair clips inspired by the anime reference.

Files:

- `models/kurage-vrm-base.vrm`: VRoid Studio sample model copied from the local kblender asset pack (`AvatarSample_F.vrm`).
- `motions/*.vrma`: generated with `/home/kojima/work/kblender/scripts/generate_kurage_vrma_preview_motions.mjs` using `vendor/text-to-vrma/src/vrmaBuilder.js`.
- `concepts/ernie-kurage-outfit-a.png`: ERNIE-Image-Turbo reference for the clean aqua, ivory, and warm-gray outfit direction.
- `textures/kurage-outfit-ernie-a.png`: opaque VRM clothing texture using the ERNIE reference palette without the original black or emissive treatment.

Reference for the VRoid sample model pack:

- https://opengameart.org/content/vroid-studio-cc0-models
- https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use

Next step: bake the Anime Kurage appearance into a dedicated VRM/VRoid model
instead of relying on runtime styling.

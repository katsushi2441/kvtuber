# Kurage 3D Avatar Runtime Assets

Run `npm run avatar3d:build` to populate `generated/` with the GLB model,
Blender source, preview render, and manifest used by `/avatar3d-sample`.

The generated 3D model is derived from the MB-Lab database and must remain
AGPL-3.0 when distributed. MB-Lab explicitly allows rendered two-dimensional
images and videos, including commercial works, under a license selected by the
render's author. Generated files are intentionally excluded from this MIT
repository so the license boundary stays explicit.

Hamr is kept under `vendor/hamr` for evaluation only. Hamr 0.8.0 did not pass
the local production test with Blender 4.2 and VRM Add-on 4.4.0: its hair,
weight-paint, and VRM property APIs are incompatible. The verified build path
therefore uses MB-Lab directly through Blender Python.

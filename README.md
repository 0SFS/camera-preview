# Camera preview

Optional local mod/package in its own local Git repository for a live sensor preview in the Camera tab. Add **0SFS/camera-preview** from **Mods → This computer**, then choose it in the Camera tab's preview control. It runs only while that tab is visible. No GitHub repository has been created or published.

The airframe selects a camera model through `quad.cameraId`. Camera model mods own sensor dimensions, lens field of view and capture metadata; airframes own their motion and gimbal mounting. This preview reads the selected sensor through a host callback and has no camera-model, aircraft, renderer or JPEG dependency. An airframe variant can select another camera without changing this component.

For example, an airframe manifest selecting the existing Mini 2 camera declares both the camera dependency and its matching ID:

```json
{
  "dependencies": ["0SFS/DJI-Quadcopter", "0SFS/DJI-FC7303"],
  "quad": { "cameraId": "0sfs/dji-fc7303" }
}
```

This is a manifest fragment; the airframe retains its other required fields. A camera variant replaces the camera dependency and `cameraId` together with the desired camera model mod. The preview, capture pipeline and flight controller continue to use their shared implementations. Camera swaps do not imply identical mass, flight performance, gimbal limits or external geometry; each airframe variant declares those separately.

`createCameraPreview({ document, label, readFrame, maxFps?, attachInteraction? })` returns `{ element, setActive, destroy }`. `readFrame()` supplies `{ width, height, rgba }` with packed RGBA bytes and the first row at the top. The provider starts inactive, limits itself to 15 frames per second by default, serializes reads, ignores stale reads after hiding, and releases its canvas on destruction. Errors remain visible until retry or reactivation. The host deactivates hidden tabs and destroys/recreates the provider when changing sensor bindings.

The optional `attachInteraction(canvas)` port returns an initially inactive `{ setActive, destroy }` input binding. The provider forwards its own visibility and destruction to that binding. Fly supplies the same drag, two-finger swipe, wheel and pinch controls as the 360 image viewer; those gestures aim the gimbal within its limits. Zoom magnifies the preview only, preserving the lens field of view and resolution used by still capture. A replacement provider can attach this port to its own canvas without importing flight controls, a renderer or the 360 viewer's runtime.

A replacement preview mod declares `kind: "plugin"`, `execution: "js"`, `js: { "path": "preview.js" }`, and `cameraPreview: { "apiVersion": 1 }`. Its ES module exports `createCameraPreview` with the contract above. This uses the normal mod code confirmation rules; installing a manifest does not execute the preview. No camera or aircraft mod depends on this optional display component.

The canonical version 1 TypeScript contract is `@0sfs/mods/cameraPreview` (`mods/src/cameraPreview.ts`). This package reexports those types for convenience. Hosts import the loader's contract directly, so an absent or replaced preview provider is not a compile-time dependency.

Build the self-contained browser entry with the existing workspace toolchain:

```sh
cd ~/gh/0sfs/camera-preview && npm run build
```

`public/preview.js` is generated and ignored. Its shared help/icon UI is bundled; no imports are left for the mod host to resolve. The provider contains no WebGL capture path. The host's WebGPU sensor renderer supplies its pixels.

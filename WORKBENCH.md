# CS2 Panorama Workbench

## Setup

1. Install Node.js 20 or newer and Python 3.10 or newer.
2. Copy this folder to a writable project location.
3. Run `npm install` and `npm run dev`.
4. Add layouts below `panorama/layout/custom_game` and styles below `panorama/styles/custom_game`. The browser preview refreshes automatically.

The preview is a browser geometry approximation. Confirm final rendering in CS2.

Place layouts anywhere under `panorama/layout/custom_game` and styles anywhere under `panorama/styles/custom_game`. A workbench-rooted development endpoint scans both directories recursively on startup, window focus, and every two seconds, including uppercase file extensions and files added after Vite started. This remains correct even when Vite is launched from a different terminal directory. Production builds use the statically bundled files. The editor converts compiled includes such as `s2r://panorama/styles/custom_game/example.vcss_c` into the loose relative file `panorama/styles/custom_game/example.vcss`, including nested paths. When no include resolves, it checks the layout's same relative name under the default styles directory and uses that location as the Save target.

For browser rendering, the loader retries strict VXML parsing after escaping bare ampersands used by Source 2 event expressions. This compatibility pass does not rewrite the source file.

The header layout dropdown contains only parseable `<root>` documents with at least one editable `Panel`, `Label`, `Image`, or `Button` root. The File dropdown provides:

- **Save:** writes detected workspace layouts and matched styles back into the guarded `panorama/layout/custom_game` and `panorama/styles/custom_game` roots. Files opened from outside the workspace are retained as browser drafts; use Download ZIP to export them.
- **Open:** imports one local `.vxml` and an optional `.vcss` into the current editor session.
- **Download ZIP:** exports the current generated sources under `panorama/layout/custom_game` and `panorama/styles/custom_game` in a ready-to-extract ZIP.

The editor toolbar creates native `Panel`, `Label`, `Image`, and `Button` nodes. Select a node in the hierarchy or canvas to edit its ID, class, text/source, and cached Panorama VCSS properties. The property editor supplies a type-aware default and hint for each exposed property, adds `px` to unitless lengths, expands three-axis positions, normalizes Panorama colors to RGBA hex, clamps opacity, preserves unitless scale factors, and restricts known enumerations to supported values. New values normalize on blur and Apply; existing values normalize on blur. Imported panel attributes such as `hittest` are retained in generated output. The generated-source drawer updates instantly with VXML and VCSS suitable for copying into the engine project.

Undo and Redo are available in the editor header. Use `Ctrl+Z`/`Ctrl+Y` on Windows and Linux, or `Cmd+Z`/`Cmd+Shift+Z` on macOS. The workbench retains the latest 100 editing states and clears redo history after a new edit.

The workspace renders against selectable 1280×720, 1920×1080, 2560×1440, and 3440×1440 reference canvases. The supplied 1920×1080 `mnight.jpg` and `dust2.jpg` images are used as the dark and bright map wallpapers. Use the `Bright/Dark Map theme` button to switch them; the separate Map wallpaper checkbox can hide the image entirely. Select a component to see its viewport-relative X/Y position, width, height, right/bottom offsets, and percentage position. The yellow bounds and crosshair use the same logical coordinate system. The canvas maps Panorama `position`, `x`, `y`, `z`, `align`, `horizontal-align`, `vertical-align`, `flow-children`, `fit-children`, and `fill-parent-flow` semantics into a 1:1 logical reference frame; labels are block panels so authored dimensions are not lost to browser inline layout. Non-flowing authored frames layer children at their engine origin while flowing parents retain row/column layout. `Show all layers` temporarily reveals panels hidden by `opacity: 0` or `visibility: collapse`, so overlapping HUD states can be inspected together without changing generated VXML/VCSS. Clicking the same overlapping point repeatedly cycles through the component stack; the hierarchy remains a direct selector. These are exact browser-canvas measurements, but Panorama font metrics, UI scaling, materials, and engine composition can differ; compare a CS2 screenshot at the same resolution before calling the result pixel-perfect.

The browser preview adapter translates the cached VCSS effects it can represent safely: Panorama gradients, background images, transform origins (including `transform-origin-z`), `wash-color` tint overlays, blur/background blur, box and text shadows, saturation, hue rotation, brightness, contrast, transitions, visibility, compound class selectors, inline declarations, and layout flow. Source 2 sizing keywords are normalized to browser equivalents only in the preview; generated VXML/VCSS retains the authored Panorama values. Unsupported Source 2 resources or engine-only composition behavior remain labeled as preview approximations.

The development server binds both HTTP and HMR to `127.0.0.1:3000`, preventing the browser from guessing a different WebSocket address. If a corporate proxy or embedded browser blocks WebSockets entirely, run `npm run dev:no-hmr`; this disables the HMR client and removes its reconnect error while keeping the editor usable. Refresh the page manually in that mode. Override the endpoint with `PANORAMA_DEV_HOST` and `PANORAMA_DEV_PORT` when required.

## Local CS2 configuration

Edit `panorama.config.json` with Windows paths. `gameTargetDir` must be a dedicated custom directory under the Panorama tree. Leave `reloadCommand` empty unless you already have a verified reload command for your build.

Run `npm run sync:dry` first. If the printed paths are correct, run `npm run sync`. The command attempts a directory junction on Windows and falls back to file mirroring. Stop the watcher with Ctrl+C.

Run `launch-cs2-dev.bat` to start the configured executable with `-insecure -windowed -dev -panorama`. Development flags do not install a layout manifest or guarantee that the custom HUD is loaded; connect it through the manifest/injection approach used by your project.

## Validate and test

Run `npm run validate`. Errors identify malformed XML, browser-only APIs or CSS, duplicate IDs, and properties absent from the bundled cache. Warnings identify items that need build-specific verification.

In CS2, test reloads, reconnects, map changes, UI scale, 16:9 and ultrawide resolutions, rapid menu visibility toggles, and frame time during volatile HUD updates.

## Package

Set `vpkExe`, or the `VPK_EXE` environment variable, then run `npm run package:vpk`. The script stages the `panorama` directory and invokes Valve's packer. It writes `custom_hud.vpk` to `desktopOutputDir`, defaulting to the current user's Desktop.

VPK packing does not compile raw Source 2 resources. Compile asset types that require `resourcecompiler.exe` before packaging and preserve the paths expected by VXML/VCSS.

## Project integration points

Replace the two sample event names in `custom_hud_controller.js` with events verified by your project. Add panel mappings in `PanoramaSandbox.tsx` for custom panel types; unsupported Source 2 panels should remain labeled placeholders rather than fabricated browser equivalents.

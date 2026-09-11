# CS2 Panorama Workbench

## Setup

1. Install Node.js 20+ and Python 3.10+.
2. Copy this folder to a writable location.
3. Run `npm install` and `npm run dev`.
4. Use **Edit Work Path** to select the local directory containing editable Panorama assets.

The browser preview approximates Source 2. Confirm final geometry, fonts, materials, particles, and game-driven behavior in CS2 at the same resolution.

## Source workspace

The workbench keeps one path in `panorama.config.json`:

```json
{
  "nonCompiledDir": "D:/project/panorama",
  "desktopOutputDir": "C:/Users/YOU/Desktop",
  "cs2Exe": "",
  "vpkExe": "C:/.../game/bin/win64/vpk.exe",
  "reloadCommand": ""
}
```

`nonCompiledDir` is both the discovery root and the Save/Copy destination. The editor scans it every two seconds and on focus:

```text
nonCompiledDir/
├── layout/custom_game/**/*.vxml
├── styles/custom_game/**/*.vcss
└── scripts/custom_game/**/*.{js,vjs}
```

Nested directories and uppercase extensions are supported. A compiled include such as `s2r://panorama/styles/custom_game/example.vcss_c` resolves to the loose `styles/custom_game/example.vcss` file. The old edited-assets destination and synchronization action have been removed; Save writes directly to the configured source workspace through a development-only endpoint restricted to the two `custom_game` roots.

## Header

The full-width **Layout** menu searches valid discovered layouts. Clicking a layout name switches workspaces. Hover a layout row and use its `↗` insert icon to add that layout's complete component tree to the current workspace without switching files. Imported descendants remain nested, imported VCSS/keyframes are retained, and duplicate IDs receive collision-safe `_import` suffixes.

The VCSS info icon shows every matched stylesheet on hover/focus. **Edit Work Path** contains one free-text path input and a native **Browse** action. The equally sized **File** menu provides:

- **Save** — writes the current VXML and VCSS to the source workspace.
- **Copy Layout…** — saves a renamed copy while preserving nested relative paths and retargeting its VCSS include.
- **Open…** — imports one `.vxml` and optional `.vcss` as a browser draft.
- **Open Folder…** — selects a complete local Panorama source folder, persists it as `nonCompiledDir`, and refreshes discovery immediately. If the native folder picker is unavailable, the Edit Work Path dialog opens for manual entry.
- **Download ZIP** — exports the generated `panorama/layout/custom_game` and `panorama/styles/custom_game` structure.

## Editor

The toolbar creates `Panel`, `Label`, `Image`, and `Button` nodes. New nodes enter the nearest selected Panel; only Panels accept children. Drag hierarchy rows to reorder or move a complete subtree. The root Panel is fixed. Parent Panels are expanded by default and can be collapsed. The `⧉` icon beside ID duplicates the selected node and all descendants.

The canvas actions palette's **Game HUD components** library is populated from every valid layout currently discovered in the configured source workspace. Point **Edit Work Path** or **Open Folder…** at the Hudkit module's `.assets/workshop/panorama` directory to use its example layouts. Each card renders a compact preview of the real VXML/VCSS source; activating it inserts the complete parsed layout subtree and its styles/keyframes into the current workspace. The former 60 synthetic presets are not used.

The Hierarchy drawer is visible by default. Its header icon hides it; while hidden, the same icon appears immediately before **In-game reference** and restores it without changing canvas coordinates.

The Inspector is a floating, draggable island on the canvas, opens by default, and remains at most 300px wide. **Viewport location** is its first section and can be collapsed independently. Drag the Inspector header to reposition it or press `×` to close it; the Inspector icon in the actions palette restores it.

The VCSS picker exposes all 140 properties in `reference/panorama_css.json`. Property-family formatters add or preserve valid lengths, positions, colors, opacity, angles, durations, scales, enums, booleans, borders, shadows, transforms, resources, and transition syntax. Values normalize on blur or Apply. The palette's **Source code** icon opens a canvas panel containing editable VXML and VCSS; it is hidden by default and reparses valid changes immediately.

Undo/Redo retains 100 states and supports `Ctrl+Z`, `Ctrl+Y`, `Cmd+Z`, and `Cmd+Shift+Z`.

## Canvas

The canvas provides 1280×720, 1920×1080, 2560×1440, and 3440×1440 reference frames. The supplied `mnight.jpg` and `dust2.jpg` wallpapers switch with **Bright/Dark Map theme**. **Show dashed border** toggles editor-only `rgb(71 70 66 / 10%)` component boundaries. Label/Button text is shown at half inherited size; image URLs remain Inspector metadata.

Drag the canvas to pan. Hold Ctrl/Cmd while clicking to select; repeat modified clicks at one point to cycle overlapping components. A fancy draggable actions palette contains Add component, `+`, `−`, reset, Inspector, and Source code controls. Zoom adjusts the auto-fit view from −400 to +400 in 50-unit steps without altering source coordinates. Drag the palette by its grip without moving the canvas below it.

The preview maps common Panorama coordinates, alignment, flow, sizing keywords, gradients, resource backgrounds, transforms, wash color, blur, shadows, color filters, transitions, visibility, inline/compound selectors, and browser-representable `@keyframes`. **Show all layers** temporarily reveals hidden panels without modifying source. Exact Source 2 rendering remains an engine verification step.

## Commands

```bash
npm run dev
npm run dev:no-hmr
npm run build
npm run validate
npm run package:vpk
```

`package:vpk` invokes configured Valve `vpk.exe` against `nonCompiledDir` and copies `custom_hud.vpk` to `desktopOutputDir` (Desktop by default). VPK packaging does not compile raw Source 2 resources; run the appropriate Valve resource compiler first when an asset type requires it.

The development server defaults to `127.0.0.1:3000`. Override it with `PANORAMA_DEV_HOST` and `PANORAMA_DEV_PORT`. Use `dev:no-hmr` when an embedding proxy blocks WebSockets.

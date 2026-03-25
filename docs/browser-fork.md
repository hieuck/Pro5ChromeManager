# Pro5 Chromium Fork

This document tracks the browser-fork lane that will move Pro5 from a profile manager into a branded anti-detect browser product.

## Product Goal

Ship a dedicated Chromium-based browser that shows profile identity directly in browser chrome:

- profile name in the top bar / near the omnibox
- persistent profile color accent in browser chrome
- tighter multi-profile recognition than page-level overlays

The current product already covers:

- profile identity badge inside pages
- profile-prefixed tab/window title
- profile-aware New Tab page

The missing step is patching Chromium UI itself.

## Chromium Ground Truth

The official Chromium docs and source confirm that the relevant browser chrome lives in the browser window / toolbar / address bar stack:

- Windows build flow:
  [docs/windows_build_instructions.md](https://chromium.googlesource.com/chromium/src.git/%2Bshow/62.0.3202.58/docs/windows_build_instructions.md)
- Browser window design:
  [Browser Window](https://www.chromium.org/developers/design-documents/browser-window/)
- Toolbar design:
  [Toolbar](https://www.chromium.org/user-experience/toolbar/)
- Current BrowserView source:
  [browser_view.cc](https://chromium.googlesource.com/chromium/src/%2B/main/chrome/browser/ui/views/frame/browser_view.cc)

Inference from those sources:

- Pro5 profile chrome should be implemented in the Views-based desktop browser stack, not in extensions.
- The patch will likely touch `BrowserView`, `ToolbarView`, and the non-client frame/titlebar path.
- Replacing the omnibox-adjacent identity area requires Chromium source edits, not CDP or extension APIs.

## Patch Plan

### Phase 1: Branded Surface

- Add a compact profile chip in browser chrome.
- Pull profile name and accent color from launch-time profile metadata.
- Keep omnibox editing behavior unchanged.

### Phase 2: Integrated Identity

- Move profile identity closer to the location bar.
- Add profile color strip / chip in titlebar or toolbar.
- Keep layout resilient on narrow widths.

### Phase 3: Productized Runtime

- Produce a Pro5 Chromium runtime artifact.
- Register it as a first-class runtime in Pro5.
- Package and smoke-test it in the desktop release lane.

## Local Workspace

The repo now includes a browser-fork scaffold:

- `npm run browser-fork:doctor`
  Checks Windows, Node, Git, Python, Visual Studio C++ tooling, and disk headroom.
- `npm run browser-fork:bootstrap`
  Creates the local fork workspace under `.browser-fork/`.
- `npm run browser-fork:gn`
  Generates `args.gn` for `out/Pro5`.
- `npm run browser-core:package -- --input <runtime-dir> --executable <relative-exe>`
  Wraps a built runtime folder into a Pro5 browser-core package that can be imported from the app.

Generated workspace layout:

```text
.browser-fork/
  bootstrap-status.json
  doctor-report.json
  chromium/
    src/
      out/
        Pro5/
          args.gn
  patches/
```

## Recommended Windows Flow

1. Run `npm run browser-fork:doctor`.
2. Fix any failed prerequisites.
3. Run `npm run browser-fork:bootstrap`.
4. Install `depot_tools`.
5. Fetch and sync Chromium into `.browser-fork/chromium/src`.
6. Run `npm run browser-fork:gn`.
7. Patch browser chrome.
8. Build `chrome` from `out/Pro5`.
9. Run `npm run browser-core:package -- --input <built-runtime-dir> --executable <relative-exe>`.
10. Import the generated `.zip` from `Settings -> Browser Cores`.

## Browser Core Package Format

The app-level Browser Core Manager expects a `.zip` archive containing:

- `browser-core.json`
- `runtime/` directory with the browser files

Minimal manifest example:

```json
{
  "key": "pro5-chromium",
  "label": "Pro5 Chromium",
  "version": "127.0.0-preview",
  "executableRelativePath": "chrome-win/chrome.exe",
  "channel": "preview",
  "platform": "win32"
}
```

The packaging script creates exactly that format and places your built browser tree under `runtime/`.

## Non-Goals For This Repo Phase

These are intentionally not done yet:

- full Chromium checkout committed into this repo
- patched browser UI source code
- automated Chromium CI build farm
- CRX / Web Store extension syncing inside the forked browser

Those belong to the next implementation milestone after workspace bootstrap and patch targeting.

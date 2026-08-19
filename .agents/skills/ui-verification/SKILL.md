---
name: ui-verification
description: Use when implementing or reviewing any user-visible rendered UI or interaction change that requires current desktop/mobile screenshots, recordings, or visual evidence.
---

# UI Verification

`CONTRIBUTING.md` under **Visual Evidence** is the evidence contract. This skill
owns the agent workflow for satisfying it.

## Required Evidence Loop

After the final UI-affecting edit:

1. Add or select a deterministic visual fixture scenario that renders the real
   production components in the exact changed state. Fixture data may stub any
   boundary, but the UI under review must not be copied or reimplemented.
2. Run `bun run ui:evidence -- --label after-<change> --scenario <scenario>`
   from the repository root.
   The command builds a cached disposable Docker image without host mounts or
   inherited credentials, starts only a Vite fixture server, then uses
   Playwright to capture desktop at 1440x900 and hosted-mobile at 390x844. It
   does not start OpenChamber, OpenCode, or a model request. Only screenshots
   and the manifest are copied back.
3. Read both generated images and verify that the changed behavior is visible,
   correctly framed, and free of accidental private data.
4. Include both images in the final response using the Markdown paths printed
   by the command. Refresh them after every later edit that can affect the
   demonstrated state.

Capture a meaningful before state when one exists. Styling and surface changes
need both light and dark runs. Motion, focus, gestures, drag-and-drop, and
multi-step behavior need a short recording in addition to representative stills.

Completion means the final response contains inspected, current evidence for
every affected desktop and mobile state, not merely paths to files that were
created.

## Fixture Scenarios

Scenarios live under `packages/web/src/visual-fixtures/` and are served through
the development-only `packages/web/visual-fixture.html`. Keep them declarative,
fixed, and free of credentials. Use SDK-shaped records and production providers
to make loading, response, tool, error, permission, dialog, and other states
cheap to reproduce. Mark readiness only after lazy content has rendered.

Require the changed element so capture fails instead of proving the wrong state:

```sh
bun run ui:evidence -- \
  --label after-change \
  --scenario changed-state \
  --selector '[data-testid="changed-control"]'
```

Use `--setup-script <path>` only for interaction state layered on a reusable
fixture. The file is an async browser function body and receives `surface` plus
`viewport`. Stable product states belong in the scenario registry rather than
temporary scripts.

The Docker workflow rejects host URLs and headed mode. An already-isolated
environment may attach the internal runner to a fixture Vite server:

```sh
bun run ui:evidence:local -- \
  --label after-change \
  --scenario changed-state \
  --url http://127.0.0.1:5180
```

This local escape hatch is for fixture development, not a developer's normal
OpenChamber/OpenCode state. Use `--theme dark` for dark evidence.
Run `bun run ui:evidence -- --help` for the complete command contract.

## Mobile Boundary

Capacitor packages the same shared React components exercised at the hosted
mobile fixture size, so this is the required responsive-layout proof for shared
UI.
When a change depends on the native shell, WKWebView, safe areas, keyboard,
touch gestures, lifecycle, secure storage, deep links, push, or native-only
connection UI, also load `serve-sim` and capture the real iOS Simulator. Label
browser mobile and native simulator artifacts accurately.

## Evidence Safety

- Use descriptive labels such as `after-settings-search`, not `page`.
- Keep evidence under `.openchamber/screenshots/`, the existing project-local
  screenshot directory.
- Exclude secrets, tokens, credentials, private prompts, and unrelated project
  data from screenshots, setup scripts, output, and manifests.
- If a user-visible state truly cannot be captured, report the precise blocker;
  a successful type-check or build is not visual evidence.

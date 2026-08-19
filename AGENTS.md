# OpenChamber Agent Guide

## Purpose

OpenChamber provides shared web, desktop, VS Code, hosted-mobile, and native-mobile UI surfaces for OpenCode.

This checkout is a **fork** of `openchamber/openchamber`. Upstream `main` is already tested and reviewed; this fork adds local customization on top of it. Optimize for a small, rebase-friendly delta and a fast edit loop, not for upstream contribution ceremony.

## Fork Mode

- `origin` is the fork. `upstream` is `https://github.com/openchamber/openchamber.git`.
- Treat upstream code as trusted and already validated. Validate the local delta, not the baseline. Never re-verify untouched packages.
- Keep the local diff minimal and localized. Do not reformat, restructure, or opportunistically clean upstream files; every unrelated touched line becomes a rebase conflict on the next sync.
- Work on `main` and push there unless asked otherwise.
- Skip CHANGELOG entries, PR-template handoff, and the upstream contribution workflow. If a change is intended for upstream, say so and that ceremony applies again to that change.

## Runtime Boundaries

- `packages/ui`: shared React UI, state, sync, and runtime contracts.
- `packages/web`: web surfaces, OpenChamber server, managed/external OpenCode lifecycle, and CLI.
- `packages/electron`: native desktop shell and privileged Electron boundary.
- `packages/vscode`: extension host, webview, and runtime bridge.
- `packages/mobile`: Capacitor iOS/Android shell; bundles the mobile web surface and connects to an existing OpenChamber server.
- `packages/docs`: product documentation; not a Bun workspace.

Shared UI calls official OpenCode APIs through `@opencode-ai/sdk/v2`. OpenChamber-owned capabilities use `RuntimeAPIs`, `runtimeFetch`, and shared browser/realtime transport helpers. Server-side upstream integrations may use their owning runtime modules.

Electron starts the OpenChamber backend in-process, never as a sidecar. Development may load loopback/HMR UI; packaged builds load staged assets through `openchamber-ui://` while the loopback server remains the API backend. Keep domain backends in web/runtime modules unless behavior is inherently native.

Shared contracts must define intentional behavior for every applicable runtime: web, desktop, VS Code, hosted mobile, and Capacitor mobile.

## Always-On Constraints

- Do not modify `../opencode`; it is a separate repository.
- Do not run git or GitHub commands unless the user explicitly asks.
- Do not add dependencies unless explicitly requested.
- Never add or log secrets, bearer tokens, pairing credentials, or sensitive user data.
- Keep changes minimal and preserve unrelated worktree changes.
- Enforce security and correctness in core/runtime logic, not only UI visibility or prompts.
- Keep entrypoints and bridges thin; place domain logic in focused owning modules.

## Correctness Invariants

These are the failures that actually bite in this codebase. They apply to fork code too.

- Prefer authoritative state over heuristics.
- Derive live activity from live channels, not persisted history.
- Scope temporary fallbacks narrowly and clear them when authoritative state arrives.
- Never let fetch failure masquerade as authoritative empty success.
- Make partial results, rollback, cleanup, and stale-data behavior explicit.
- One failed entity must not erase or block unrelated complete entities.
- Runtime-specific differences must be intentional and visible in code.

## Validation

Scope checks to what the diff touches. Full-workspace sweeps exist but are rarely the right default.

| Touched | Run |
| --- | --- |
| `packages/ui` source | `bun run type-check:ui`, `bun run lint:ui`, `bun run --cwd packages/ui test` |
| `packages/web` source | `bun run type-check:web`, `bun run lint:web`, `bun run --cwd packages/web test` |
| `packages/electron` / `packages/vscode` / `packages/mobile` | the matching `type-check:*` / `lint:*` and package test script |
| Root scripts (`scripts/*.mjs`) | `node --test <file>` and `bunx oxlint <changed-paths>` |
| Shared contract consumed by several packages | `bun run type-check` (all), plus tests for the real consumers |
| Docs, config, or comments only | Nothing, or the narrowest syntax/schema check |

Measured full-sweep costs, for when a broad check is genuinely warranted: `type-check` ~51s, `lint` ~17s, `test` ~33s. Cheap enough to run before a push you are unsure about; still not a reason to run them for a one-file edit.

Optional, not required: `bun run dead-code`, `bun run docs:validate`, and `bun run ui:evidence`. Reach for them when the change plausibly breaks what they check, or when asked.

Report exactly what was and was not validated. Static checks alone do not prove runtime, relay, performance, or platform correctness.

## Reference Material

Read these when you need them, not as a precondition for editing. Skip them when the change is small, local, and you can already see the pattern in nearby code.

Detailed subsystem workflows live in `.agents/skills/*/SKILL.md`. Load one when you are about to change that subsystem and the local precedent is not obvious:

| Subsystem | Skill |
| --- | --- |
| Change scope, abstraction, validation risk | `openchamber-change-discipline` |
| Session sync, bootstrap/reconnect, reducers, optimistic state, reconciliation | `sync-state-invariants` |
| Shared UI data access, OpenCode SDK, `RuntimeAPIs`, runtime auth/URLs, bridges | `ui-api-decoupling` |
| WebSocket, SSE, streaming transport, private relay | `relay-transport` |
| Electron main/preload, IPC, updater, packaging, child processes | `desktop-shell` |
| Render/store/event hot paths, large lists, caches, reported lag | `performance-engineering` |
| UI components, styling, colors, buttons, icons | `theme-system` |
| User-facing UI text, labels, aria, toasts, dialogs | `locale-ui-patterns` |
| Settings UI, dialogs, configuration surfaces, settings search | `settings-ui-patterns` |
| Sortable / drag-to-reorder, `@dnd-kit`, touch and wrapping layouts | `drag-to-reorder` |
| CLI commands, prompts, terminal output, `--quiet` / `--json` | `clack-cli-patterns` |
| iOS Simulator build, launch, preview, `serve-sim` | `serve-sim` |
| Screenshots or visual proof, when asked for them | `ui-verification` |

Module docs: search for the nearest `packages/**/DOCUMENTATION.md` when changing a subsystem whose invariants are not visible in the code you are reading. High-value anchors: `packages/ui/src/sync/DOCUMENTATION.md`, `packages/ui/src/stores/DOCUMENTATION.md`, `packages/web/bin/lib/DOCUMENTATION.md`, `packages/vscode/src/DOCUMENTATION.md`, `packages/electron/README.md`, `packages/mobile/README.md`.

Update a doc only when your change makes something it states untrue.

# Fork Change Registry

This fork of [`openchamber/openchamber`](https://github.com/openchamber/openchamber)
carries local customization on top of a tested upstream. This file records the
**intent** behind each local change, so a rebase conflict can be resolved by
re-applying the intent rather than by reading the diff and guessing.

Update this file in the same commit as the change it describes.

## How to use this during an upstream sync

```sh
git fetch upstream
git rebase upstream/main
```

For each conflict, find the entry below that owns the conflicting file. Resolve
toward the **intent**, not the old diff: if upstream restructured the code, the
intent usually still applies but the mechanics change. If upstream deleted the
code an entry depends on, the entry is obsolete — delete it from this file
rather than resurrecting the code.

`AGENTS.md` and `.agents/skills/**` are upstream-owned but heavily rewritten
here; expect conflicts and prefer this fork's version unless upstream added
something new and substantive.

---

## 1. Fork-mode agent protocol

**Intent.** Upstream's agent protocol is built for contributing changes back:
mandatory skill pre-reads, PR handoff, changelog entries, workspace-wide
validation sweeps. On a fork that ships from this checkout, that ceremony costs
time without buying safety. Validate the local delta, not the already-tested
baseline.

**Shape.** `AGENTS.md` (symlinked as `CLAUDE.md`) gained a Fork Mode section and
lost the mandatory pre-read, the PR handoff, and the workspace-wide default
validation, which became a per-package table. `ui-verification` captures
screenshots on request rather than after every UI edit;
`openchamber-change-discipline` keeps only risk-specific validation extras;
`changelog-authoring` applies only to changes headed upstream.

**Files.** `AGENTS.md`, `.agents/skills/ui-verification/SKILL.md`,
`.agents/skills/openchamber-change-discipline/SKILL.md`,
`.agents/skills/changelog-authoring/SKILL.md`.

**On conflict.** Keep the fork's version. Re-apply the trim to any new upstream
section that adds contribution ceremony. Correctness invariants, structural
discipline, and test design are unmodified — take upstream's improvements there
verbatim.

---

## 2. UI evidence capture workflow

**Intent.** Verify user-visible changes with real screenshots of real
components, without a server, credentials, or a model request.

**Shape.** Additive. `scripts/ui-evidence.mjs` drives Playwright against a Vite
fixture server; `scripts/ui-evidence-docker.mjs` runs the same capture in a
disposable container with no host mounts. `packages/web/visual-fixture.html` and
`packages/web/src/visual-fixture-main.tsx` host a scenario registry in
`packages/web/src/visual-fixtures/`. Output lands in `.openchamber/screenshots/`
(gitignored, excluded from the Docker build context).

**Local extensions beyond the original workflow:**
- `--theme-id <id>` pins a named theme preset (e.g. `nord-dark`) by seeding
  `lightThemeId` / `darkThemeId`, so evidence can be captured in the theme
  actually being reviewed.
- `--selector` waits on `.first()`, so a selector that legitimately matches
  several rows does not trip Playwright strict mode.
- Scenarios declare `chrome` and `readySelector`. Chrome-less scenarios render a
  product surface that owns its own width and background instead of the
  captioned card, which would misframe the spacing under review.
- The fixture `SyncProvider` uses a fixed `FIXTURE_DIRECTORY`; unscoped sync
  hooks resolve the provider's directory and throw on an empty one.

**Files.** `scripts/ui-evidence*.mjs`, `scripts/ui-evidence.Dockerfile`,
`packages/web/visual-fixture.html`, `packages/web/src/visual-fixture-main.tsx`,
`packages/web/src/visual-fixtures/**`, `package.json` (`ui:evidence*` scripts,
`playwright` devDependency), `knip.json`, `.dockerignore`, `.gitignore`,
`.agents/skills/ui-verification/SKILL.md`.

**On conflict.** Almost entirely new files — conflicts should be limited to
`package.json`, `knip.json`, and the ignore files. Keep both sides' entries.

---

## 3. Self-update removed from the app

**Intent.** Self-update has little value on a fork built and installed from this
checkout, and the update check reported install id, device class, and platform
to an upstream endpoint on a timer.

**Shape.** Removal across every runtime:
- **ui**: `useUpdateStore`, `useUpdatePolling`, `UpdateDialog`,
  `MobileAppUpdateToast`, and the update affordances in About, the sidebar
  footer, the mobile sessions sheet, the Header remote-instance panel, the
  native "Check for Updates" menu action, and the `view/update` deep link.
- **web**: the `openchamber update` CLI command, `server/lib/package-manager.js`,
  and the `update-check` / `update-install` routes.
- **electron**: the `electron-updater` dependency, `updater-*.mjs`,
  `setupAutoUpdater`, the download/install IPC handlers, and the
  `installingUpdate` quit path. `desktop_restart` is now a plain relaunch.
- **vscode**: the `api:openchamber:update-check` bridge handler, its webview
  route, and the install-id generation feeding it.
- 36 update i18n keys across all 11 locales.

Also removed the **"Send anonymous usage reports" setting**: its only consumer
was the update check's telemetry payload, so it no longer controlled anything,
and a privacy toggle that does nothing is worse than none.

**Deliberately kept.** Release-side updater plumbing —
`packages/electron/scripts/finalize-latest-yml.mjs`,
`verify-update-manifest.mjs`, `updater-e2e-fixture.mjs`, the electron-builder
`publish` block, and the CI steps calling `test:updater`. It now produces update
feeds nothing consumes; pruning it means editing CI, which is a wider blast
radius. **OpenCode** update handling (`OpenCodeUpdateToast`, upgrade routes) is
a different feature and is untouched.

**Files.** 85 files; the load-bearing ones are `packages/electron/main.mjs`,
`packages/ui/src/components/layout/Header.tsx`,
`packages/ui/src/components/session/SessionSidebar.tsx`,
`packages/ui/src/lib/desktop.ts`, `packages/web/bin/cli.js`,
`packages/web/server/lib/opencode/openchamber-routes.js`, and all 22 locale
files.

**On conflict.** Locale files conflict on every upstream sync but resolve
mechanically: upstream adds keys, this fork deleted a disjoint set — keep both
operations. If upstream adds a *new* update-related key or surface, delete it
rather than merging it. `packages/electron/package.json` must not regain
`electron-updater`, and `bun.lock` must be regenerated (`bun install`) whenever
that manifest changes, or CI's `--frozen-lockfile` install fails.

---

## 4. Projects panel zone separation and worktree nesting

**Intent.** The sidebar read as one undifferentiated list: nothing marked where
one project's sessions ended and the next began, and worktree sub-groups sat at
the same indentation as the project that owns them, so nesting was invisible.

**Shape.**
- A hairline rule above each project zone after the first, and one closing the
  recent zone. Inset to the header's own content edge (`pl-4 pr-3.5` inside the
  full-bleed band) rather than full width — a full-bleed rule reads as a table
  row divider instead of a zone break. Colored `bg-border/60`
  (`--interactive-border`); `--surface-subtle` is too close to the sidebar
  background to register.
- The recent separator lives in `SidebarActivitySections` rather than on the
  first project, so it exists only when the recent zone actually renders.
- Every divider clears 12px above and below, measured from the adjacent row or
  header box. That spacing is assembled from parts that do not naturally agree:
  the scroller's `space-y-1.5` between project items, the group body's `pb-2`,
  the zone header's `py-1`, and the recent wrapper's own bottom padding. The
  project separator therefore carries `-mt-1.5 pb-2` (cancelling the inherited
  6px gap and re-adding it below the line), and the recent wrapper drops to
  `pb-0.5`. Left alone, the first project sat 18px below its divider while the
  rest sat 8px.
- Worktree and archived sub-groups render inside a `pl-5` block, so the
  sub-header and its sessions indent together under the project. The 20px step
  is derived, not chosen by eye: the project header icon starts at 16px and the
  project's own session rows start at 36px, so 16 + 20 lands the worktree's icon
  exactly on the project's session text, and the worktree's own sessions step in
  one further to 56px. A smaller step leaves the sub-header floating between
  levels. Re-measure these numbers if upstream changes the header's `pl-4`, the
  scroller's `pl-2.5`, or the session row's `pl-[26px]`.

**Files.** `packages/ui/src/components/session/sidebar/SidebarProjectsList.tsx`,
`SidebarActivitySections.tsx`, `sortableItems.tsx` (new `showTopSeparator`
prop). Fixture: `packages/web/src/visual-fixtures/sidebarProjectsFixture.tsx`.

**On conflict.** All three edits are small and local. If upstream restructures
the zone rendering, re-apply the intent: one inset hairline per zone boundary,
and one indentation step for groups that carry their own sub-header.

---

## 5. Git diff cache invalidates on content, not just status letters

**Intent.** The Git and Diff views served pre-edit diffs after an agent changed
a file. `useGitStore`'s per-file `diffCache` returns entries with no validation,
and its only content-accurate invalidation came from a `gitRefreshHint` emitted
by `ToolPart.tsx` — a chat component that must be mounted *while the tool runs*
(`observedActiveGitToolRef` is initialised to `!isFinalized`). Edit while the
Git or Files tab is open and no hint is ever emitted. The fallback compares git
status metadata only, so an edit that keeps the same status letters and the same
+/- counts — rewriting a line inside an existing modification — is invisible and
the stale diff survives.

**Shape.** Make the invalidation authoritative instead of adding another
heuristic. `getStatus` now stats each changed file and returns `mtimeMs`/`size`
alongside the status letters; `hasStatusChanged` and `getChangedFilePaths`
compare them. The status poll the client already runs now evicts stale diffs on
its own, with no extra requests and no dependency on what the chat UI rendered.

Both comparisons only act when *both* sides report `mtimeMs`, so a server that
omits it falls back to today's behaviour. Server-side stat cost is ~0.2ms for
five changed files against a `getStatus` that already takes ~150ms.

**Files.** `packages/web/server/lib/git/service.js` (`getStatus`),
`packages/ui/src/lib/api/types.ts` (`GitStatusFile`),
`packages/ui/src/stores/useGitStore.ts` (both comparison helpers),
`packages/ui/src/stores/useGitStore.test.ts`.

**Considered and rejected.** Removing the diff cache outright: ~53 references in
`useGitStore` plus five consumers, and deleting code upstream actively develops
turns every upstream change into a conflict with no context. Bypassing the cache
at the read path was comparable in size but required surgery in `DiffView`'s
fetch effect, which writes unstaged results only into the store — higher
regression risk for the same outcome.

**On conflict.** Both helpers are small and self-contained; re-apply the intent
(compare working-tree mtime/size, not just letters and counts). If upstream adds
its own file-watch channel or content hash to status, prefer that and delete
this entry. The cache exists for hosted-mobile and relay clients
(`MobileChangesSurface.tsx`), not for local use — it is not worth keeping for
its own sake if upstream reworks it.

---

## 6. Installable Android APK on every push

**Intent.** Every pushed revision should produce an installable Android APK as
a workflow artifact without also spending macOS runner time on iOS. Consecutive
artifacts must be valid Android upgrades rather than independently signed debug
builds.

**Shape.** The mobile smoke workflow runs on every push, builds only
`assembleRelease`, signs it with the same repository secrets as the mobile
release workflow, and uses `github.run_number` as the Android version code. It
uploads the release APK as a run artifact and keeps the iOS simulator job
manual-only. Gradle dependency caching limits the per-push cost. Successful
default-branch builds also replace the APK and version manifest on the fixed
`android-latest` prerelease, providing a stable anonymous download URL. Rolling
publication has its own cancelling concurrency group so an older build cannot
overwrite a newer APK; per-run artifact builds remain uncancelled.

**Files.** `.github/workflows/mobile-ci.yml`.

**On conflict.** Preserve an APK-only signed push build with a monotonically
increasing version code. Do not add AAB or automatic iOS builds to this workflow.
Only the default branch may update the rolling `android-latest` prerelease.

---

## 7. Android update check against this fork's rolling release

**Intent.** Entry 6 publishes a signed APK to the `android-latest` release on
every push. The installed app should offer that build rather than upstream's
releases, which it no longer has any way to check (entry 3 removed the whole
update system).

**Shape.** `packages/ui/src/lib/forkAndroidUpdate.ts` fetches
`android-latest.json` from the rolling release, compares its `versionCode`
against the installed build, and returns `available` / `up-to-date` / `unknown`.
`ForkAndroidUpdateToast` shows a dismissible toast offering the APK, opened in
the system browser through the existing `openExternalUrl`. Nothing self-installs
— the user completes the sideload.

Details that are not obvious and are easy to break:
- **The compare is authoritative, not a heuristic.** The manifest's
  `versionCode` is `github.run_number`, and `packages/mobile/android/app/build.gradle`
  builds the APK from the same `OPENCHAMBER_ANDROID_VERSION_CODE`. If either
  side stops using the run number, the compare breaks silently.
- **CapacitorHttp, not `fetch`.** GitHub serves release assets with no
  `Access-Control-Allow-Origin`, so the WebView's own fetch is blocked by CORS.
  The native HTTP client is the only reason this works on-device. It also hands
  back a string body for GitHub's `application/octet-stream`, so the JSON is
  parsed defensively.
- **`apkUrl` host allowlist.** The manifest decides where the user is sent, so
  only GitHub's release-asset hosts over https are accepted.
- **`unknown` is distinct from `up-to-date`.** A failed fetch must never render
  as "you are current"; it shows nothing.
- Gated to `getClientPlatform() === 'android'`: a browser on Android is not
  running the APK and has nothing to update.

Reuses the `mobileUpdate.toast.*` i18n keys that entry 3 left in place across
all 11 locales, so no new strings were needed.

**Files.** `packages/ui/src/lib/forkAndroidUpdate.ts` (+ test),
`packages/ui/src/components/update/ForkAndroidUpdateToast.tsx`,
`packages/ui/src/apps/MobileApp.tsx` (mount, two lines).

**On conflict.** Both new files are fork-owned; only the `MobileApp.tsx` mount
can conflict, and it is two lines next to `OpenCodeUpdateToast`. If upstream
reinstates its own mobile update path, prefer this one — it points at this
fork's APK. `FORK_ANDROID_MANIFEST_URL` hard-codes the repository and is the one
thing to change if the fork moves.

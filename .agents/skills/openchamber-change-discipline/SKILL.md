---
name: openchamber-change-discipline
description: Use when implementing, fixing, refactoring, or otherwise modifying OpenChamber source code, dependencies, exports, build configuration, generated assets, package contracts, or module ownership.
---

# OpenChamber Change Discipline

## Core Principle

Make the smallest complete change and validate at the narrowest level that covers the real risk.

## Before Editing

1. Inspect nearby implementation, callers, and tests before introducing a pattern.
2. Classify every applicable change risk below.
3. Identify every affected consumer, runtime, persisted format, and public export. This step is complete only when each risk has an owner and required validation.

When instructions materially conflict, stop and resolve the conflict instead of silently choosing one.

## Risk Classification

| Risk | Examples | Planning consequence |
|---|---|---|
| Local implementation | Private helper or component behavior in one package | Preserve observable behavior; validate the owning package |
| Module contract | Exported API/type or documented module invariant | Inspect consumers; update contract tests and owning docs |
| Cross-workspace contract | Shared UI/runtime/package shape consumed by multiple workspaces | Trace every actual consumer and runtime; validate across workspaces |
| Persisted or external behavior | Stored settings/data, routes, IDs, files, CLI output | Define compatibility, round-trip, failure, and conversion behavior for existing consumers |
| Platform/runtime behavior | Electron, VS Code, mobile, relay, native or packaged behavior | Run the relevant runtime/build/integration validation |

Apply every matching category. Do not escalate local work into workspace-wide ritual, and do not treat a type-only export as local merely because it emits no JavaScript.

## Structural Discipline

- Preserve behavior established by callers and tests unless the request replaces it. Keep the diff scoped to the complete requested behavior.
- Make the normal use-case path read top to bottom in domain terms. Keep orchestration entrypoints thin and move mechanics or domain logic behind focused, intention-revealing boundaries.
- Pull complexity downward only when a boundary hides meaningful mechanics, owns an invariant, isolates a proven integration, or captures stable repetition. Do not spread obvious code across pass-through layers.
- Prefer explicit dependencies and dependency injection over hidden module coupling.
- Follow local TypeScript types; avoid `any`, blind casts, and guessed payload shapes.
- Reject invalid inputs and broken preconditions early so the valid path stays flat. Do not force a numeric happy-path/error-path ratio when correctness requires substantial failure handling.
- Require evidence before adding retries, caches, compatibility paths, lifecycle machinery, or generalized race handling. Security, data-loss, destructive-operation, and concurrency invariants still require proactive design when the risk is inherent to the operation.
- Make partial failure, rollback, cleanup, and user-visible outcomes explicit for destructive or multi-step work.

## Review Prompts

Before broadening a change, ask:

- Is the new abstraction reused or merely possible to reuse?
- What concrete complexity, invariant, stable repetition, or boundary does each new helper, interface, layer, and file pay for?
- Is the code in the package that owns the behavior?
- Does the change alter shared UI contracts across web, desktop, VS Code, or mobile?
- Does it change persisted data, IDs, routes, exports, generated files, or package entrypoints?
- Can failure leave optimistic state, caches, files, or remote state stranded?

For partial or destructive flows, answer explicitly:

- What remains valid after the first failure?
- What is rolled back or cleaned up?
- What can be retried or resumed safely?
- What does the user observe?

For persisted data, require a migration only when existing stored data needs conversion. Test downgrade compatibility only when older application versions are a concrete supported consumer. "Rollback" means preserving/restoring valid state after a failed write or migration unless a broader contract explicitly says otherwise.

Do not hide a required architectural migration behind a local heuristic. Do not turn a local fix into a speculative rewrite.

## Validation

`AGENTS.md` owns the default validation policy for this fork: scope checks to the
packages the diff touches. This skill adds only the risk-specific extras.

| Change | Additional validation |
|---|---|
| Persisted or external contract | Round-trip and compatibility tests plus the applicable failure cases: missing-versus-empty, malformed data, stale reads versus newer mutations, out-of-order writes, debounced-write lifecycle, and failed-write/migration rollback |
| Cross-workspace/shared contract | Type-check the workspace and test the real consumers you traced, not every package |
| Dependency or lockfile | Workspace-wide checks and the affected build |
| Generated asset | Regeneration check plus one consumer build/test |
| Platform/runtime behavior | The relevant runtime build or manual check; static checks are insufficient |

For type-only shared contracts, validate compile-time consumers. Add runtime
serialization tests when the contract crosses a process, persistence, network,
or untyped JavaScript boundary.

Report exactly what ran and what did not.

## Test Design

- Prefer observable contracts, state transitions, failure handling, rollback, and operation counts.
- Test private helpers through public/module behavior when that captures the risk clearly.
- Assert internal map shape, helper calls, or call order only when that structure/order is itself a contract.
- Keep refactor tests resilient to equivalent internal implementations.
- For behavior-preserving refactors, establish the current behavior before changing structure.

## Completion Standard

- Implement the behavior end to end, including rollback and cleanup.
- Run focused regression tests for the changed contract.
- Preserve unrelated changes encountered in shared files.
- Update an owning doc only when the change made something it states untrue.
- Remove speculative branches, shallow wrappers, and stale compatibility you introduced.

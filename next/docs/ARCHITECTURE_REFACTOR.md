# Wrkbench — client architecture refactor

This branch is a **replacement implementation**, not a redesign-only preview.

## Architecture boundaries

- **Cordis owns plugin lifecycles.** Each `features/<name>` package contributes a view renderer and a validated open tool. Disposing a feature removes both.
- **Feature packages own their renderers.** The application no longer switches on 31 feature kinds to choose a view. Views are resolved from Cordis's feature catalog.
- **WindowManager is a Cordis service.** It accepts view requests and forwards them through a bound platform adapter. Only Dockview owns layout/group membership; there is no secondary split tree.
- **The client service layer is not the app shell.** Browser storage, tool routing and state live under `packages/client` and `packages/storage`. Reusable UI primitives live under `packages/ui`.
- **The ToolRegistry is the single command authority**, with Zod-validated inputs/outputs and a permission hook for privileged operations.
- **IndexedDB is the local file authority.** Saves use revision CAS; renames are atomic read/write transactions. OPFS is an optional cache. Subscribers and BroadcastChannel propagate file-list changes.
- **View identity and document state survive layout operations** as far as supported by Dockview's normal panel lifecycle. Workbench transfers are recorded by the browser-local handoff journal and require further durability acceptance.

## What this does not claim

Feature UI ownership does not imply that 31 independent domain services are complete. Many feature packages still read a shared Zustand projection; those states must migrate to feature-owned services before Phase 1 is accepted. Browser-local terminal, agent, market, and external runtime surfaces remain constrained or simulated. Browser popouts and physical monitor placement require capability testing.

The root repository also contains a prior Canvas app on `main`. That legacy application is preserved while the Wrkbench client under `next/` is independently verified; it should not be silently deleted or treated as the canonical build until migration acceptance.

## Verification

`cd next && bun install && bun run typecheck && bun run test:core && bun run build`

The GitHub workflow `wrkbench-architecture.yml` executes that gate with actual dependency resolution. A green workflow is necessary but does not substitute for real browser acceptance, failure recovery and persistence tests.

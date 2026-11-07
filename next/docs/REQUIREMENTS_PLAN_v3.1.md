# Wrkbench — Engineering Plan

**Revision:** 3.1 · **Status:** architecture accepted in principle; no implementation authorized  
**Application:** `marius-patrik/Wrkbench` · **Separate delivery system:** `marius-patrik/DarkFactory`  
**Outcome:** a Cordis-plugin-based, multi-window, multi-screen workspace with contextual tools and interchangeable execution contexts.

## Dependencies

**Status:** `Verified` = declared in the current `Wrkbench/main` root `package.json` (not proof of successful installation); `Selected` = architecture decision, not yet declared; `Evaluate` = undecided; `External` = first-party adapter for separately installed service; `Platform` = browser/OS capability; `Reference` = research only. Versions appear only where verified in the package manifest. **No entry silently implies the library is installed.**

| Layer | Dependency | Status | Purpose / boundary |
|---|---|---|---|
| Language | TypeScript `^6.0.3` | Verified | Typed services and tool contracts |
| Runtime | Bun `1.3.11` package-manager declaration | Verified | Runtime, workspace packages, tasks |
| Web | React `^19.2.5`, React DOM `^19.2.5` | Verified | Component rendering |
| Build | `@rsbuild/core ^1.7.5`, `@rsbuild/plugin-react ^1.4.6` | Verified | Bundling |
| CSS | `tailwindcss ^4.2.3`, `@tailwindcss/postcss ^4.2.3` | Verified | Styling pipeline |
| Components | `clsx ^2.1.1`, `tailwind-merge ^3.5.0` | Verified | Class composition |
| Icons | `lucide-react ^1.11.0` | Verified | Icons |
| Editor | `@monaco-editor/react ^4.7.0` | Verified | Code editor React binding |
| Terminal | `@xterm/xterm ^6.0.0`, `@xterm/addon-fit ^0.11.0` | Verified | Terminal UI |
| Browser tests | `playwright-chromium ^1.59.1` | Verified | Chromium automation |
| Schema | `zod ^4.3.6` | Verified | Tool inputs/outputs and configuration |
| Quality | `@biomejs/biome ^1.9.4` | Verified | Lint and format |
| Types | `@types/bun ^1.3.12`, `@types/node ^25.6.0`, `@types/react ^19.2.14`, `@types/react-dom ^19.2.3` | Verified | Development type declarations |
| UI primitive | Base UI, shadcn conventions | Selected | Accessible UI composition; not necessarily package-installed |
| Layout | `dockview`, `dockview-react` | Selected | Tiling, tabs, floating, popouts; verify core/enterprise boundary |
| Plugins | Cordis | Selected | Feature lifecycles, DI, service registration; exact package/scoping evaluation |
| Client state | Zustand | Selected | Local projections of authoritative state |
| Motion | Motion | Selected | Animations and transitions |
| Navigation | Wouter | Selected | Application routing |
| Localization | i18next / react-i18next | Selected | Localization |
| Web server | Elysia | Selected | Bun HTTP/WebSockets |
| API format | OpenAPI 3.1 | Selected | Generated transport contract |
| Database | PostgreSQL, Drizzle | Selected | Shared application state and outbox |
| CLI | Citty | Selected | Tool registry projected to CLI |
| Agent protocol | MCP, official TypeScript SDK | Selected protocol; SDK evaluate | Native Wrkbench MCP server |
| Native shell | Tauri 2 / `@tauri-apps/api` | Optional/selected | Real application windows, monitor management |
| Local state | IndexedDB | Platform | Browser-local metadata and snapshots |
| Local files | OPFS, File System Access API | Platform | Files and permissioned file handles |
| Window placement | Window Management API, `window.open` | Platform; limited support | Browser popouts and multi-monitor hints |
| State signals | BroadcastChannel, WebSocket | Platform | Local tabs and server events |
| Media | Web Audio API, WebCodecs | Platform | Browser audio/video capability |
| Performance | Web Workers, OffscreenCanvas, WebGPU | Platform; capability-gated | Isolated work and accelerated graphics |
| UI graphics | Three.js, React Three Fiber, Drei | Evaluate | 3D editor viewport |
| CAD | Open CASCADE / CADCraft | Evaluate | Geometry kernel; WASM/licensing proof |
| Canvas | Mermaid, React Flow | Evaluate | Diagrams and node editing |
| Canvas layout | Dagre, ELK.js | Evaluate | Graph auto-layout |
| Whiteboard | Excalidraw components/algorithms | Evaluate | Freeform editing; custom Wrkbench UI |
| Markdown | unified, remark, rehype | Evaluate | Parse/render Markdown |
| Documents | ProseMirror, Lexical, WordCraft | Evaluate | Structured rich-text editing |
| PDF | PDF.js | Evaluate | PDF preview/rendering |
| Sheets | GridCraft | Evaluate | Spreadsheet engine |
| Decks | DeckCraft | Evaluate | Presentation engine |
| Graphics | PhotoCraft, VectorCraft, FigCraft | Evaluate/reference | Raster/vector engines and UX research |
| Audio | SoundCraft | Evaluate | Audio engine |
| Video | FilmCraft, FFmpeg where permitted | Evaluate/external | Video engine and codecs |
| Charts | Lightweight Charts, ECharts, Visx | Evaluate | Financial, analytic and generic charts |
| Collaborative editing | Yjs | Evaluate | Format-specific realtime operations |
| Auth | Better Auth or alternative | Evaluate | User authentication |
| API clients | Orval; openapi-typescript/openapi-fetch; custom generator | Deferred API-10 | Typed generated HTTP tool interfaces |
| HTTP mocks | MSW | Deferred API-10 | Network test interception |
| Service mocks | Stateful mock host | Required | Final contracts in Phase 1 |
| Dev language features | LSP, DAP, language-client bridge | Evaluate | Diagnostics/debugging |
| Tests | Bun test, Playwright; axe-core candidate | Current scripts/candidates | Unit, integration, browser, accessibility |
| CI | GitHub Actions | Repository integration | Quality gates, releases, provenance |
| Packaging | Bun workspace, package manifests, lockfile | Selected | One installable package per feature plugin |
| Compatibility | `.code-workspace`, JSONC, `.code-profile`, themes/icons | Format targets | VS Code file compatibility, not its extension runtime |
| Agent backend | Codex | External | Agent transport/session adapter; receives native MCP |
| Agent backend | Claude Code | External | Agent adapter; receives native MCP where supported |
| Agent backend | OpenCode | External | Agent adapter; receives native MCP where supported |
| Agent backend | DSH, AGY | External; protocol unverified | Target agent adapters; discovery first |
| Gateway | LiteLLM | External | Routing/model discovery; no embedding |
| Inference | Ollama, vLLM, llama.cpp server, LM Studio, NVIDIA Triton | External | Separate inference endpoints |
| Containers | Docker Engine, Docker Compose | External | First-party container-management adapter |
| Networking | Tailscale | External | Private connectivity and network status |
| Remote | SSH, SFTP | External/protocol | Runtime and filesystem connectivity |
| Repositories | Git, GitHub REST/GraphQL | External/protocol | SCM and provider-backed files |
| Planner | Trello, Jira, GitHub Projects | External | Task provider adapters |
| Finance | OpenBB | External | Financial-data integration |
| Financial UX | OpenTerminal, Gloomberb | Reference | Interaction research, not embedded runtimes |
| Editor UX | Code - OSS, Blender, LYNX SHARE | Reference | Behavior/patterns only; review GPL/AGPL |
| Window UX | Hyprland | Reference | In-app tiling, workspaces, keyboard/window rules; not an OS compositor |

**Verified baseline:** `Wrkbench/main` is currently a single root package still named `@commonwealth/canvas`; its manifest does not declare Cordis, Dockview, Elysia, Drizzle, Tauri, Citty or many other selected dependencies. Package modularization and dependency verification are work to do, not completed facts.

## Architecture

### 1. One feature = one Cordis plugin package

A **feature plugin** is an installable workspace package with a stable ID, version and manifest. When activated it registers a named Cordis service, at least one UI contribution, and its tools. The UI can be opened as a tab, floating window or popout; a feature may contribute additional views. Pure third-party libraries and low-level helpers are not made into artificial feature plugins.

A plugin's service owns behavior and application state; its view presents state; its tools operate on the service; a **view instance** is not a new copy of the service. First-party features use the same contract as third-party features. Cordis registration/disposal owns lifecycle; exact multi-scope context topology remains **deferred (API-09)**.

**Minimal plugin contract:** identity + package/version + service registration + view factory + tool contributions + accepted context scopes + capabilities/permissions + optional workbench definitions. Every feature has a discoverable UI entrypoint, including operational services such as Runtime Manager.

### 2. One window manager above the IDE

The **WindowManager** is a platform Cordis service, not a VS Code-style editor-tab implementation. It owns one logical presentation graph across the app:

`Display → Wrkbench-owned window → WorkbenchInstance → LayoutRoot (split tree) → EditorGroup (tab bar + tabs) → ViewInstance → plugin view factory`.

**Canonical docking unit is the editor group**, not the editor. Each group always has a tab bar, including empty groups, to accept dragged tabs from any other group. Every editor-like `ViewInstance` occupies exactly one tab. Dragging over a tab bar inserts/reorders; the group center merges; an edge drop splits; the same interaction works with groups inside floating windows and other workbenches. Movement reparents an existing view instance without recreating its service, file, or context override.

**All editor groups use one layout schema**: recursive `split` nodes and `group` nodes with `{id, tabs[], activeTab}`. Floating windows contain the same group/split layout root. No separate fake tab list is allowed for floating editors. Empty groups remain visible drop targets until explicitly closed. Each view has exactly one placement across the entire layout graph.

**One mutation authority**: the production `WindowManager` wraps Dockview and uses Dockview as the authoritative in-browser layout tree. It must not keep a second independently mutating split tree. The current offline React prototype has an isolated compatibility layout adapter, which exercises these interactions but is **not Dockview**. Its contract is detailed in `docs/TAB_GROUP_ARCHITECTURE.md`.

**Transactional window operations**: move/reorder/split/float/dock update group membership, active group/tab, workbench ownership, snapshot history and persistence together. Only workbench-derived context may change when moving between workbenches; explicit view overrides remain untouched. Provide keyboard group navigation and move-to-group menus.

Any tab or workbench can be tiled, floated, popped into a separate window, moved between windows/screens, pinned, maximized, minimized, put into a scratchpad or restored. Each workbench may itself open as a window containing its composed services/views. Window and view identity survive a move; only presentation host changes.

**Hyprland-inspired UX:** directional focus/movement, tabbed/stacked groups, tiled/grid/monocle/floating presets, keyboard rules, scratchpads, named workbenches, saved per-monitor layouts and graceful screen hot-plug handling. No attempt to become an operating-system compositor or move unrelated applications.

**Implementation boundary:** Dockview powers in-page tabs, floating groups and popout browser windows; Wrkbench owns the cross-window graph and workbench composition. Tauri provides native multi-window and monitor control when packaged. Browser multi-screen positioning is **best-effort** and permission/feature-detection gated; unsupported browsers fall back to regular popouts or manual placement. Dockview core/enterprise feature differences require a license acceptance spike before implementation.

### 3. Workbench = composition service + screen preset

A **Workbench plugin** is a Cordis service that defines a reusable *composition of other plugin services/views* and an optional screen/monitor layout preset. Its **Workbench instance** is a live set of view instances with bindings and layout. A preset is reusable; an instance can be saved, floated, tabbed, placed on a monitor or opened as a top-level window. Multiple instances of the same workbench may coexist.

Examples: Development (Explorer + Code + Terminal + Git + Agent); Audio (Timeline + Tracks + Mixer); Video (the **same Timeline plugin** + Video Preview + Effects); Operations (Docker + Tailscale + Runtime + Terminal).

Avoid nesting unrelated full Dockview managers: the WindowManager remains authoritative for presentation identity and dragging; composition hosts may own local layout subtrees through explicit adapters.

### 4. Commands are **Tools** everywhere

Rename `CommandRegistry` to **ToolRegistry** and `CommandService` to **ToolService**. Keep the accepted Zod schemas, single execution path, HTTP/API generation, Citty CLI and MCP projection. Legacy `command.*` naming can be migrated through compatibility aliases—not a second registry.

Each `ToolDefinition` includes ID, Zod input/output, service owner, contexts, required capabilities, permission/approval policy, target, side effects and UI presentation metadata. Each tool is **implemented once**.

**Toolbar routing:** the same tool appears in the appropriate surface determined from the active component's placement and resolved context: shell toolbar for global tools; workbench toolbar for composition tools; view/editor toolbar for view-specific tools; selection toolbar when applicable. A tool can also be pinned or found through the palette, menu, shortcut, CLI or MCP. Multiple toolbar placements never mean multiple handlers.

UI-targeting tools invoked via CLI/MCP require explicit or resolvable client/window/view attachment; otherwise return an unavailable-target result rather than pretending success.

### 5. Every view has switchable context

Provide a single **ContextService** and **ContextSwitcher** feature plugin (service + UI + tools). The Runtime Switcher is a presentation of this feature, permanently reachable from the bottom-left status bar and embeddable in any shell/workbench/window/view toolbar.

A context binding resolves: **account/connection, workspace, project, session, workbench instance, display/window, view, runtime, resource/provider, and tool-invocation override**. Views may simultaneously target different runtimes/sessions within one window. The active context and inherited versus overridden values must be visible; changing context never silently migrates files or live processes.

User-facing tools include `context.inspect`, `context.switch`, `context.reset`, `runtime.select`, `workbench.open`, `window.float`, `window.tile`, `window.moveToDisplay` and `tool.invoke` (names provisional). Identity switching means authenticating/selecting an authorized account, never impersonation by changing an ID.

Context settings reuse the existing profile → workspace → project → session → workbench/window/view override system, with capability checks and mandatory security policy. Distinguish **per-user/per-device presentation state** from shared authoritative application state.

### 6. Native MCP is the agent tool boundary

Wrkbench exposes **one native MCP server** from its ToolRegistry. The native Wrkbench agent, and supported Codex/Claude/OpenCode/DSH/AGY backends, receive that MCP server as their tool interface. Do **not** separately inject a bespoke copy of Wrkbench tools into each agent adapter. Backend adapters handle only agent-native conversations, models, streaming, approvals/session lifecycle and supported protocol variations. MCP tools call the same authorization/approval/execution path used by the shell, CLI and HTTP APIs.

An agent backend's own protocol and session state remain external. MCP does not replace Wrkbench's application sessions. Agents use scoped, revocable credentials and cannot elevate their own authority. Native MCP registration must dynamically reflect enabled plugins.

### 7. State, files and extensions

Files remain provider-backed; common save, dirty state, revision checks and recovery apply. PostgreSQL/Drizzle stores server-owned sessions, metadata and durable events; the transactional outbox + snapshots handle reconnect and replay. Browser-only mode uses IndexedDB/OPFS and compatible services. One user has a personal global session by default; independent/shared sessions are available; presentation sync is configurable.

All plugins are isolated by default, with explicit trusted in-process mode and administrative restrictions (API-14). Distribution remains open to local/Git/package registries (API-15). Server-side and browser-side plugin entrypoints may differ, but share one stable feature contract. No external agent/gateway/inference/Docker/Tailscale implementation is embedded.

## Package layout (proposed, not existing)

```text
packages/
  core/          # contexts, identities, lifecycle contracts
  protocol/      # Zod tool/event/manifest schemas
  sdk/           # Cordis feature/view/tool registration
  ui/            # shared design tokens and controls
  transport/     # Elysia, MCP, CLI adapters
  persistence/   # file, session and event contracts
features/
  window-manager/  workbench/       context-switcher/
  explorer/        code/            terminal/
  timeline/        audio/           video/
  canvas/          graphics/        cad/
  sheets/          decks/           browser/
  planner/         trading/         agent/
  docker/          tailscale/       models/
integrations/
  codex/ claude/ opencode/ dsh/ agy/
  litellm/ ollama/ vllm/ llama-cpp/ lmstudio/ triton/
  github/ ssh/ trello/ jira/ openbb/
apps/
  web/  server/  cli/  desktop/
```

Every **feature** directory is a separately installable Cordis plugin package. `packages/` contains non-feature libraries and infrastructure. Workbenches are feature plugins defined by composition metadata, not copies of the underlying features. Final boundaries require a repository migration review.

## Delivery gates

**Phase 1 — complete client:** actual cross-window manager behavior and browser-local files; full UI, first-party plugins, workbench presets, tool/context routing, Agent/MCP interface, testable stateful mocks for unavailable production services. Browser multi-monitor limitations remain explicit.

**Phase 2 — production:** real Elysia/PostgreSQL host, secure plugin execution, server-side agents and native MCP, actual editor engines, provider integrations, CLI, multiuser authorization and native packaging.

## TODO

Only this checklist tracks delivery; unchecked means **not proven**.

- [ ] **T01 — Baseline:** inspect Wrkbench sources, packages, CI, references and merged migrations. Evidence: exact SHA, package tree and tests.
- [ ] **T02 — Contract:** define one feature-plugin/package/service/view/tool manifest and lifecycle. Evidence: example feature registration and disposal tests.
- [ ] **T03 — Cordis evaluation (API-09):** compare scoped contexts versus global registry with lifecycle and privilege tests. Evidence: measured results.
- [ ] **T04 — Tool/transport evaluation (API-10):** compare generation/mocks for HTTP, CLI and native MCP. Evidence: one dynamic tool through every surface.
- [ ] **T05 — Window graph:** define stable `ViewInstance`, `EditorGroup`, `LayoutRoot`, `WorkbenchInstance` and window IDs, exactly-one-tab-placement invariants, and transactional tab reparenting including empty groups and floating roots. Evidence: property/model tests for every transfer zone and undo.
- [ ] **T06 — WindowHost spike:** integrate actual `dockview-react` as the one docking authority; prove group tab bars, arbitrary tab reordering, edge splitting, floating group layouts, popouts, serialization, Tauri/browser monitor fallback and licensing. Evidence: browser tests on the real application origin.
- [ ] **T07 — ContextService:** implement inheritance, view-level switching, runtime profiles, permission checks and UI chips. Evidence: two views on two different runtimes.
- [ ] **T08 — ToolService:** implement one Zod tool and dynamic toolbar placement in shell/workbench/view plus palette/API/CLI/MCP. Evidence: no duplicated handler.
- [ ] **T09 — Workbench composition:** implement reusable preset/instance services while preserving stable group IDs and tab membership when floating a whole workbench or moving tabs between instances. Evidence: cross-workbench/group/window drag/drop tests.
- [ ] **T10 — Reusable editors:** create Explorer, Timeline, Graph, Grid, Viewport and Inspector plugins. Evidence: standalone and embedded reuse.
- [ ] **T11 — Files:** implement real browser-local open/save, revisions, external-change and conflict protection. Evidence: reload/conflict/crash tests.
- [ ] **T12 — First-party feature UIs:** implement every planned surface as a feature plugin, including Runtime Switcher, Agent, Docker and Tailscale. Evidence: tab/window mounting and tool discovery.
- [ ] **T13 — Settings and sessions:** implement profiles/workspace/project/session/view settings, presentation sync, checkpoints and recovery. Evidence: cross-client and device layout tests.
- [ ] **T14 — Native MCP:** publish ToolRegistry dynamically, scope agent access and approvals, validate UI tools' target resolution. Evidence: an agent calls one real Wrkbench tool.
- [ ] **T15 — Phase 1 gate:** verify group tab bar in every area, in-group reorder, any-group transfer, edge split, empty group destination, floating transfers, cross-workbench moves, full-graph undo, dirty state and real-origin reload, along with keyboard/accessible alternatives and browser-local persistence. Evidence: browser tests against the running React 19/Cordis/Dockview client—not injected HTML.
- [ ] **T16 — Server:** implement Elysia, PostgreSQL, auth, events/outbox, storage providers and jobs. Evidence: transactional failure/restart tests.
- [ ] **T17 — Native/remote runtime:** implement Tauri multi-window, SSH, terminal, Git, managed browser and secure extension hosts. Evidence: OS/runtime matrix.
- [ ] **T18 — Agent/integration adapters:** integrate Codex, Claude, OpenCode and verified DSH/AGY; LiteLLM, inference, Docker, Tailscale. Evidence: capability/permission and disconnect tests.
- [ ] **T19 — Creative engines:** connect specialist document, graphics, CAD, sheets, decks, audio and video engines behind shared feature contracts. Evidence: file-format roundtrips.
- [ ] **T20 — Release gate:** pass quality, security, portability, accessibility, license/SBOM, install/upgrade and rollback checks. Evidence: observed CI and release artifacts.

## Decisions and risks

**Accepted:** API-01 Elysia; 02 Zod 4; 03 unified generated tools (formerly commands); 04 server-authoritative sessions; 05 configurable synchronization; 06 bounded/full history; 07 outbox; 08 personal global sessions; 11 Citty; 12 authorized MCP discoverability/approvals; 13 files; 14 isolated/trusted extension modes; 15 open distribution. **Updated product model:** every first-party feature is a Cordis plugin package with service, view and tools; workbench = composable service/screen preset; every tab may float/pop out; contexts switch at the view level; agent tools come from native MCP.

**Deferred:** API-09 Cordis scoping, API-10 client generation/mocking, exact sandbox technology, exact plugin ABI, display-layout persistence strategy, creative engines, DSH/AGY protocol details, enterprise Dockview license decision.

**Critical constraints:** browser websites cannot act as OS compositors or guarantee multi-monitor placement; Dockview controls only Wrkbench-owned panels/windows. Do not grant plugin access to credentials by UI mounting. Never equate UI focus with security identity. Tauri/OS window capabilities are not implied by web-only deployment. Keep file saves and service data durable and conflict-safe.

**References:** Dockview core floating/popouts; Tauri multi-window/monitors; MDN Window Management API; Cordis service lifecycle; Hyprland workspace/dispatcher UX; MCP tool discovery and authorization.

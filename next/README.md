# Wrkbench — React 19 / Cordis / Dockview client

**Status: architecture-native source implementation; NOT verified as a runnable Phase 1 release.**

This is a new source tree built against the *actual dependencies* from the accepted Wrkbench architecture. It does **not** use the earlier React 16 HTML mockup, fake Dockview, or a fake Cordis runtime.

## Dependency ownership

| Responsibility | Actual implementation imported by source | Status |
|---|---|---|
| React component runtime | `react@^19.2.5`, `react-dom@^19.2.5` | Declared; installation unverified |
| Plugin lifecycle / service injection | `cordis@4.0.0-rc.12` | `Context`, `Service`, fibers, `ctx.effect` used directly |
| Editor groups, tabs, DnD, splits, floats, popouts, layout history | `dockview-react@^8.8.3`, `dockview@^8.8.3` | `DockviewReact`, `DockviewApi`, native layout serialization used directly |
| Build pipeline | Bun 1.3.11 + Rsbuild + React plugin | Defined; build not executed here |
| Styling | Tailwind CSS 4 + CSS custom properties | Configured; no Tailwind CDN |
| Code editor | `@monaco-editor/react`, `monaco-editor` | Actual editor, local worker bundling |
| Terminal display | `@xterm/xterm` + fit addon | Actual terminal UI; commands simulated |
| Data contracts/tools | Zod 4 | Runtime input/output validation |
| App state | Zustand 5 | Persisted client state |
| Browser file authority | IndexedDB | Revision-guarded transaction writes; OPFS mirrored opportunistically |
| Navigation/icons | Wouter + lucide-react | Real libraries imported |
| Tooltips | Radix UI Tooltip | Native React portal and keyboard trigger |

**Why there is no compiled HTML in this package:** The execution environment could not resolve the npm registry and does not have Bun or the required packages cached. Source code referencing real packages is not the same as installed or compiled code. No build artifact or install success is claimed. `bun run build:single` is supplied to generate the **real** HTML from the actual dependencies once they are installed. The postprocessor refuses to emit an incomplete standalone file.

## Start locally (Bun + internet required once)

```bash
bun --version                  # use Bun 1.3.11
bun install                    # install actual dependencies
bun run static:verify          # parse every TypeScript/TSX file
bun run typecheck              # ensure the integration type-checks
bun run dev                    # http://localhost:5173
```

In a second terminal:

```bash
bun run test:core              # structural contracts
bun run test:e2e               # real HTTP browser boot and interactions
bun run build                  # dist/index.html plus assets
bun run build:single           # genuine React 19 single HTML, if worker closure is valid
```

`build:single` uses Rsbuild `inlineScripts`/`inlineStyles`, bundles Monaco workers as inline Blob sources, and fails loudly if any CSS/JS or worker chunks remain external. Browser local file storage is origin-scoped; use localhost to test persistence. `file://` can have separate storage or worker restrictions. Popout windows require an HTTP origin and same-origin `popout.html`.

## Source map

```text
apps/web/src/
  App.tsx                 Shell, Cordis lifecycle, Dockview host and tab operations
  state.ts               Zustand session/theme/workbench/view state
  services.ts            Local tool calls, IndexedDB file service integration
  views/Editors.tsx      Monaco editor, Explorer, xterm, Markdown
  views/Features.tsx     Local UX for other feature packages, honest adapter states
  styles.css             Light/dark elevated workbench styling
packages/core/src/       Zod models, ToolRegistry, workbench compositions
packages/sdk/src/        Cordis FeatureCatalog / ToolService, plugin lifecycle
packages/storage/src/    Transactional IndexedDB file authority, OPFS cache
features/*/               31 Cordis feature registration packages (each contributes an open-view tool)
scripts/                 TypeScript syntax checker and standalone-bundle validator
tests/                   Offline structure checks and HTTP-origin Playwright specs
```

## Architecture rules

- **Dockview** is the only layout graph. Do not create a parallel mutable split/tab model.
- Every open view is a Dockview panel inside a group with a tab bar. Tabs can reorder and move among groups; edge drops split; empty groups remain valid; floating/popout groups use native Dockview.
- Per-view identity is a stable panel ID. Data is keyed to document path or view ID, not a group's position. Dockview layouts are persisted separately for each workbench.
- **Cordis** owns feature registration lifetimes and the shared typed ToolService.
- One global status bar. Context manager and display manager open as anchored menus there.
- There is no fake SSH/host shell, Docker daemon, Git checkout, LLM, trading feed or external device connection.

## Implementation and acceptance boundary

**Real browser-local features in source:** files, Monaco editing and saving, xterm rendering with browser commands, layouts and native tab transfers, context overrides, workbench presets, local notes, documents, sheets, presentation text, timeline clip state, canvas node manipulation, planning tasks, watchlist with explicitly static samples, agent transcripts without model execution, theme/settings persistence, local media/PDF preview.

**Unavailable without future providers:** host/remote terminals, agents that invoke models, Docker, Tailscale, remote runtimes, real Git, inference servers, neural rendering, physical monitor control, market feeds. Their UI shows disconnected states rather than simulating successful external operations.

**Not yet achieved / not claimed:** actual successful `bun install`, TypeScript typecheck against downloaded libraries, Rsbuild build, runtime HTTP navigation, persisted reload acceptance, native Drag & Drop browser automation, compiled single-HTML output, test coverage of every Phase 1 product acceptance criterion. Tests under `tests/e2e` are **authored but not executed in this environment**. The 5 passing tests are source-structure invariants, not proof of runtime behavior.

The previous old React 16 mockups are not included or silently rebranded in this source. No remote GitHub repository was altered.

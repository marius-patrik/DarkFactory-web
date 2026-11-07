# Wrkbench — UI Design & Interaction Specification

**Revision:** 4.1 (canonical tab-group correction)  
**Status:** Mockup for review; not an implementation approval  
**Application:** Wrkbench · `marius-patrik/Wrkbench`  
**Artifact:** `index.html` · one file, embedded CSS and JavaScript, no network requirements

## Product and interaction model

Wrkbench is a service-based workspace. A feature is a Cordis plugin package with a service, one or more UI views, and contextual tools. A workbench is a composition of views and layout rules, not a second copy of those services. **Every view is a tab in exactly one editor group, and every editor group owns an always-visible tab bar.** Groups, not individual editors, are the docking destinations; tabs are dragged into any group or reordered inside it. The WindowManager owns the spatial graph and docking/floating; the ContextSwitcher chooses the target account, project, session, and runtime. The ToolRegistry supplies shell, workbench, view, CLI and MCP surfaces. The standalone HTML imitates these contracts locally; it does not run Cordis, Dockview, MCP, or a backend.

## Visual structure

- **Shell:** Continuous black/neutral-gray (dark) or light-neutral (light) background behind the 58px title bar, 68px activity rail, and 37px global status bar. No product logo/title in the title bar. Leftmost control is workspace/project context.
- **Work surface:** One raised, rounded, subtly bordered panel occupying the remaining viewport. Main tools align left; Float Workbench and Add View align right. No redundant identity header.
- **Tiles:** Nested editor groups have ~15px corner radii, 9px split gutters, 40px tab strips, and 37px contextual toolbars. Every group—including an empty area and every floating group—renders a usable tab bar. No independent editor status bars.
- **Chrome:** Neutral grayscale. Restrained color is allowed only where it encodes semantics (syntax, terminal, health, market change, warning). The global status bar is authoritative.
- **Appearance:** Dark and light modes, a visible top-right switcher, persistent theme preference where storage is allowed; reduced-motion support.
- **Tooltips:** Every button, including dynamically generated ones, has a native title and an accessible name for icon-only controls.

## Window system

| Interaction | Mockup behavior | Phase 1 requirement |
|---|---|---|
| Tiling | Recursive alternating horizontal/vertical split tree, arbitrary depth | Stable split-node identities and resize constraints |
| Dividers | Drag to resize; keyboard arrows on focused separator | Persist ratios and guard min sizes |
| Tabs | Select, close, reorder inside a tab bar, drag to any group's tab bar/center, or drop at an edge | Preserve one view ID, resource identity, tab order, active selection and dirty state |
| Split | Create a new empty editor group with its own tab bar; move any existing or new tab into it | No implicit duplicate editor or service; empty group remains an accessible drop target |
| Layouts | Master-stack, BSP, spiral, columns, rows, monocle | Layout previews and reliable undo |
| Float / dock | Detach a tab/group into a draggable, resizable floating window with its own group tab bar; drag other tabs into it and dock them back | Floating windows host the same recursive group layout, not a special one-tab-only view |
| Workbench float | Float/dock whole workbench composition | Maintain composite layout tree |
| Displays | Status-only anchored menu, simulated display selection and floating-window assignment | Feature-detect native/browser multi-screen APIs; fallback when unavailable |
| Restore | Group layouts and tab order stored in browser storage when permitted | Versioned full-window snapshots; no lost, orphaned or duplicated tab instances after restore |

**Display limitation:** The second display in the prototype is virtual. Browser/native multi-monitor placement is not implemented. The status bar must never imply physical monitors were detected.

## Shell and tool routing

- **Title bar:** Workspace/project context, tool search, theme, feature catalog, profile. No logo, name, UI-study label, or Display Manager control.
- **Activity rail:** Workbench navigation only; no bottom utility buttons or Command Center duplicate.
- **Workbench toolbar:** Undo, Layout, Split, Save Layout on the left; Float Workbench and Add View on the right.
- **View header:** Tab list plus Float/Dock and More; no duplicate New Tab or Split actions.
- **View toolbar:** Tools registered by the active feature. A tool's label reflects its current action (for example Start/Stop or Connect/Disconnect).
- **Status bar:** Context Switcher, simulation state, workbench/display indicator, Display Manager menu, document save status, keyboard help.
- **Tool Palette:** `Ctrl/Cmd+K`, searchable views, workbenches, tools, and local files.

## Context switching

The Context Switcher is an anchored menu, never a modal. It opens from the status bar or any view's context control. It can change runtime, session, project, or account. Choices apply immediately.

- **This view:** Stores a view-specific override.
- **Workspace defaults:** Changes inherited defaults, affecting other unoverridden views and new views.
- **Reset:** Restores inheritance for a view or the original default context.
- **Security parity:** A selected account can restrict operations (the demo guest profile cannot save files). Future real services must revalidate authorization at invocation time.

## Interactive feature requirements

| Feature | Meaningful UI simulation | Explicit limitation |
|---|---|---|
| Explorer | Search/filter files, expand folders, create nested paths, open file associations, indicate dirty files | No host filesystem access |
| Code | Editable syntax-highlighted source, indentation, Format, Save, Run preview; shared file buffers | No actual code execution or language server |
| Documents/Notes | Editable Markdown, insert link, download export, Save | No full document engine |
| Terminal | Session-specific history; `help`, `pwd`, `ls`, `git status`, `bun test`, `echo`, `clear` | Commands are interpreted locally, never executed |
| Agent | Choose backend, start session, send message, inspect MCP tool preview | No agent process, API requests, or MCP connection |
| Timeline | Play/pause/rewind/step, select tracks, split clips at playhead, toggle snap; shared UI for Audio and Video | No actual media playback or rendering |
| Mixer | Change channel levels, select, solo, mute, add channel | No audio engine |
| Canvas | Select/add nodes, toggle connectors, fit layout | No production graph editor |
| Docker | Inspect simulated container states, start/stop, read sample logs | No Docker connection |
| Tailscale | Inspect device states, connect/disconnect simulated tailnet | No network connection |
| Browser | Enter an address, navigate local history, inspect demo page | Network browsing deliberately disabled |
| Markets | Switch time range, add chart view, display labeled synthetic data | No live market data |

## Document lifecycle

Every file has a shared `{ content, saved }` pair keyed by resource path. Multiple code views for one file edit the same underlying demonstration document. Dirty indicators appear in tabs, Explorer and the single global status bar. `Ctrl/Cmd+S` saves the focused document; Save Layout is a separate workbench operation. Closing the final view of a dirty document asks for confirmation before discarding.

Local storage persistence is best-effort in the mockup. Phase 1 must use reliable browser storage, revisions, conflict detection, recovery and provider acknowledgments.

## Keyboard and accessibility

| Keys | Behavior |
|---|---|
| `Ctrl/Cmd+K` | Tool Palette |
| `Ctrl/Cmd+S` | Save focused document, or layout when none is open |
| `Ctrl/Cmd+\` | Add empty editor group beside focused group |
| `Ctrl/Cmd+Tab` | Cycle tabs in focused group |
| `Ctrl/Cmd+W` | Close focused tab, with dirty-file guard |
| `Alt+1…7` | Switch workbenches |
| `Alt+Arrow` | Directional tile focus |
| `Alt+Shift+F` | Float active view |
| `Alt+Shift+D` | Dock latest floating view |
| `Alt+Shift+T` | Toggle theme |
| `Escape` | Dismiss menu/dialog and restore focus |
| `ArrowUp/ArrowDown` | Navigate open context menus and palette results |

Every group accepts tab drops; a highlighted center/tabbar inserts into its tabs, while edge targets create a neighboring group. When hovering an existing tab, show a clear insertion indicator. A tab menu must offer **Move to group** across workbenches/floating windows as a keyboard alternative. Group IDs remain stable through layout presets and undo.

Buttons expose accessible labels and tooltips; dividers have keyboard focus and separator roles. Modal dialogs are reserved for genuine workflows (feature discovery, new file, tool details); context and display controls remain anchored popovers. Production must supply keyboard drag alternatives, roving focus, dialog focus trapping, and screen-reader announcements.

## Responsive layout

- **Desktop (>=1024px):** Full multi-pane tiling.
- **Tablet (720–1023px):** Compact toolbars, denser panels.
- **Mobile (<720px):** One pane shown at a time, with a horizontal tab chooser. Workbench and data contexts remain available. No page-level horizontal overflow.

## Verified behavior in this artifact

The test suite exercises browser rendering, interactive code editing/save, new file creation, Explorer filtering, terminal commands, agent messages and backend selector, floating/docking, tiling/undo, runtime/display menus, palette, audio Timeline, Mixer, Docker state changes, dark/light themes, and mobile layout. JavaScript syntax checks and the same tests must be run after every material change.

**Review boundary:** This artifact is a UI mockup. It should establish interaction behavior and visual acceptance before implementing the Phase 1 React/Cordis/Dockview client. It is not a production filesystem, agent, window-host, inference, or network implementation.

# Wrkbench — Product Requirements Document

**Revision:** 3.1 · **Status:** product specification for review  
**Product:** Wrkbench · **Repository:** `marius-patrik/Wrkbench`  
**Promise:** one extensible, multi-window environment whose tools, services and screens can be composed and controlled consistently across local and remote work.

## Product model

Wrkbench behaves like an application-contained tiling/floating workspace inspired by Hyprland, not like a conventional IDE with a fixed sidebar and editor region. Its building block is a **feature plugin**: an installable Cordis package providing a named service, a UI that opens in a tab/window, and contextual **tools**. A single plugin can contribute multiple views; several plugins can be composed into a workbench.

Every working area is an **editor group with its own tab bar**, even when empty. Every editor is opened as a tab, so its tab can be dragged into **any other editor group**—to reorder, merge with another area's tabs, split beside a group, or move into a floating/workbench window. Tabs are instances of plugin-provided views, not separate plugin packages or services. A tab transfer never duplicates the underlying document, model, or service.

A **workbench** is a reusable service-backed screen preset. It can open as a full application screen, a tiled region, a tab, or a separate window. Multiple workbenches may exist simultaneously on one or multiple displays.

Wrkbench itself manages only its own surfaces; it does not replace the computer's operating-system window manager.

## Audience and problem

**Hypothesis (not yet validated by user interviews):** developers, researchers, engineers and creators waste effort transferring files, context, windows, tasks and agent state among unrelated applications.

Wrkbench targets users who want one place to open real project files, combine specialized tools, switch execution contexts, work across monitors and delegate actions to authorized agents.

## Key user journeys

**Arrange a workspace.** Open Development → drag the Code tab from its group to Terminal’s tab bar → both tabs share one area → drag Code to the right edge of Explorer to create a new editor group → float that group → dock back or move to another workbench → save/reopen the arrangement without losing tab identity.

**Switch context.** In a Terminal tab select SSH Runtime A; in another tab keep local Runtime B. Use the same Context Switcher in a toolbar or bottom-left status bar; observe the effective workspace, project, session and runtime on each surface.

**Reuse a feature.** Open Timeline independently or as part of Audio or Video. Its controls and shortcuts remain consistent; the media processing adapts to the owning feature.

**Find and use tools.** Select a file in Explorer → context-appropriate file tools appear in its toolbar. Open an Audio workbench → workbench composition tools appear. Global tools stay in the shell. All tools are discoverable through the palette and, when authorized, CLI/MCP.

**Use an agent.** Select Codex, Claude, OpenCode, DSH or AGY as an available backend → connect the backend to Wrkbench's **native MCP server** → allow/approve appropriately scoped tools → inspect activity, artifacts and results. Tool definitions are not reimplemented per backend.

**Recover safely.** Close or crash a floating tab with unsaved data → restore it and receive accurate save/conflict information. Disconnect a monitor → remaining windows reflow into accessible positions.

## Requirements

| ID | Priority | Requirement | Observable acceptance |
|---|---|---|---|
| R01 | P0 | Feature/plugin contract | Each first-party feature is an identifiable installable Cordis package with service, UI and tools |
| R02 | P0 | Full app window manager | Tabs tile, float, pop out, dock back, move, maximize and restore without losing identity or state |
| R02A | P0 | Universal editor-group tab bars | Every tiled/floating group, including an empty group, has a tab bar and accepts tabs from every eligible editor group |
| R02B | P0 | Tab reparenting | Drag onto tab bars reorders/inserts, center merges, edges split; transfers preserve one stable view ID, file state and context overrides |
| R02C | P0 | Window graph consistency | No duplicate/lost tabs after cross-group/workbench/floating moves, undo, reload or dirty-document safeguards; non-mouse move available |
| R03 | P0 | Workbench presets | A reusable composition of features opens as an independent screen, tab or window and can be saved/restored |
| R04 | P0 | Multi-display behavior | Supported clients can place Wrkbench windows by display; unsupported browsers expose a usable fallback |
| R05 | P0 | Context Switcher | Every surface can inspect/override authorized runtime, workspace, project and session contexts |
| R06 | P0 | Context visibility | Toolbars show effective context and inherited/overridden scope; switching does not migrate data implicitly |
| R07 | P0 | ToolRegistry | Every tool has one handler and appears in appropriate shell, workbench or view toolbar based on context |
| R08 | P0 | Native MCP server | Registered tools are available to authorized agent backends via one Wrkbench MCP interface |
| R09 | P0 | Files and saves | Explorer opens real files, saves through providers and protects unsaved/concurrent changes |
| R10 | P0 | Security and approvals | View movement or context switching never changes underlying user identity/permissions without authorization |
| R11 | P0 | Browser-local baseline | The core UI, layouts and available file operations work without external server services |
| R12 | P0 | Honest capability behavior | Unsupported native/multi-monitor/agent functions are reported clearly, not silently simulated |
| R13 | P1 | Shared reusable features | Timeline powers Audio/Video; Explorer, Grid, Graph and Inspector can embed in multiple workbenches |
| R14 | P1 | Sessions/history | Personal global session default; independent/shared sessions, sync preferences, checkpoints and replay |
| R15 | P1 | Extensible integrations | Codex, Claude, OpenCode, DSH, AGY, LiteLLM, inference, Docker and Tailscale are first-party adapters to external systems |
| R16 | P1 | Open extension distribution | Feature packages install from local, Git, registries or optional catalogs with isolation/trust controls |
| R17 | P1 | Multi-input workflow | Keyboard tiling, directional focus, mouse drag, command palette and accessible controls all work |
| R18 | P1 | Specialized feature coverage | Development, Research, Documents, Graphics, Canvas, CAD, Sheets, Decks, Audio, Video, Planner, Trading, Agent and Operations workbenches |
| R19 | P2 | Native packaging | Tauri supports app-owned native windows and monitor discovery with proper permissions |
| R20 | P2 | Advanced workspace policies | User-defined rules, scratchpads, named layouts and automatic window placement |

## Product boundaries

**Files are files.** Resource providers own their content. Editor engines own format-specific editing behavior. A window or workbench owns presentation, not a second copy of the file.

**Tools are not toolbar buttons.** The same tool may appear in multiple locations, or be called from CLI/MCP, without duplicating its behavior. Context and permissions determine availability.

**Agents are external runtimes.** The native Wrkbench agent uses the native Wrkbench MCP server for tools; agent-backend adapters deal with the external backend's session/protocol. LiteLLM and inference engines are separate from agent runtime selection.

**Window management has platform limits.** Dockview offers in-app floating and popouts; browser window placement and monitor enumeration are permission- and support-dependent. Native packaged clients can offer stronger app-window control. Wrkbench does not control unrelated OS applications.

**Trust is explicit.** Installing a plugin, joining a session, or activating a workbench never automatically grants sensitive resource or execution access.

## Release boundaries

**Phase 1 — final UI:** feature/package architecture, tile/float/popout interactions, workbenches, context switcher, tool placement, real browser-local files, native-MCP-facing mock/contract tests, and coherent UI for all planned capabilities. External integrations may be demonstrably mocked.

**Phase 2 — production:** Elysia/PostgreSQL host, file and execution runtimes, native MCP server, actual agents and engine integrations, Tauri multiwindow, secure extension isolation and provider access.

## Success measures

| Signal | Baseline | Target / proof |
|---|---|---|
| Move a view among tab, float, popout and workbench | TBD | Identity, selection and unsaved work survive verified transitions |
| Restore multi-screen layouts | TBD | Layout recovered with safe monitor-disconnect fallback |
| Use two runtimes simultaneously | TBD | Distinct context indicators and correct target execution |
| Tool parity | TBD | One tool executes identically via toolbar, palette, CLI and MCP, subject to authorization |
| Agent compatibility | TBD | Backend capabilities explicit and same native MCP tools available to supported backends |
| Crash-safe editing | TBD | No acknowledged save loss in specified recovery tests |
| Accessibility | TBD | Core tiling and context switches usable without a mouse |

No numerical market or adoption targets have been validated yet.

## Open product decisions

Exact screen presets and default keyboard map; browser/native feature parity; scope of multi-screen auto-placement; optional Dockview enterprise features; package/workbench catalog; settings UI details; DSH/AGY backend protocols and agent UI capability parity. Cordis context scoping (API-09) and client generation/mocking (API-10) remain deferred.

**Engineering task sequencing and the only delivery TODO checklist belong in the separate Engineering Plan.**

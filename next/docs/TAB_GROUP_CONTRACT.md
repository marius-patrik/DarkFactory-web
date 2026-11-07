# Wrkbench — Canonical tab-group and window architecture

**Status:** Accepted interaction contract; implementation is a local simulation until React 19 + Cordis + Dockview integration.

## Why groups exist

Every editor-like **view instance** is presented as a tab. Every tiling area is an **editor group** with its own always-present tab bar. The purpose of this uniform structure is that **any tab can be dropped into any group**, not merely rearranged inside its original area. That includes otherwise empty groups, groups inside floating windows and groups belonging to other workbenches.

The feature itself is **not** a tab. The feature is a versioned Cordis plugin package that owns one or more services and contributes view factories and tools. Opening a feature creates a `ViewInstance` with a stable ID. Multiple views can share the same service or the same document resource without duplicating either.

## Hierarchy and ownership

```text
AppShell (title, activity rail, status bar; not an editor group)
  └── WindowManager service (only layout mutation authority)
       ├── WorkbenchInstance (composition, contexts, named layout)
       │    └── LayoutRoot (split tree)
       │         ├── SplitNode (axis, ratio, children)
       │         └── EditorGroup (stable group ID, active tab ID, ordered tab IDs)
       │              ├── GroupTabBar (always visible, including when empty)
       │              │    └── Tab (ViewInstance ID; draggable)
       │              ├── ContextualViewToolbar (tools from active view)
       │              └── ViewHost (renders only the group's active tab)
       └── FloatingWindow / native popout (a separate LayoutRoot of EditorGroups)

PluginHost / Cordis
  └── FeaturePackage → ServiceInstance → ViewFactories + ToolContributions
                                     └── ViewInstance (referenced by tabs)
```

**WindowManager owns:** group membership, tab order, active selection, split structure, floating geometry, cross-workbench presentation, persistence and layout undo.

**Plugin/service owns:** resource/model state, business operations, tool handlers and feature lifecycle. It does not own its panel's docking coordinates or tab bar.

**View instance owns:** local interaction state, explicit context overrides, and resource reference. A view instance survives reparenting to another group; a move must not silently create another view or another service.

**Workbench owns:** a composition recipe and per-instance defaults, not a second copy of feature services. A workbench window hosts its existing layout tree, not a clone.

## One model for every group

```ts
type LayoutNode =
  | { kind: 'group'; id: GroupId; tabs: ViewId[]; active: ViewId | '' }
  | { kind: 'split'; id: SplitId; axis: 'row' | 'col'; ratio: number; a: LayoutNode; b: LayoutNode };

type WindowPlacement =
  | { kind: 'workbench'; workbenchId: WorkbenchId; root: LayoutNode }
  | { kind: 'floating'; windowId: WindowId; workbenchId: WorkbenchId; root: LayoutNode };
```

All group IDs are unique and stable across workspace relayouts. Floating windows use the *same* `LayoutNode` tree as tiled workbenches; they are not independent lists of tabs. The app always renders a group tab bar even if its `tabs` array is empty, so an empty area remains a valid drop target. Closing an empty group is a **separate explicit operation**; tab transfer must not unexpectedly collapse its destination area.

## Canonical tab transfer transaction

`WindowManager.moveTab(viewId, { destinationGroupId, zone, beforeTabId? })`

1. Resolve and validate the source and target groups (including floating and cross-workbench targets).
2. Check the source tab exists, target accepts tabs, and move is permitted.
3. Snapshot the entire presentation graph for undo/recovery.
4. Remove the tab ID from its source group and select a surviving source tab; preserve an empty group as a drop target.
5. If zone is **center/tab bar**, insert into target tab order at the pointer position; otherwise split the target into two groups, placing the existing tab group and the new group on the requested side.
6. Activate the same `ViewInstance` in its destination. Update workbench-derived context but preserve explicit per-view overrides, resource identity and unsaved content.
7. Remove an empty floating container only after the transfer transaction commits. Persist and announce the operation.

**Required drop behavior:** tab bar → reorder/insert; panel center → merge into target group; left/right/top/bottom → split relative to target; activity-rail target / group picker → cross-workbench move; floating group → same operations. `beforeTabId` controls stable insertion rather than appending every drop.

**Required keyboard alternative:** per-tab context menu listing eligible groups and a shortcut to move the active tab among neighboring groups. Dragging is never the only method of reparenting.

## Invariants and recovery

- Every registered view has **exactly one** placement in an editor group across all tiled/floating layout roots.
- Every tab ID references an existing view; groups never contain duplicate tab IDs.
- A nonempty group has an active tab that belongs to that group; an empty group has no active tab.
- Group IDs are unique; moving a tab does not change its view ID, service instance or canonical resource reference.
- No view is simultaneously docked and floating. Floating workbench windows reuse their layout root rather than presenting a duplicate graph.
- Undo and reload restore tab placements, order, active group/selection, split ratios, floating roots and window geometry together.
- Closing the last visible tab must respect unsaved resource buffers; disposing the tab need not dispose its shared plugin service.
- A disabled/uninstalled plugin must yield a recoverable placeholder and preserve layout references until the user explicitly removes them (future production acceptance gate).

## Production implementation authority

Dockview already provides tabbed groups, drag/drop between groups, edge docking, floating groups, popouts and serialization. Use **`dockview-react` as the sole authoritative browser docking engine**, mediated by a Wrkbench `WindowManager`/`DockviewAdapter`. Do **not** keep a second independently mutating React split tree alongside Dockview; that would lead to divergent selection, tab membership and undo state. Persist versioned Dockview snapshots plus Wrkbench-specific view IDs and contexts. Treat `api.toJSON()` / `api.fromJSON()` as layout serialization, with app-level reconciliation and permission checks around them.

The locally bundled prototype still uses the isolated custom layout adapter because offline dependencies are unavailable. This is a **verified interaction reference, not proof of Cordis/Dockview implementation or Phase 1 acceptance**.

Reference: https://dockview.dev/docs/core/overview/ ; https://dockview.dev/docs/core/dnd/overview/ ; https://dockview.dev/docs/core/groups/floatingGroups/ .

## Test matrix

| Test | Expected |
|---|---|
| Drop tab on another tab bar | Tab inserted at pointer position, selected, no duplicates |
| Drop on another panel's center | Tab merges into target group |
| Drop on target edge | Group split; both group tab bars remain visible |
| Move last tab out | Source group remains as empty drop target |
| Drag within same group | Stable tab reorder without unmounting service |
| Drag to floating group | Original tab instance appears in floating group's tab bar |
| Dock from floating | Tab returns to group, no stale floating copy |
| Split floating group | Floating window hosts two nested tab groups |
| Move across workbenches | Tab transferred; inherited context recomputed; explicit overrides survive |
| Undo/restore | Whole presentation graph is restored consistently |
| Close dirty tab | No silent data loss; shared document state remains authoritative |
| Disabled plugin / missing engine | Recoverable placeholder, not crash or lost layout |
| Keyboard-only | Moving between groups without mouse remains possible |


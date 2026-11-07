# Wrkbench — dark contrast theme revision

**Source target:** React 19 + Cordis 4 + Dockview 8; architectural stack unchanged.

## Design change

| Layer | Dark | Light |
| --- | --- | --- |
| Exterior app chrome (title bar, activity bar, status bar) | `#242424` neutral gray | `#ededed` soft gray |
| Raised workspace canvas | `#000000` true black | `#fbfbfb` off-white |
| Dockview/editor content surface | `#000000` true black | `#ffffff` white |
| Nested controls / inactive surfaces | `#101010` to `#252525` | `#f4f4f4` to `#e5e5e5` |
| Semantic colors | Retained for status, code, terminal | Retained |

The previously used gradient on the main workspace is removed to guarantee a true-black surface. The light theme and content colors are otherwise unchanged. The viewport body matches the shell to prevent an unwanted black flash.

## Build status

The application source imports the real React 19, Cordis and Dockview libraries. A proper compiled file **cannot be produced in the current environment** because npm registry DNS resolution fails (`EAI_AGAIN`) and packages are not preinstalled. This source package intentionally does not claim a successful dependency installation or browser execution.

Once dependencies are available: `bun install && bun run typecheck && bun run build:single`. The existing `scripts/inline-html.mjs` checks that scripts, styles, and Monaco workers are embedded. The output is `Wrkbench_React19_Single.html` if the build and closure checks succeed.

The separately provided `Wrkbench_Dark_Contrast_Preview.html` is an **older offline React 16 interaction prototype**, not the compiled React 19 application. It is provided solely to preview the requested colors and is never included under the real-app compilation label.

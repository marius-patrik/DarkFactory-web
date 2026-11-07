# Wrkbench · React 19 Pages preview

This branch contains the React 19/Cordis/Dockview application source in `next/`.

The workflow `.github/workflows/wrkbench-pages-preview.yml` builds the actual
React 19 app and deploys it to GitHub Pages, when Pages is configured to use
**GitHub Actions** in the repository's settings.

Target URL: https://marius-patrik.github.io/Wrkbench/

Publication is not confirmed until the deployment succeeds and the site is
accessible. The older React 16 mockup is not used as the deployment.

Local commands:

```bash
cd next
bun install
bun run test:core
bun run build
bun run preview
```

Phase 1 remains incomplete. Disconnected external providers are not simulated
as working integrations.

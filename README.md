# PrivShare

Local-first, privacy-respecting group expense splitter. PWA. No servers. No internet calls after install. Direct device-to-device sync over LAN via WebRTC.

> **M0 status:** project skeleton. Plan is in [`PLAN.md`](./PLAN.md). Architectural decisions are in [`docs/adr/`](./docs/adr/).

## Quickstart (Codespaces)

```bash
npm install
npm run dev          # http://localhost:5173/privatesplit/
npm run test         # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright)
npm run typecheck    # TypeScript strict-mode check
npm run lint         # ESLint
npm run build        # production build to dist/
```

## What this is

A two-person closed-group expense tracker that does what Splitwise does but stores everything on your device and syncs only over your local WiFi. See [`PLAN.md`](./PLAN.md) §1 for the full audience and scope.

## What this is NOT

- Not a SaaS. There are no accounts, no cloud, no third-party servers.
- Not a stranger-onboarding product. v1 targets a household of two people.
- Not encrypted at rest in v1 (your IndexedDB is plaintext on a trusted device; encryption-at-rest is a v2 concern).

## Privacy guarantees

After install, the service worker (`public/service-worker.js`) blocks every non-same-origin fetch with HTTP 599 ("Cross-Origin Blocked"). Verifiable in two ways:

1. Open DevTools → Network, attempt `fetch('https://example.com')` from the page console — observe the 599 response.
2. Run the E2E suite: `npm run test:e2e` — `service-worker-blocks-internet.spec.ts` asserts the same.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which type-checks, lints, tests, builds, and publishes `dist/` to GitHub Pages. The deployed URL is `https://phonepvr.github.io/privatesplit/`.

PRs and feature branches run `.github/workflows/ci.yml` (typecheck, lint, format check, unit, build, E2E).

## License

MIT — see [`LICENSE`](./LICENSE).

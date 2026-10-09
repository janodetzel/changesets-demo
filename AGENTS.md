# AGENTS.md

pnpm workspace (pnpm via `packageManager`, Node ≥ 22): `apps/web`, `apps/admin`, `apps/api` and `packages/ui`. The release flow is described in `README.md`.

- Install: `pnpm install --frozen-lockfile`
- Checks: `pnpm build && pnpm test`
- Every PR needs a changeset: `pnpm changeset`, or `pnpm changeset --empty` for changes that release nothing. Never edit a `version` or a `CHANGELOG.md` by hand.
- Branches: `feature/*` into `dev` (squash), `hotfix/*` into `main`. Never merge the Version Packages PR, and never approve the `staging` or `production` environments: that's the maintainer's job.
- Release scripts live in `scripts/`; the workflows in `.github/workflows/` call them.

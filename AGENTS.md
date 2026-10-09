# AGENTS.md

pnpm workspace (pnpm via `packageManager`, Node ≥ 22): `apps/web`, `apps/admin`, `apps/api`, `packages/ui` and `packages/flags`. The release flow is described in `README.md`.

- Install: `pnpm install --frozen-lockfile`
- Checks: `pnpm build && pnpm test`
- Trunk-based: branch from `main`, PR into `main`, squash merge.
- Every PR needs a changeset: `pnpm changeset`, or `pnpm changeset --empty` for changes that release nothing. A PR that only touches `flags/` needs none. Never edit a `version` or a `CHANGELOG.md` by hand.
- Unfinished work goes behind a feature flag (`@demo/flags`), off in production, instead of waiting on a branch.
- Never merge the Version Packages PR or approve the `production` environment: that's the maintainer's job.

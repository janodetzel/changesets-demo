# EMP release-flow demo

The repository is the demo. Use Nx Release for versions and changelogs, and GitHub Actions, artifacts, Environments, and Releases for delivery. Keep custom glue limited to release-note presentation and CI checks.

- Node 24 in CI, pnpm version from `package.json`.
- `pnpm install --frozen-lockfile && pnpm build && pnpm test && pnpm test:acceptance`.
- Domain source lives in `domains/billing`, `domains/payment`, and `domains/wingman`.
- Shared code is bundled by esbuild, so promotion needs no install or rebuild.
- `.github/domain-paths.yml` selects domain release workflows. Update consumer mappings when adding shared build dependencies.
- Feature merges deploy to DEV. Preparation merges build pinned candidates without touching DEV, then request manual STAGE and PROD approval. Integration and release flows have separate per-domain concurrency groups.
- `deploy-dev.yml` and `release.yml` are separate entry points. Share building and selection through reusable workflows; keep STAGE and PROD in the same release run.
- Deployments execute artifact tests and record GitHub Environment deployments. They simulate infrastructure deployment.
- No dashboard, custom state database, release engine, or feature flags.
- Add a new `.nx/version-plans/*.md` file for release-relevant changes using `pnpm release:plan`. Include shared-library consumers. Nx owns versions and `CHANGELOG.md`; do not edit them manually after initial setup.
- Never approve a production environment, push, publish, or dispatch a deployment unless requested.

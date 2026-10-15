# EMP release-flow demo

The repository is the demo. Nx Release updates domain manifests; `scripts/rc.mjs` applies the growing-RC policy and cumulative notes. GitHub handles delivery and approvals.

- Node 24 in CI, pnpm version from `package.json`.
- `pnpm install --frozen-lockfile && pnpm build && pnpm test && pnpm test:acceptance`.
- Domain source lives in `domains/billing`, `domains/payment`, and `domains/wingman`.
- Shared code is bundled by esbuild, so promotion needs no install or rebuild.
- `.github/domain-paths.yml` selects domain release workflows. Update consumer mappings when adding shared build dependencies.
- `.github/release-paths.yml` selects application SemVer impact separately. Release tooling and build-only changes must not create service release notes. RC counters reset per target and must avoid committed/tagged version collisions.
- Feature merges deploy to DEV. Preparation merges build pinned candidates without touching DEV, then request manual STAGE and PROD approval. Integration and release flows have separate per-domain concurrency groups.
- `deploy-dev.yml` and `release.yml` are separate entry points. Share building and selection through reusable workflows; keep STAGE and PROD in the same release run.
- Deployments execute artifact tests and record GitHub Environment deployments. They simulate infrastructure deployment.
- No dashboard, custom state database, release engine, or feature flags.
- Use Conventional Commit PR titles and exactly one Release note section. Include compatibility or migrations in that note when relevant. Squash merges must preserve title and description. No version-plan files. The commit bump applies to every affected domain from the shared path map. Nx writes versions; the RC adapter writes cumulative changelogs.
- RC records in `releases/*.json` accumulate unshipped changes against stable GitHub Release metadata. Never rewrite an existing candidate artifact or finalize a superseded RC. Stable records reference the accepted executable digest without rebuilding it.
- Never approve a production environment, push, publish, or dispatch a deployment unless requested.

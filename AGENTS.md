# EMP release-flow demo

The repository is the demo. Use standard GitHub Actions, artifacts, Environments, and Releases. Keep custom release tooling out of the project.

- Node 24 in CI, pnpm version from `package.json`.
- `pnpm install --frozen-lockfile && pnpm build && pnpm test && pnpm test:acceptance`.
- Domain source lives in `domains/billing`, `domains/payment`, and `domains/wingman`.
- Shared code is bundled by esbuild, so promotion needs no install or rebuild.
- PR checks run unit tests. Post-merge DEV checks are followed by manual STAGE approval after team testing, then separate PROD approval.
- Deployments execute artifact tests and record GitHub Environment deployments. They simulate infrastructure deployment.
- No dashboard, custom state database, release engine, or feature flags.
- Update the domain's `RELEASE.md` with user-facing changes.
- Never approve a production environment, push, publish, or dispatch a deployment unless requested.

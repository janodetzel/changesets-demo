# EMP native Nx release demo

- The repository is the demo. Prefer native Nx Release/affected and standard GitHub Actions over custom release engines.
- Node 24 in CI, pnpm from `package.json`.
- Validate with `pnpm install --frozen-lockfile && pnpm build && pnpm test && pnpm test:acceptance` and actionlint.
- Native Nx Conventional Commits determine stable semantic versions and project changelogs. No formal RC versions, parallel bump calculator, commit scanner, migration boundary, or shipped-change ledger.
- `scripts/release-summary.mjs` is presentation-only and calls the public Nx changelog API.
- Feature merges deploy affected domains to DEV. Preparation merges build pinned versioned candidates without touching DEV. STAGE and PROD download the same artifact ID and require manual approval.
- The version tag reserves immutable source before candidate building; never move tags. A version may fail STAGE and never reach production. PROD uses the same artifact as STAGE.
- Keep deployment-history truth separate from release tag history. This demo simulates deployments and does not implement rollback/migration reconciliation.
- Do not push, approve production, publish packages, or dispatch deployments unless requested.

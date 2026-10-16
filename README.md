# EMP independent releases with native Nx

Native Nx Release owns Conventional Commit analysis, independent **stable SemVer**, and project changelogs. GitHub provides release-preparation PRs, immutable artifacts, environments, approvals, and deployment records. There are no formal RC versions, custom version calculators, commit parsers, candidate ledgers, or shipped-change databases.

Billing, Payment Provider, and Wingman are fictional sample services. Their deployment jobs execute bundled application tests on GitHub runners, not actual AWS infrastructure.

## Two flows

```text
Feature PR → squash main → Nx affected → build + deploy DEV
                       └→ Nx Release → preparation PR: versions + changelogs

Preparation merge → reserve version tag → build pinned artifact
                       ↓ manual STAGE approval
                    STAGE → automatic + manual tests
                       ↓ manual PROD approval
                    SAME artifact → PROD → GitHub Release
```

Preparation merges never deploy DEV. Integration and release workflows have separate per-domain concurrency groups. STAGE and PROD share the same immutable artifact ID. A pending Billing release does not block newer Billing integration on DEV or unrelated domain releases.

## Versions identify contents, not deployment success

| Version | Included code | Result |
| --- | --- | --- |
| Wingman 1.0.0 | Existing cities | PROD |
| Wingman 1.1.0 | Hamburg | Rejected on STAGE |
| Wingman 1.2.0 | Hamburg + Berlin | Next production candidate |

Production can skip 1.1.0. The 1.2.0 approval summary shows **all changes from the last successful production deployment**, including Hamburg and Berlin, using Nx's changelog API. No version is renamed, finalized, or rebuilt after acceptance.

Tags reserve immutable versions when the preparation merge reaches the build job, before build checks. A failed build still consumes its version. GitHub Releases are created after successful production smoke checks. A tag by itself is not proof of deployment.

Nx reads the latest version tag, including reserved versions that never reached production, when calculating the next version. Therefore a patch after rejected 1.1.0 becomes 1.1.1, and another minor feature becomes 1.2.0. This is deliberate standard-tool behavior.

## Contributor input

Use precise Conventional Commit PR titles and squash merge:

```text
feat(wingman): add Berlin to supported cities
fix(payment): preserve refunded cents
feat(billing)!: remove the legacy invoice response
```

`feat` requests minor, `fix` patch, and `!` or `BREAKING CHANGE:` declares major. Other types follow Nx's native defaults. The maintained `amannn/action-semantic-pull-request` action validates title syntax under the historical required-check name `changeset`. No changeset files or mandatory Markdown description sections exist. Preserve PR descriptions in squash commits for human context, but native changelogs primarily display commit subjects and references.

Scopes label the change; Nx project changes and its dependency graph associate changes with projects. Review actual compatibility and generated changelogs. A syntactically correct title cannot prove a safe SemVer classification. Shared dependency and root configuration changes can conservatively affect several projects under Nx defaults. Configure native Nx inputs when necessary rather than introducing another release-impact engine.

## Preparation automation

`Prepare semantic releases` executes:

```sh
pnpm exec nx release --skip-publish
```

Nx writes independent package versions and changelogs. `peter-evans/create-pull-request` opens or updates `release/versions`. One shared preparation PR can reserve several domain versions; deployments remain independently approved.

Generated notes include Nx's contributor attribution and PR/commit references. Squash subjects should retain their `(#PR-number)` suffix so Nx can render PR links. Authors use recorded Git identities; automatic username lookup is disabled to avoid an additional external identity service. No custom author or PR lookup is required.

Preparation pushes may contain only domain manifest version fields and changelogs. Mixing source, dependencies, or workflow changes with version reservation is rejected rather than bypassing DEV. Keep preparation PRs up to date before merging.

Nx uses tags to calculate versions. If a previous preparation has not yet registered its tag, the preparation job stops and explains that it must be retried after the release build starts. Full history and tags are fetched. Never move or reuse a version tag.

## What cumulative notes compare

The small `scripts/release-summary.mjs` adapter:

1. Reads GitHub deployment statuses for `prod-<domain>`.
2. Finds the latest deployment whose current status is successful, ordered by deployment ID rather than version.
3. Passes that source SHA and the pinned candidate SHA to the **public Nx changelog API**.
4. Formats Nx's output for the preparation PR and artifact summaries.

This handles a skipped version and a recorded rollback to an earlier version. It does not assume the highest tag is running. No successful deployment means an explicitly labeled initial comparison. Missing source history and API access errors fail visibly rather than silently choosing a tag baseline.

The artifact records this baseline in `baseline.json`, covered by its checksums. Before production deployment, the workflow checks that the baseline still matches. If it changed, rebuild and review the candidate notes before retrying. Repeating a successful deployment of the same source/version is allowed; stable release checksums cannot be replaced by different contents.

Deployment statuses describe workflow outcomes. A physical deployment that partially changes infrastructure before failure can diverge from the recorded successful baseline. Reconcile such incidents explicitly. This demo does not implement distributed transactions, rollback orchestration, database recovery, or continuous runtime inventory.

## Registry packages

`domains/billing/packages/billing-api` models EMP's per-domain contract packages on a greenfield: the domain's public contract, published to GitHub Packages as `@janodetzel/billing-api` so other repositories can install it. The deployable domain stays private.

Each domain is a **fixed Nx release group**: the deployable and its contract packages share one version, one `<domain>@v<version>` tag, and one preparation entry. `billing 1.3.0` means the deployed service and the published `billing-api@1.3.0` describe the same contract; there is no second version space per domain to reconcile. A contract-only change still produces a full domain release candidate, because the domain's public interface changed.

One release decision, two outputs: merging the preparation PR runs the domain pipeline, which reserves the group tag, builds the deploy artifact, and publishes the packages. Publishing is **not** gated by STAGE/PROD approvals, deliberately: registry versions are immutable and consumers opt in by upgrading, while deployments change shared environments. Consumers can build against a new contract before the matching service is approved to production; what is actually running remains the deployment record's job, never the registry's. A replayed workflow skips an already-published version instead of replacing its contents.

Consumers configure the scope once in their `.npmrc`:

```text
@janodetzel:registry=https://npm.pkg.github.com
```

## GitHub setup

- Squash merges only; preserve PR title and description.
- Require `test` and `changeset` checks, and keep preparation PRs up to date.
- Allow Actions to create PRs. Optional `RELEASE_PR_TOKEN` can trigger bot-PR checks automatically; otherwise approve those workflows or close/reopen the PR as maintainer.
- Required reviewers on `stage-billing`, `stage-payment`, `stage-wingman`, and corresponding `prod-*` environments. DEV is automatic.
- Restrict deployment branches to main. Permit self-review for a one-person demonstration.
- Workflows request `deployments: read` for cumulative notes, contents write for tags/releases, actions write for preparation refresh after production, and packages write for registry publication.

DEV selection uses `nx show projects --affected --base=<push-before> --head=<push-after> --json`. Only affected deployable domains run. Shared library consumers come from Nx's graph. Candidate selection uses changed domain versions, not readiness inferred from affected projects.

## Retained history and migration

Old custom RC JSON files and migration-boundary logic are removed. Existing GitHub Releases, tags, and domain changelogs remain unchanged. Native Nx can interpret historical commit impact differently from the previous scanner; review the first generated preparation carefully.

Historical RC tags are also preserved. The current repository has a higher stable tag for each historical RC, so Nx starts its next stable version from that stable tag. Do not reintroduce `--preid rc`. A repository with a later unfinalized RC requires an explicit one-time version choice through Nx before adopting this stable-only flow; do not strip suffixes or rewrite old tags blindly.

Open `docs/release-guide.html` directly in a browser for inline workflow diagrams, a production-to-candidate comparison, and interactive scenarios. It is self-contained, explains the current stable-version flow, and reads no live deployment state.

## Verify locally

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm test:acceptance
pnpm exec nx release --skip-publish --dry-run
```

`pnpm release:prepare` modifies generated files. Use a disposable checkout or branch. The summary requires `GITHUB_REPOSITORY` and `GH_TOKEN`, or `DEPLOYMENT_BASELINES` pointing to an offline JSON map such as `{ "wingman": { "id": 1, "sha": "<full-sha>", "version": "1.0.0" } }`.

Artifacts expire after 90 days and approval runs can expire earlier. GitHub concurrency has a limited pending queue and does not guarantee FIFO. A rejected candidate does not roll STAGE back. New integrated code remains cumulative: fix/revert unsafe features or explicitly assemble and retest a selective candidate. Independent domains still require compatible APIs, events, migrations, and mixed-version tests in actual EMP.

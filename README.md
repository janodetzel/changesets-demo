# EMP independent releases from Conventional Commits

Feature PRs integrate on `main` and deploy affected domains to DEV. Squash commit titles and descriptions supply release intent. An automated preparation PR groups that immutable history into growing per-domain release candidates. Accepted candidates become stable releases without rebuilding the application artifact.

There are **no Changesets or Nx version-plan files**. Nx updates domain manifests through its Release API. GitHub handles PRs, artifacts, approvals, and release records. `scripts/rc.mjs` implements the growing-RC lifecycle around those tools.

## Write one release description: the PR

Use a Conventional Commit title and one Release note section in the description. There is deliberately no automatic PR template: GitHub can append that template to release notes already prefilled from a commit body.

```text
feat(wingman): add Berlin to supported cities
```

```markdown
## Release note

Add Berlin to the supported cities.

Backward compatible. No migration required.
```

| Title or footer | Release impact |
| --- | --- |
| `feat: ...` | Minor |
| `fix: ...`, `perf: ...`, `refactor: ...`, `revert: ...` | Patch |
| `feat!: ...`, `fix(scope)!: ...`, or a `BREAKING CHANGE:` footer | Major |
| `docs`, `test`, `ci`, `chore`, `build`, `style` | No application bump unless explicitly breaking |

Runtime source or domain dependency changes cannot be labeled as no-release chores. PR validation checks this, requires exactly one non-empty **Release note** section when needed, and reruns on description edits. Include compatibility and migration details in that note when relevant. It retains the required check name `changeset` for compatibility with existing branch rules; the name no longer implies plan files.

When opening a PR, retain the prefilled release note if it came from the commit body, or add the section manually. Existing PR descriptions are not changed by deleting the template; remove any previously appended duplicate sections once.

The optional scope is a human label. **Changed paths determine affected domains**, using `.github/domain-paths.yml`. For example, a `fix(money): ...` commit touching `packages/money/**` gives Billing and Payment a patch bump, but not Wingman. One commit has one bump, applied to all consumers. If domains genuinely need different bumps, split the PRs or accept the conservative shared bump; per-domain override syntax is not implemented.

## Configure squash merges correctly

In **Settings → General → Pull Requests**, allow squash merging and select **Default commit message → Pull request title and description**. Keep normal merges and rebase merges disabled for this demo. At merge time, preserve the validated title, the Release note section, breaking-change footer if present, and the PR number suffix.

This setting must be configured by a repository administrator; changing workflow files does not set GitHub's merge defaults. The current CLI credential cannot inspect or update all repository administration settings. PR checks validate the proposed title and body, but a maintainer can still edit the squash message in GitHub's merge dialog. Preparation fails visibly if an affected commit lacks valid metadata; it does not silently omit runtime changes. Do not amend published integration history to fix descriptions; correct the release process before retrying and reconcile malformed history explicitly if needed.

The squash **commit** is the historical source of truth. Editing or deleting a PR description after merge cannot rewrite release notes. The Release note is extracted; older commits' optional Compatibility and migrations sections remain supported. PR numbers in the squash title become links.

## Growing RCs: Hamburg, then Berlin

With production on Wingman 1.0.0:

1. Merge `feat(wingman): add Hamburg ...`; DEV updates and preparation proposes `1.1.0-rc.1`.
2. Merge the preparation PR; the candidate builds from that exact commit without a DEV deployment.
3. Approve STAGE, discover an issue, and reject or leave PROD unapproved.
4. Merge `feat(wingman): add Berlin ...` or a compatible fix. The next preparation proposes `1.1.0-rc.2`.
5. The notes show one cumulative list: **Hamburg + Berlin since production**.
6. Fresh STAGE validation and PROD approval finalize stable 1.1.0, pointing to the accepted executable artifact unchanged.

Compatible additions and fixes join the active target. A breaking stable contract escalates the major target. After stable 1.1.0, a patch targets 1.1.1 and a minor addition targets 1.2.0. Candidate sequence numbers keep increasing per domain across targets to avoid name reuse.

Scanning history again without new release-relevant commits does not create another RC. Shipped change IDs are excluded when calculating the next target. A shared preparation PR can prepare multiple domains, but each domain's approvals and production version remain independent.

## Workflow responsibilities

```text
Feature PR → squash to main → Deploy DEV → manual integration tests
                      └──→ Prepare semantic releases → review preparation PR

Preparation merge → Release domains → build pinned RC
                                      ↓ approve STAGE
                                    STAGE tests + manual tests
                                      ↓ approve PROD
                                    same artifact to PROD → stable GitHub Release
```

DEV and candidate flows have separate per-domain locks. A pending release does not prevent later integration. STAGE and PROD stay in one run and download the same artifact ID. Production rejects an RC superseded in the current main record or based on a changed production baseline.

Preparation PRs contain only version fields, changelogs, and `releases/*.json` records. Structural checks identify generated preparation commits so their non-conventional titles do not cause recursive application releases. They cannot hide dependency or script changes behind a version update.

## History and migration

`release-input.json` pins an **exclusive** commit boundary at the last plan-based preparation before this migration. Older immutable RC records and stable release metadata are retained, including their plan-derived change IDs. New changes use `commit:<full SHA>:<domain>` identities and are scanned on the first-parent integration history after that boundary. Do not advance the boundary to suppress unwanted changes.

Earlier non-conventional titles such as “Add Oslo” are not reparsed or duplicated. Their descriptions already survive in plan-era RC and stable records. The first commit-based RC can combine any unshipped legacy changes with new commit-based changes. Stable records carry the cumulative shipped IDs across the migration.

All history is scanned from the fixed boundary, not merely since the most recent push or successful preparation. Failed preparation runs therefore cannot lose a change. Commit detection includes additions, deletions, renames as old/new paths, and shared-library consumers. No GitHub PR API lookup is needed for historical notes. Keep `fetch-depth: 0` for preparation and selection.

## Stable production truth

Stable GitHub Releases `<domain>@v<version>` establish the production baseline. Their `release.json` identifies the accepted RC, source SHA, executable digest, artifact ID, and cumulative shipped IDs. Manifests on main stay at the latest RC after finalization; no stable-version bot commit redeploys DEV.

STAGE creates a GitHub prerelease after automatic acceptance passes. Failed STAGE runs remain in Actions. PROD smoke success creates the stable release record and refreshes preparation. Rejecting approval does not undo a STAGE deployment. The whole cumulative changelog is attached to the stable release.

## Required GitHub settings

- Required reviewers for `stage-billing`, `stage-payment`, `stage-wingman`, and corresponding `prod-*` environments. DEV environments need no reviewers.
- Restrict deployment branches to main. Leave self-review prevention off for a one-person demonstration.
- Allow Actions to create PRs. Optional `RELEASE_PR_TOKEN` supports bot PR checks; otherwise a maintainer may need to approve checks or close/reopen the preparation PR.
- Require `test` and `changeset` checks; keep preparation PRs up to date.
- Configure squash defaults to preserve the full PR title and description as described above.

## Local checks and code

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm test:acceptance
```

Preparation modifies generated files; test it in a disposable checkout. It requires `GH_TOKEN` and `GITHUB_REPOSITORY`, or an `RC_BASELINES` fixture for isolated testing.

- `scripts/commit-changes.mjs`: standard Conventional Commit parser, description extraction, and path-to-domain mapping.
- `scripts/rc.mjs`: growing target, cumulative/delta records, Nx manifest updates, finalization preflight.
- `scripts/release-notes.mjs`: PR validation, push classification, and artifact-note presentation.
- `.github/workflows/`: separate DEV and candidate workflows, shared builds, approvals, and preparation automation.
- `docs/release-guide.html`: interactive explanation with fictional scenarios, not a deployment controller.

Versions and release notes describe contents; they do not exclude unsafe features from a bundle. Fix or revert unsafe integrated behavior, or assemble and retest a selective candidate explicitly. The sample domains have no cross-service runtime dependencies; actual EMP services need contract and mixed-version tests.

Deployments are simulated on GitHub runners, not physical AWS environments. Artifacts expire after 90 days; approval runs can expire earlier. GitHub concurrency is not a durable FIFO queue. Preparation and physical deployment are not one atomic transaction; partial infrastructure changes or a failed final record step need operational reconciliation.

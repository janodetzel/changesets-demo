# changesets-demo

A pnpm workspace that shows how [changesets](https://github.com/changesets/changesets) drive **selective, gated deploys** through three environments: every package is versioned and deployed on its own, and only the packages a release actually bumps go to staging and production.

Deploys are **simulated**: each deploy job runs in a GitHub environment (so GitHub records a deployment) and logs the packages it would ship in the job summary.

## The workspace

| Package | Path | Depends on |
| --- | --- | --- |
| `@demo/ui` | `packages/ui` | — |
| `@demo/web` | `apps/web` | `@demo/ui` |
| `@demo/admin` | `apps/admin` | `@demo/ui` |
| `@demo/api` | `apps/api` | — |

A change to `@demo/ui` also bumps and redeploys `web` and `admin` (changesets' `updateInternalDependencies`). A change to `api` ships `api` alone.

```sh
pnpm install
pnpm build && pnpm test
pnpm changeset            # describe your change: packages, bump type, summary
pnpm changeset --empty    # docs, CI and other changes that release nothing
```

## Branches

| Branch | Role | Merge method |
| --- | --- | --- |
| `feature/*` | one change, PR into `dev` | squash |
| `dev` | integration; deploys to **development** on every merge | — |
| `changeset-release/dev` | the **Version Packages** PR: `main` plus the unreleased commits from `dev` | merge commit into `main` |
| `main` | production; every version here is tagged and released | — |
| `hotfix/*` | urgent fix, PR into `main` | merge commit |

Rulesets enforce the merge methods, and **every PR needs a changeset** (the `changeset` check). The `PR checks` workflow also rejects a PR that doesn't follow the flow (for example `feature/*` into `main`).

## The flow

```mermaid
flowchart LR
  F[feature/*] -- "squash PR + changeset" --> D[dev]
  D -- "deploy changed packages" --> DEV[(development)]
  D -- "cherry-pick unreleased commits onto main" --> V[Version Packages PR]
  V -- "build, test, approve staging" --> STG[(staging)]
  V -- "merge commit" --> M[main]
  M -- "tag + GitHub release" --> T[name@version]
  T -- "approve production" --> PROD[(production)]
  M -- "back-merge" --> D
  H[hotfix/*] -- "merge commit + changeset" --> M
```

1. **Feature → dev.** Open a PR from `feature/<something>` into `dev` with a changeset, and squash-merge it: one PR becomes one commit on `dev`. The `Dev` workflow deploys the packages the merge changed (plus their dependents) to **development** and rebuilds the Version Packages PR.
2. **Version Packages PR.** The `Release PR` workflow builds the branch `changeset-release/dev` **from `main`**: it cherry-picks every commit on `dev` that hasn't been released yet, runs `changeset version`, and keeps one PR into `main` up to date. Its description lists:
   - the releases with their changelog entries; each entry names the squash commit's short hash, the PR and its author ("Thanks @user!"), from [`@changesets/changelog-github`](https://github.com/changesets/changesets/tree/main/packages/changelog-github);
   - one checkbox per pending commit.
3. **Hold a commit back.** Tick its box in the PR description (or add the label `defer:<short-sha>`). The workflow rebuilds the PR without that commit: its **code and its changeset** stay in `dev` only, and it comes back in the next Version Packages PR. Because the choice lives in the description, not in the branch, it survives every rebuild.
4. **Staging gate.** The same workflow run builds and tests the release branch, then waits for approval of the **staging** environment and deploys the packages the PR bumps. Staging runs exactly what production will get.
5. **Release.** Merge the Version Packages PR into `main` with a merge commit. The `Production` workflow tags every new version (`@demo/ui@1.1.0`), creates a GitHub release with its changelog, and waits for approval of the **production** environment before deploying exactly those versions.
6. **Back-merge.** The same workflow merges `main` back into `dev`, so `dev` has the version commits, and removes the changesets that were released. Held-back commits and their changesets stay pending.

**Hotfix:** branch `hotfix/<something>` from `main`, add a changeset, and merge the PR into `main`. The `Production` workflow versions it on `main`, tags, waits for the production approval and back-merges into `dev`.

## Holding back, and its limit

Because the release branch is `main` plus cherry-picked commits, a held-back commit's code really stays out of the release, not just its version bump. The cherry-pick `-x` line ("cherry picked from commit …") records which `dev` commits are released.

The limit is dependencies between commits. A later commit that **doesn't apply** without a held-back one (it edits the same lines) is skipped too, and the **hold-back check** on the PR fails and names both: hold the later one back as well, or release them together. A dependency git can't see (a later commit calls a function the held-back one added) shows up when the workflow builds and tests the release branch, before staging.

When a feature is merged but must not go live for a while, a **feature flag** is still simpler than holding it back release after release.

## Setup (already done for this repo)

- Merge methods: squash and merge commit (rebase off), branches deleted after merge, default branch `dev`.
- Actions may create pull requests (Settings → Actions → General).
- Rulesets:
  - `dev`: PR required, squash only, required check `changeset`;
  - `main`: PR required, merge commit only, required checks `changeset` and `hold-back`.

  Both allow GitHub Actions to bypass, for the back-merge and the hotfix version commit.
- Environments: `development` (no gate), `staging` and `production` (required reviewer).

## Notes

- The changelog credits the author of the PR (or commit) that added the changeset, not whoever merged it.
- The release workflow pushes with the workflow token, which doesn't trigger other workflows. That's why it posts the `changeset` and `hold-back` results on the Version Packages PR as commit statuses itself, and why the back-merge starts the `Release PR` workflow explicitly.

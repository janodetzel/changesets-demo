## Release note

Describe the user-visible change. This text becomes part of the squash commit and release notes.

## Compatibility and migrations

State backward compatibility, breaking changes, and required migrations. Use `!` in the PR title or a `BREAKING CHANGE:` footer for an incompatible stable contract change.

## Validation

Describe the checks and manual tests performed.

<!-- PR title: feat(wingman): add Berlin to supported cities
     fix = patch, feat = minor, ! or BREAKING CHANGE: = major.
     perf/refactor/revert = patch when they affect a domain build.
     docs/test/ci/chore = no application release; do not use these to hide runtime changes.
     Domain selection comes from changed paths, not the title's scope.
     Squash merge with the PR title and full description. No version-plan file is needed. -->

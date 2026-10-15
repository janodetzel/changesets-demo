# Version plans

Run `pnpm release:plan` in each feature PR. Choose the affected domain and its bump type, then describe the change, link its PR or work item, and mention compatibility or migration requirements.

Use separate files for unrelated changes. A minor change and a patch change to Billing combine into one minor release. Include both Billing and Payment when shared `@emp/money` behavior changes. Domain services have independent versions; the internal money library is bundled and not published separately.

The RC adapter consumes plans in the automated `release/versions` PR, using Nx to write package versions and recording cumulative changes in domain changelogs and `releases/*.json`. Consumption means included in an RC, not deployed to PROD. Compatible changes can join an active target; stable finalization uses the accepted artifact without rebuilding.

Do not edit generated versions or changelogs in feature PRs. The initial major plans establish 1.0.0 from the 0.0.0 migration marker, not a breaking change in deployed behavior.

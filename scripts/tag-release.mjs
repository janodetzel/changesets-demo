// Runs on main after a release or hotfix: tags every package version that has no
// tag yet (`changeset git-tag`), pushes the new tags, creates a GitHub release per
// tag with its changelog section, and writes the new "name@version" list to the
// job output `released` for the production deploy.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { latestChangelogSection } from "./lib/changelog.mjs";
import { workspacePackages } from "./lib/workspace.mjs";

const run = (cmd, args, options = {}) => (execFileSync(cmd, args, { encoding: "utf8", ...options }) ?? "").trim();
const repo = process.env.GITHUB_REPOSITORY;

run("git", ["fetch", "--tags", "--force", "origin"]);
const before = new Set(run("git", ["tag", "--list"]).split("\n").filter(Boolean));
run("pnpm", ["exec", "changeset", "git-tag"], { stdio: ["ignore", "inherit", "inherit"] });
const created = run("git", ["tag", "--list"]).split("\n").filter((tag) => tag && !before.has(tag));

const packages = workspacePackages();
for (const tag of created) {
  run("git", ["push", "origin", `refs/tags/${tag}`]);
  const name = tag.slice(0, tag.lastIndexOf("@"));
  const dir = packages.find((pkg) => pkg.name === name)?.dir;
  const notes = (dir && latestChangelogSection(dir)) || "No changelog entry.";
  run("gh", ["release", "create", tag, "--repo", repo, "--title", tag, "--notes", notes, "--verify-tag"]);
  console.log(`tagged and released ${tag}`);
}
if (created.length === 0) console.log("No new versions to tag.");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `released=${created.join(" ")}\n`);

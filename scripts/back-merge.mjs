// Runs on a checkout of dev after a release or hotfix reached main: merges main
// into dev, so dev has the version commits, and deletes the changesets main has
// released. (A released commit reached main as a cherry-pick, so git keeps its
// changeset file in dev.) The deletion goes into the merge commit itself: merge
// commits are never cherry-picked into a release, a separate commit would be.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { pendingCommits } from "./lib/commits.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const isAncestor = (a, b) => {
  try {
    git("merge-base", "--is-ancestor", a, b);
    return true;
  } catch {
    return false;
  }
};

git("fetch", "origin", "main");
if (isAncestor("origin/main", "HEAD")) {
  console.log("dev already contains main.");
  process.exit(0);
}
git("merge", "--no-ff", "--no-commit", "origin/main");

const pending = new Set(pendingCommits("origin/main", "HEAD").flatMap((commit) => commit.changesets));
const released = readdirSync(".changeset").filter(
  (file) => file.endsWith(".md") && file !== "README.md" && !pending.has(file.slice(0, -3)),
);
if (released.length > 0) git("rm", "--quiet", ...released.map((file) => `.changeset/${file}`));
git("commit", "--no-edit", "-m", "Merge main into dev after a release");
console.log(`Merged main into dev; removed ${released.length} released changeset(s); ${pending.size} still pending.`);

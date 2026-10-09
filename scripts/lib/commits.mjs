// The commits on dev that haven't been released to main yet. The release branch
// cherry-picks dev's commits with `-x`, so every released commit is named by a
// "(cherry picked from commit <sha>)" line in main's history; hotfixes are on main
// itself. Merge commits (the back-merges) are left out. Oldest first.
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

export function pendingCommits(main = "origin/main", dev = "HEAD") {
  const released = new Set(
    [...git("log", "--format=%B", main).matchAll(/\(cherry picked from commit ([0-9a-f]{40})\)/g)].map((m) => m[1]),
  );
  const shas = git("log", "--reverse", "--no-merges", "--format=%H", `${main}..${dev}`)
    .split("\n")
    .filter((sha) => sha && !released.has(sha));
  return shas.map((sha) => ({
    sha,
    short: sha.slice(0, 7),
    subject: git("log", "-1", "--format=%s", sha),
    // The changesets the commit adds, by id (file name without .md).
    changesets: git("diff-tree", "--no-commit-id", "--name-only", "--diff-filter=A", "-r", sha, "--", ".changeset/")
      .split("\n")
      .filter((file) => /^\.changeset\/[^/]+\.md$/.test(file) && !file.endsWith("/README.md"))
      .map((file) => file.slice(".changeset/".length, -3)),
  }));
}

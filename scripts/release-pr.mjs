// Builds the Version Packages PR from dev into main. Runs in GitHub Actions on a
// full-history checkout of dev (see .github/workflows/release-pr.yml).
//
// The release branch is built from main, not from dev: every squash commit on dev
// that main doesn't have yet is cherry-picked onto it, except the ones held back.
// Then `changeset version` turns the picked commits' changesets into versions and
// changelogs. A held-back commit's code and changeset stay in dev only, and it
// comes back in the next Version Packages PR.
//
// Which commits are held back lives in the PR description (ticked boxes) and in
// `defer:<short-sha>` labels, never in the branch, so every rebuild keeps it.
// A commit that doesn't apply without a held-back one is skipped and fails the
// `hold-back` status, so nothing ships half.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { latestChangelogSection } from "./lib/changelog.mjs";
import { pendingCommits } from "./lib/commits.mjs";
import { workspacePackages } from "./lib/workspace.mjs";

const BRANCH = "changeset-release/dev";
const BASE = "main";
const repo = process.env.GITHUB_REPOSITORY;
const tmp = process.env.RUNNER_TEMP ?? "/tmp";

const run = (cmd, args, options = {}) => (execFileSync(cmd, args, { encoding: "utf8", ...options }) ?? "").trim();
const git = (...args) => run("git", args);
const gh = (...args) => run("gh", args);

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}

// --- 1. The open PR and its hold-back choices --------------------------------
const [pr] = JSON.parse(
  gh("pr", "list", "--repo", repo, "--head", BRANCH, "--base", BASE, "--state", "open", "--json", "number,body,labels"),
);
const held = new Set();
for (const match of (pr?.body ?? "").matchAll(/^- \[[xX]\] `([0-9a-f]{7})`/gm)) held.add(match[1]);
for (const label of pr?.labels ?? []) if (label.name.startsWith("defer:")) held.add(label.name.slice("defer:".length));

// --- 2. Commits on dev that main doesn't have --------------------------------
git("fetch", "origin", BASE);
const commits = pendingCommits(`origin/${BASE}`, "HEAD");
for (const commit of commits) {
  // The PR the squash commit came from, for the description.
  commit.source = commit.short;
  try {
    const [number, login] = gh("api", `repos/${repo}/commits/${commit.sha}/pulls`, "--jq", '.[0] | "\\(.number) \\(.user.login)"').split(" ");
    if (number && number !== "null") {
      commit.source = `#${number} by @${login}`;
      Object.assign(commit, { pr: number, author: login });
    }
  } catch {
    // Pushed without a PR: the hash is all there is.
  }
  // A label may name the commit's changeset instead of its hash.
  commit.held = held.has(commit.short) || commit.changesets.some((id) => held.has(id));
}

if (commits.length === 0) {
  console.log("dev has nothing that main doesn't.");
  if (pr) gh("pr", "close", String(pr.number), "--repo", repo, "--comment", "dev has nothing left to release: closing.");
  output("released", "");
  output("problems", "0");
  process.exit(0);
}

// --- 3. Rebuild the branch from main -----------------------------------------
git("checkout", "-B", BRANCH, `origin/${BASE}`);
const problems = [];
for (const commit of commits) {
  if (commit.held) continue;
  try {
    git("cherry-pick", "-x", commit.sha);
    commit.picked = true;
  } catch {
    git("cherry-pick", "--abort");
    const heldBefore = commits.filter((c) => c.held && commits.indexOf(c) < commits.indexOf(commit)).map((c) => `\`${c.short}\``);
    problems.push(
      `\`${commit.short}\` (${commit.subject}) doesn't apply without ${heldBefore.length ? heldBefore.join(", ") : "an earlier commit"}: hold it back too, or release them together.`,
    );
  }
}

// The changelog should name the squash commit on dev and its PR, not the
// cherry-pick (GitHub links no PR to a cherry-pick). @changesets/changelog-github
// reads `commit:`, `pr:` and `author:` lines from the changeset's summary.
for (const commit of commits) {
  if (!commit.picked) continue;
  for (const id of commit.changesets) {
    const file = join(".changeset", `${id}.md`);
    const [, frontmatter, summary] = readFileSync(file, "utf8").match(/^(---\n[\s\S]*?---\n)([\s\S]*)$/);
    const meta = [`commit: ${commit.sha}`, ...(commit.pr ? [`pr: #${commit.pr}`, `author: @${commit.author}`] : [])];
    writeFileSync(file, `${frontmatter}\n${meta.join("\n")}\n${summary.replace(/^\n+/, "")}`);
  }
}

const statusFile = join(tmp, "changeset-status.json");
run("pnpm", ["exec", "changeset", "status", `--output=${statusFile}`], { stdio: ["ignore", "ignore", "inherit"] });
const releases = JSON.parse(readFileSync(statusFile, "utf8")).releases.filter((release) => release.type !== "none");
if (releases.length > 0) run("pnpm", ["exec", "changeset", "version"], { stdio: "inherit" });
git("add", "-A");
git("commit", "--allow-empty", "-m", "Version Packages");
git("push", "--force", "origin", `HEAD:refs/heads/${BRANCH}`);
const head = git("rev-parse", "HEAD");

// --- 4. Description ------------------------------------------------------------
const packages = workspacePackages();
const lines = [
  "Maintained by the release workflow: it rebuilds this PR from `main` on every push to `dev` and whenever this description or its labels change. Merge it with a **merge commit**; production then waits for approval.",
  "",
  "## Releases",
  "",
];
if (releases.length === 0) lines.push("Nothing to release: every pending commit is held back or has an empty changeset.", "");
for (const release of releases) {
  const dir = packages.find((pkg) => pkg.name === release.name).dir;
  lines.push(`### \`${release.name}\` ${release.oldVersion} → ${release.newVersion}`, "");
  lines.push(latestChangelogSection(dir).replace(/^### /gm, "#### ") || "_No changelog entry._", "");
}
lines.push(
  "## Commits",
  "",
  "Tick a box to **hold that commit back**: its code and its changeset stay in `dev` and come back in the next Version Packages PR. A `defer:<short-sha>` label does the same.",
  "",
);
for (const commit of commits) {
  const state = commit.held ? " (held back)" : commit.picked ? "" : " (**skipped: doesn't apply**)";
  const changesets = commit.changesets.length ? commit.changesets.map((id) => `\`${id}\``).join(", ") : "no changeset";
  lines.push(`- [${commit.held ? "x" : " "}] \`${commit.short}\` ${commit.subject} (${commit.source}; ${changesets})${state}`);
}
lines.push("", "## Hold-back check", "");
if (problems.length) lines.push("❌ Some commits depend on held-back ones:", "", ...problems.map((p) => `- ${p}`));
else if (commits.some((c) => c.held)) lines.push("✅ Every commit that isn't held back applies on its own. Build and tests run on this branch before staging.");
else lines.push("Nothing held back.");
lines.push(
  "",
  "## Gates",
  "",
  "- **Staging:** the release workflow's run for this PR builds and tests this branch, then deploys the packages above once the `staging` environment is approved.",
  "- **Production:** after the merge, the production workflow deploys the new versions once `production` is approved.",
);

const bodyFile = join(tmp, "release-pr-body.md");
writeFileSync(bodyFile, lines.join("\n") + "\n");
const title = releases.length ? `Version Packages (${releases.length} package${releases.length === 1 ? "" : "s"})` : "Version Packages (nothing to release)";
let number = pr?.number;
if (pr) gh("pr", "edit", String(pr.number), "--repo", repo, "--title", title, "--body-file", bodyFile);
else number = gh("pr", "create", "--repo", repo, "--base", BASE, "--head", BRANCH, "--title", title, "--body-file", bodyFile).split("/").pop();

// --- 5. Statuses and outputs -----------------------------------------------------
const setStatus = (context, state, description) =>
  gh("api", `repos/${repo}/statuses/${head}`, "-f", `state=${state}`, "-f", `context=${context}`, "-f", `description=${description}`);
setStatus("changeset", "success", "The Version Packages PR consumes changesets");
setStatus(
  "hold-back",
  problems.length ? "failure" : "success",
  problems.length ? `${problems.length} commit(s) need a held-back commit: see the PR description` : "Every released commit applies on its own",
);

const versions = new Map(workspacePackages().map((pkg) => [pkg.name, pkg.version]));
output("pr", number);
output("problems", String(problems.length));
output("released", releases.map((release) => `${release.name}@${versions.get(release.name)}`).join(" "));

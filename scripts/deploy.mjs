// Simulated deploy: logs each app and writes a table to the job summary. The job
// around it runs in a GitHub environment, so GitHub records a deployment.
// Libraries (packages/*) aren't deployed: they ship inside the apps that use
// them, and a public one is published to a registry by `changeset publish`.
//   node scripts/deploy.mjs <environment> <name@version>...
import { appendFileSync } from "node:fs";
import { workspacePackages } from "./lib/workspace.mjs";

const [environment, ...targets] = process.argv.slice(2);
if (!environment) throw new Error("usage: deploy.mjs <environment> <name@version>...");
const packages = workspacePackages();
const lines = [`### Deployed to ${environment}`, ""];
const apps = [];
for (const target of targets) {
  const at = target.lastIndexOf("@");
  const [name, version] = [target.slice(0, at), target.slice(at + 1)];
  if (packages.find((pkg) => pkg.name === name)?.dir.startsWith("packages/")) {
    console.log(`${name}@${version} is a library: nothing to deploy.`);
  } else {
    apps.push([name, version]);
  }
}
if (apps.length === 0) {
  console.log(`No apps to deploy to ${environment}.`);
  lines.push("No apps to deploy.");
} else {
  lines.push("| App | Version |", "| --- | --- |");
  for (const [name, version] of apps) {
    console.log(`Deploying ${name}@${version} to ${environment}… done (simulated)`);
    lines.push(`| \`${name}\` | ${version} |`);
  }
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");

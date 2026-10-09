// Simulated deploy: logs each package and writes a table to the job summary. The
// job around it runs in a GitHub environment, so GitHub records a deployment.
//   node scripts/deploy.mjs <environment> <name@version>...
import { appendFileSync } from "node:fs";

const [environment, ...targets] = process.argv.slice(2);
if (!environment) throw new Error("usage: deploy.mjs <environment> <name@version>...");
const lines = [`### Deployed to ${environment}`, ""];
if (targets.length === 0) {
  console.log(`Nothing to deploy to ${environment}.`);
  lines.push("Nothing to deploy.");
} else {
  lines.push("| Package | Version |", "| --- | --- |");
  for (const target of targets) {
    const at = target.lastIndexOf("@");
    const [name, version] = [target.slice(0, at), target.slice(at + 1)];
    console.log(`Deploying ${name}@${version} to ${environment}… done (simulated)`);
    lines.push(`| \`${name}\` | ${version} |`);
  }
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");

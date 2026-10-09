// Prints the packages a range of commits touched, plus their dependents, one
// "name@version" per line. Used for the development deploy on every push to dev.
//   node scripts/affected.mjs <base-sha> <head-sha>
// A missing or all-zero base (first push) means every package.
import { execFileSync } from "node:child_process";
import { workspacePackages, withDependents } from "./lib/workspace.mjs";

const [base, head = "HEAD"] = process.argv.slice(2);
const packages = workspacePackages();
let touched;
if (!base || /^0+$/.test(base)) {
  touched = packages.map((pkg) => pkg.name);
} else {
  const files = execFileSync("git", ["diff", "--name-only", base, head], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  touched = packages.filter((pkg) => files.some((file) => file.startsWith(`${pkg.dir}/`))).map((pkg) => pkg.name);
}
const affected = withDependents(touched, packages);
for (const pkg of packages) if (affected.has(pkg.name)) console.log(`${pkg.name}@${pkg.version}`);

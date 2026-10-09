// "Builds" the package in the current directory: writes dist/build.json with its
// name and version. Stands in for a real bundler in this demo.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
mkdirSync("dist", { recursive: true });
writeFileSync("dist/build.json", JSON.stringify({ name: pkg.name, version: pkg.version }, null, 2) + "\n");
console.log(`built ${pkg.name}@${pkg.version}`);

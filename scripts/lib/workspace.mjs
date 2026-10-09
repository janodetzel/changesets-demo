// The workspace's packages and their internal dependencies, read from
// apps/*/package.json and packages/*/package.json (the globs in pnpm-workspace.yaml).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function workspacePackages(root = ".") {
  const packages = [];
  for (const group of ["apps", "packages"]) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const dir of readdirSync(groupDir)) {
      const file = join(groupDir, dir, "package.json");
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, "utf8"));
      packages.push({
        name: pkg.name,
        version: pkg.version,
        dir: `${group}/${dir}`,
        deps: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }),
      });
    }
  }
  return packages;
}

/** The names plus every package that depends on one of them, directly or transitively. */
export function withDependents(names, packages = workspacePackages()) {
  const result = new Set(names);
  let grew = true;
  while (grew) {
    grew = false;
    for (const pkg of packages) {
      if (!result.has(pkg.name) && pkg.deps.some((dep) => result.has(dep))) {
        result.add(pkg.name);
        grew = true;
      }
    }
  }
  return result;
}

/** The workspace packages a package depends on, directly or transitively. */
export function dependenciesOf(name, packages = workspacePackages()) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const result = new Set();
  const visit = (current) => {
    for (const dep of byName.get(current)?.deps ?? []) {
      if (byName.has(dep) && !result.has(dep)) {
        result.add(dep);
        visit(dep);
      }
    }
  };
  visit(name);
  return result;
}

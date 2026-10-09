// The newest section of a package's CHANGELOG.md, without its "## <version>" heading.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function latestChangelogSection(dir) {
  const file = join(dir, "CHANGELOG.md");
  if (!existsSync(file)) return "";
  const text = readFileSync(file, "utf8");
  const start = text.indexOf("\n## ");
  if (start < 0) return "";
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(text.indexOf("\n", start + 1) + 1, next < 0 ? undefined : next).trim();
}

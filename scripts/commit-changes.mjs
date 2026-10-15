// Conventional Commit syntax is parsed by the standard parser. This adapter
// assigns its single bump to every affected domain using the shared path map.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CommitParser } from 'conventional-commits-parser';
import picomatch from 'picomatch';
import { parse as yaml } from 'yaml';
import { isDeepStrictEqual } from 'node:util';

export const domains = ['billing', 'payment', 'wingman'];
const types = new Set(['feat', 'fix', 'perf', 'refactor', 'revert', 'docs', 'test', 'ci', 'chore', 'build', 'style']);
const parser = new CommitParser({ headerPattern: /^(\w+)(?:\(([^)]+)\))?!?: (.+)$/, headerCorrespondence: ['type', 'scope', 'subject'], noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'] });
const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const config = cwd => yaml(readFileSync(`${cwd}/.github/release-paths.yml`, 'utf8'));

export function parseMessage(message) {
  const parsed = parser.parse(message);
  if (!parsed.type || !types.has(parsed.type) || !parsed.subject?.trim()) throw new Error('Use a Conventional Commit title, e.g. feat(wingman): add Berlin');
  const breaking = /^\w+(?:\([^)]+\))?!: /.test(parsed.header) || parsed.notes.some(note => /BREAKING/.test(note.title));
  const bump = breaking ? 'major' : parsed.type === 'feat' ? 'minor' : ['fix', 'perf', 'refactor', 'revert'].includes(parsed.type) ? 'patch' : null;
  return { ...parsed, bump };
}

export function section(body, title) {
  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  const index = headings.findIndex(match => match[1].toLowerCase() === title.toLowerCase());
  if (index === -1) return '';
  return body.slice(headings[index].index + headings[index][0].length, headings[index + 1]?.index ?? body.length).replace(/<!--[\s\S]*?-->/g, '').trim();
}

export function affectedDomains(files, filters) {
  const match = name => files.some(picomatch(filters[name], { dot: true }));
  return domains.filter(domain => match(domain) || (filters.shared && match('shared')));
}

export function runtimeDependenciesChanged(before, after) {
  return ['dependencies', 'optionalDependencies', 'peerDependencies'].some(key => !isDeepStrictEqual(before[key] || {}, after[key] || {}));
}

export function meaningfulFiles(files, beforeManifest, afterManifest) {
  return releaseFiles(files).filter(file => {
    if (!file.endsWith('/package.json')) return true;
    const before = beforeManifest(file);
    const after = afterManifest(file);
    if (!before || !after) return true;
    // Manifest names/type/exports can change the public contract. Scripts and
    // devDependencies are build tooling; generated version fields aren't source.
    const omit = ({ version, scripts, devDependencies, nx, ...runtime }) => runtime;
    return !isDeepStrictEqual(omit(before), omit(after));
  });
}

// Documentation and generated release metadata cannot cause another application
// release. Root build/config changes still count when the commit has a bump.
export function releaseFiles(files) {
  return files.filter(file => !file.endsWith('.md') && !file.startsWith('releases/') && !file.startsWith('.nx/version-plans/'));
}

export function validatePR(title, body, files, filters, rootRuntimeChanged = false) {
  const parsed = parseMessage(`${title}\n\n${body}`);
  const affected = rootRuntimeChanged ? domains : affectedDomains(releaseFiles(files), filters);
  const runtime = affected.length > 0;
  if (runtime && !parsed.bump) throw new Error('Runtime source or domain dependencies require feat, fix, perf, refactor, revert, or an explicit breaking change');
  if (affected.length && parsed.bump) {
    if ([...body.matchAll(/^##\s+Release note\s*$/gmi)].length !== 1) throw new Error('Keep exactly one ## Release note section');
    validateReleaseNote(section(body, 'Release note'));
  }
  return { affected, bump: parsed.bump };
}

export function validateReleaseNote(note) {
  if (!note) throw new Error('Add a non-empty ## Release note section to the PR description');
  if (/describe the user-visible change|this text becomes part of the squash commit|state backward compatibility, breaking changes|describe the checks and manual tests performed/i.test(note)) throw new Error('Replace the template placeholder with an actual release note');
}

export function changesSince(base, head = 'HEAD', cwd = process.cwd()) {
  if (!/^[0-9a-f]{40}$/.test(base)) throw new Error('Commit scanning needs an explicit full source SHA');
  execFileSync('git', ['merge-base', '--is-ancestor', base, head], { cwd, stdio: 'pipe' });
  const filters = config(cwd);
  const shas = git(['rev-list', '--first-parent', '--reverse', `${base}..${head}`], cwd).split('\n').filter(Boolean);
  const result = Object.fromEntries(domains.map(domain => [domain, []]));
  for (const sha of shas) {
    const files = git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--no-renames', `${sha}^`, sha], cwd).split('\n').filter(Boolean);
    const generated = files.length && files.every(file => {
      if (/^releases\/(billing|payment|wingman)\.json$/.test(file) || /^domains\/[^/]+\/CHANGELOG\.md$/.test(file)) return true;
      if (!/^domains\/(billing|payment|wingman)\/package\.json$/.test(file)) return false;
      const before = JSON.parse(git(['show', `${sha}^:${file}`], cwd));
      const after = JSON.parse(git(['show', `${sha}:${file}`], cwd));
      delete before.version; delete after.version;
      return isDeepStrictEqual(before, after);
    });
    if (generated) continue;
    const at = (ref, file) => { try { return JSON.parse(git(['show', `${ref}:${file}`], cwd)); } catch { return null; } };
    const relevantFiles = meaningfulFiles(files, file => at(`${sha}^`, file), file => at(sha, file));
    const rootRuntime = files.includes('package.json') && runtimeDependenciesChanged(at(`${sha}^`, 'package.json') || {}, at(sha, 'package.json') || {});
    const affected = rootRuntime ? domains : affectedDomains(relevantFiles, filters);
    if (!affected.length) continue;
    const message = git(['show', '-s', '--format=%B', sha], cwd);
    let parsed;
    try { parsed = parseMessage(message); } catch (error) { throw new Error(`${sha.slice(0, 8)}: ${error.message}. Fix commit metadata before preparing a release.`); }
    const runtime = affected.length > 0;
    if (!parsed.bump) {
      if (runtime) throw new Error(`${sha.slice(0, 8)}: runtime changes have no release bump`);
      continue;
    }
    const note = section(message, 'Release note');
    const compatibility = section(message, 'Compatibility and migrations');
    try { validateReleaseNote(note); } catch (error) { throw new Error(`${sha.slice(0, 8)}: ${error.message}`); }
    const number = /\(#(\d+)\)/.exec(parsed.header)?.[1];
    const repository = process.env.GITHUB_REPOSITORY || 'janodetzel/changesets-demo';
    const reference = number ? `[PR #${number}](https://github.com/${repository}/pull/${number})` : `commit ${sha.slice(0, 8)}`;
    const summary = `${note}${compatibility ? `\n\n${compatibility}` : ''}\n\n${reference}${parsed.notes.length ? '\n\n' + parsed.notes.map(item => `${item.title}: ${item.text}`).join('\n') : ''}`;
    for (const domain of affected) result[domain].push({ id: `commit:${sha}:${domain}`, commit: sha, bump: parsed.bump, summary });
  }
  return result;
}

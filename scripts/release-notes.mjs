// Presentation and workflow wiring only. Nx owns version calculation and changelogs.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { domains, validatePR, changesSince } from './commit-changes.mjs';
import { parse } from 'yaml';

export { domains };
const read = file => readFileSync(file, 'utf8');
const manifest = domain => `domains/${domain}/package.json`;
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const versionAt = (domain, ref) => {
  try { return JSON.parse(git(['show', `${ref}:${manifest(domain)}`])).version ?? '0.0.0'; }
  catch { return '0.0.0'; }
};

export function entry(changelog, version) {
  const sections = changelog.split(/(?=^#{1,2} \d+\.\d+\.\d+)/m);
  const section = sections.find(value => new RegExp(`^#{1,2} ${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ (\\n]`).test(value));
  if (!section) throw new Error(`No generated changelog entry for ${version}`);
  return section.trim();
}

export function validatePreparation(changed, beforeManifest, afterManifest) {
  for (const file of changed.filter(Boolean)) {
    if (!/^domains\/(billing|payment|wingman)\/(package\.json|CHANGELOG\.md)$/.test(file) && !/^releases\/(billing|payment|wingman)\.json$/.test(file)) {
      throw new Error(`Preparation must contain only versions, changelogs, and candidate records: ${file}`);
    }
    if (file.endsWith('/package.json')) {
      const { version: oldVersion, ...before } = beforeManifest(file);
      const { version: newVersion, ...after } = afterManifest(file);
      if (!isDeepStrictEqual(before, after)) throw new Error(`Preparation must not change dependencies, scripts, or other package metadata: ${file}`);
    }
  }
}

const checkPreparation = (changed, base) => validatePreparation(
  changed,
  file => JSON.parse(git(['show', `${base}:${file}`])),
  file => JSON.parse(read(file)),
);

function main([command, argument]) {
  if (command === 'check') {
    const changed = git(['diff', '--name-only', argument, 'HEAD']).split('\n');
    if (process.env.HEAD_REF === 'release/versions') {
      for (const domain of domains) {
        if (JSON.parse(read(manifest(domain))).version !== versionAt(domain, argument)) {
          entry(read(`domains/${domain}/CHANGELOG.md`), JSON.parse(read(manifest(domain))).version);
        }
      }
      checkPreparation(changed, argument);
      console.log('Release preparation has generated changelogs and metadata-only changes');
      return;
    }
    const event = JSON.parse(read(process.env.GITHUB_EVENT_PATH));
    validatePR(event.pull_request.title, event.pull_request.body || '', changed, parse(read('.github/domain-paths.yml')));
    for (const domain of domains) {
      if (JSON.parse(read(manifest(domain))).version !== versionAt(domain, argument)) throw new Error('Only the release preparation PR may change domain versions');
      if (changed.includes(`domains/${domain}/CHANGELOG.md`)) throw new Error('Nx generates changelogs in the release preparation PR');
      if (changed.includes(`releases/${domain}.json`)) throw new Error('Only the preparation PR may change RC records');
    }
    if (changed.some(file => file.startsWith('.nx/version-plans/'))) throw new Error('Version plans were removed; put release intent in the PR title and description');
    console.log('PR title and description supply release intent for affected domains');
    return;
  }
  if (command === 'preview') {
    const blocks = domains.flatMap(domain => {
      const version = JSON.parse(read(manifest(domain))).version;
      const previous = versionAt(domain, 'HEAD');
      if (version === previous) return [];
      return [`## ${domain}: ${previous} → ${version}\n\n${entry(read(`domains/${domain}/CHANGELOG.md`), version)}`];
    });
    writeFileSync('release-preview.md', `# Prepare domain releases\n\n${blocks.join('\n\n')}\n\nMerging reserves these versions and builds candidates from the exact merge commit, without redeploying DEV. Review and approve each candidate for STAGE testing, then approve the same artifact for PROD.\n`);
    return;
  }
  if (command === 'candidate') {
    const changedVersions = domains.filter(domain => JSON.parse(read(manifest(domain))).version !== versionAt(domain, argument));
    if (changedVersions.length) {
      checkPreparation(git(['diff', '--name-only', argument, 'HEAD']).split('\n'), argument);
    }
    // Classify the whole push first: preparation never starts DEV for another domain.
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `preparation=${changedVersions.length > 0}\n`);
    for (const domain of domains) {
      const version = JSON.parse(read(manifest(domain))).version;
      const changed = version !== versionAt(domain, argument);
      if (changed) entry(read(`domains/${domain}/CHANGELOG.md`), version);
      if (changed) {
        const record = JSON.parse(read(`releases/${domain}.json`));
        if (record.domain !== domain || record.version !== version || !/^\d+\.\d+\.\d+-rc\.\d+$/.test(version)) throw new Error('Version must match its immutable RC record');
      }
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${domain}=${changed}\n`);
      console.log(`${domain}: ${changed ? `release ${version}` : 'integration only'}`);
    }
    return;
  }
  if (command === 'notes') {
    if (!domains.includes(argument)) throw new Error('Unknown domain');
    const version = JSON.parse(read(manifest(argument))).version;
    const integration = process.env.RELEASE_CANDIDATE !== 'true';
    const pending = integration ? changesSince(JSON.parse(read('release-input.json')).historyStart)[argument] : [];
    const notes = integration
      ? `# ${argument}: integration build\n\nLast reserved version: ${version}. This source is not a finalized semantic release.\n\n${pending.map(change => `## ${change.bump} · ${change.commit.slice(0, 8)}\n\n${change.summary}`).join('\n\n') || 'No commit-based release notes since migration.'}`
      : entry(read(`domains/${argument}/CHANGELOG.md`), version);
    const display = integration ? `${version.split('-')[0]}-dev.${process.env.GITHUB_RUN_ID ?? 'local'}` : version;
    writeFileSync('artifact/RELEASE.md', `${notes}\n`);
    if (!integration) writeFileSync('artifact/candidate.json', read(`releases/${argument}.json`));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${display}\n`);
    return;
  }
  throw new Error('Use release-notes.mjs check <base-sha> | preview | candidate <base-sha> | notes <domain>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));

// Presentation and workflow wiring only. Nx owns version calculation and changelogs.
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { isDeepStrictEqual } from 'node:util';

export const domains = ['billing', 'payment', 'wingman'];
const read = file => readFileSync(file, 'utf8');
const manifest = domain => `domains/${domain}/package.json`;
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const versionAt = (domain, ref) => {
  try { return JSON.parse(git(['show', `${ref}:${manifest(domain)}`])).version ?? '0.0.0'; }
  catch { return '0.0.0'; }
};

export function entry(changelog, version) {
  const sections = changelog.split(/(?=^#{1,2} \d+\.\d+\.\d+)/m);
  const section = sections.find(value => new RegExp(`^#{1,2} ${version.replaceAll('.', '\\.')}[ (\\n]`).test(value));
  if (!section) throw new Error(`No generated changelog entry for ${version}`);
  return section.trim();
}

export function plans() {
  const directory = '.nx/version-plans';
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => name.endsWith('.md') && name !== 'README.md').map(name => {
    const text = read(`${directory}/${name}`);
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if (!match) throw new Error(`Invalid version plan: ${name}`);
    const bumps = parse(match[1]);
    if (!bumps || !Object.keys(bumps).length || Object.entries(bumps).some(([domain, bump]) => !domains.includes(domain) || !['patch', 'minor', 'major'].includes(bump))) throw new Error(`Invalid domain or bump in ${name}`);
    return { name, bumps, summary: text.slice(match[0].length).trim() };
  });
}

export function validatePreparation(changed, beforeManifest, afterManifest) {
  for (const file of changed.filter(Boolean)) {
    if (!/^domains\/(billing|payment|wingman)\/(package\.json|CHANGELOG\.md)$/.test(file) && !/^\.nx\/version-plans\/[^/]+\.md$/.test(file)) {
      throw new Error(`Preparation must contain only versions, changelogs, and consumed plans: ${file}`);
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
    const pending = plans();
    if (process.env.HEAD_REF === 'release/versions') {
      for (const domain of domains) {
        if (JSON.parse(read(manifest(domain))).version !== versionAt(domain, argument)) {
          if (pending.some(plan => domain in plan.bumps)) throw new Error(`${domain}: refresh the preparation PR; unconsumed plans remain`);
          entry(read(`domains/${domain}/CHANGELOG.md`), JSON.parse(read(manifest(domain))).version);
        }
      }
      checkPreparation(changed, argument);
      console.log('Release preparation has changelogs and no unconsumed plans for its versions');
      return;
    }
    const added = new Set(git(['diff', '--name-only', '--diff-filter=A', argument, 'HEAD', '--', '.nx/version-plans']).split('\n').map(file => file.split('/').at(-1)));
    const newPlans = pending.filter(plan => added.has(plan.name));
    for (const domain of domains) {
      const required = changed.some(file => file.startsWith(`domains/${domain}/src/`) || file === manifest(domain) || (file.startsWith('packages/money/') && domain !== 'wingman'));
      if (required && !newPlans.some(plan => domain in plan.bumps)) throw new Error(`Add a new version plan for ${domain}; existing pending plans do not describe this PR`);
      if (JSON.parse(read(manifest(domain))).version !== versionAt(domain, argument)) throw new Error('Only the release preparation PR may change domain versions');
      if (changed.includes(`domains/${domain}/CHANGELOG.md`)) throw new Error('Nx generates changelogs in the release preparation PR');
    }
    console.log('Changed domains and shared-library consumers have new release plans');
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
    const pending = plans();
    const changedVersions = domains.filter(domain => JSON.parse(read(manifest(domain))).version !== versionAt(domain, argument));
    if (changedVersions.length) {
      checkPreparation(git(['diff', '--name-only', argument, 'HEAD']).split('\n'), argument);
    }
    // Classify the whole push first: preparation never starts DEV for another domain.
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `preparation=${changedVersions.length > 0}\n`);
    for (const domain of domains) {
      const version = JSON.parse(read(manifest(domain))).version;
      const changed = version !== versionAt(domain, argument);
      if (changed && pending.some(plan => domain in plan.bumps)) throw new Error(`${domain}: version changed but pending plans remain. Refresh the release PR against current main.`);
      if (changed) entry(read(`domains/${domain}/CHANGELOG.md`), version);
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${domain}=${changed}\n`);
      console.log(`${domain}: ${changed ? `release ${version}` : 'integration only'}`);
    }
    return;
  }
  if (command === 'notes') {
    if (!domains.includes(argument)) throw new Error('Unknown domain');
    const version = JSON.parse(read(manifest(argument))).version;
    const integration = process.env.RELEASE_CANDIDATE !== 'true';
    const pending = plans().filter(plan => argument in plan.bumps);
    const notes = integration
      ? `# ${argument}: integration build\n\nLast reserved version: ${version}. This source is not a finalized semantic release.\n\n${pending.map(plan => `## ${plan.bumps[argument]} · ${plan.name}\n\n${plan.summary}`).join('\n\n') || 'No pending release notes for this domain.'}`
      : entry(read(`domains/${argument}/CHANGELOG.md`), version);
    const display = integration ? `${version}-dev.${process.env.GITHUB_RUN_ID ?? 'local'}` : version;
    writeFileSync('artifact/RELEASE.md', `${notes}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${display}\n`);
    return;
  }
  throw new Error('Use release-notes.mjs check <base-sha> | preview | candidate <base-sha> | notes <domain>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));

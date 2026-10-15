// RC lifecycle policy around Nx. GitHub stable Releases are production truth;
// committed records preserve candidate scope. No application bytes are rewritten.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { domains, changesSince } from './commit-changes.mjs';

export const recordPath = domain => `releases/${domain}.json`;
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const gh = args => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const empty = domain => ({ domain, baseline: '0.0.0', target: null, version: null, sequence: 0, changes: [], delta: [] });
export const candidateRecord = domain => existsSync(recordPath(domain)) ? read(recordPath(domain)) : empty(domain);

export function nextCandidate(previous, stable, incoming) {
  if (!semver.valid(stable.version) || semver.prerelease(stable.version)) throw new Error('Stable baseline must be a stable semantic version');
  if (semver.lt(stable.version, previous.baseline)) throw new Error('Production baseline moved backwards; reconcile before preparing');
  const shipped = new Set(stable.changeIds || []);
  if (stable.version !== previous.baseline && previous.changes.length && !Array.isArray(stable.changeIds)) throw new Error('Stable release lacks change identities required for reconciliation');
  const seen = new Map();
  for (const change of [...previous.changes, ...incoming].filter(change => !shipped.has(change.id))) seen.set(change.id, change);
  const changes = [...seen.values()];
  const known = new Set([...previous.changes.map(change => change.id), ...shipped]);
  const fresh = incoming.filter(change => !known.has(change.id));
  if (!fresh.length) return null;
  const rank = { patch: 1, minor: 2, major: 3 };
  const bump = changes.reduce((value, change) => rank[change.bump] > rank[value] ? change.bump : value, 'patch');
  const target = semver.inc(stable.version, bump);
  const sequence = previous.sequence + 1;
  const version = `${target}-rc.${sequence}`;
  if (previous.version && !semver.gt(version, previous.version)) throw new Error('New candidate must advance beyond the previous candidate');
  return { domain: previous.domain, baseline: stable.version, target, version, sequence, changes, delta: fresh.map(change => change.id) };
}

export function candidateNotes(record) {
  const delta = new Set(record.delta);
  const format = changes => changes.map(change => `- **${change.bump}**: ${change.summary}`).join('\n\n') || '- No new change descriptions.';
  return `# ${record.version}\n\nDomain: **${record.domain}**\n\nStable production baseline: **${record.baseline}**\n\nIntended stable release: **${record.target}**\n\n## All changes since production ${record.baseline}\n\n${format(record.changes)}\n\n## Changes introduced in this candidate\n\n${format(record.changes.filter(change => delta.has(change.id)))}\n`;
}

export function assertPromotable(record, latest, stable, digest, sourceSha) {
  if (record.version !== latest.version || JSON.stringify(record) !== JSON.stringify(latest)) throw new Error('This RC was superseded; validate and promote the newest candidate');
  if (stable.version === record.target) {
    if (stable.digest !== digest || stable.sourceSha !== sourceSha || stable.candidate !== record.version) throw new Error('Stable target already belongs to a different artifact');
    return;
  }
  if (stable.version !== record.baseline) throw new Error('Production baseline changed; prepare and validate a reconciled candidate');
}

export function productionBaseline(domain, repository = process.env.GITHUB_REPOSITORY) {
  if (process.env.RC_BASELINES) return read(process.env.RC_BASELINES)[domain] || { version: '0.0.0', changeIds: [] };
  if (!repository) throw new Error('Set GITHUB_REPOSITORY with GH_TOKEN, or RC_BASELINES for isolated local verification');
  const releases = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`])).flat();
  const candidates = releases.filter(item => !item.draft && !item.prerelease && item.tag_name.startsWith(`${domain}@v`))
    .map(item => ({ ...item, version: item.tag_name.slice(`${domain}@v`.length) }))
    .filter(item => semver.valid(item.version) && !semver.prerelease(item.version))
    .sort((a, b) => semver.rcompare(a.version, b.version));
  if (!candidates.length) return { version: '0.0.0', changeIds: [] };
  const release = candidates[0];
  const asset = release.assets.find(item => item.name === 'release.json');
  if (!asset) return { version: release.version }; // Migration from previous stable-only workflow.
  const metadata = JSON.parse(gh(['api', '-H', 'Accept: application/octet-stream', `repos/${repository}/releases/assets/${asset.id}`]));
  if (metadata.version !== release.version || metadata.domain !== domain) throw new Error('Stable release metadata does not match its tag');
  return metadata;
}

async function prepare() {
  const incoming = changesSince(read('release-input.json').historyStart);
  const { ReleaseClient } = await import('nx/release/index.js');
  const configuration = read('nx.json').release;
  delete configuration.git;
  const nx = new ReleaseClient({ ...configuration, versionPlans: false, version: { ...configuration.version, git: { commit: false, tag: false } } }, true);
  const preview = [];
  for (const domain of domains) {
    const previous = candidateRecord(domain);
    const stable = productionBaseline(domain);
    const relevant = incoming[domain];
    // During migration, preserve unreleased stable-version entries in the first RC.
    const legacy = [];
    if (!previous.version && existsSync(`domains/${domain}/CHANGELOG.md`)) {
      const sections = readFileSync(`domains/${domain}/CHANGELOG.md`, 'utf8').split(/(?=^#{1,2} \d+\.\d+\.\d+)/m);
      for (const section of sections.reverse()) {
        const version = /^#{1,2} (\d+\.\d+\.\d+)\b/.exec(section)?.[1];
        if (version && semver.gt(version, stable.version)) legacy.push({ id: hash(`legacy:${domain}:${version}:${section}`), bump: semver.major(version) > semver.major(stable.version) ? 'major' : semver.minor(version) > semver.minor(stable.version) ? 'minor' : 'patch', summary: section.replace(/^#{1,2} [^\n]+\n/, '').trim(), plan: `legacy-${version}` });
      }
    }
    const next = nextCandidate(previous, stable, [...legacy, ...relevant]);
    if (!next) continue;
    // Nx owns package-manifest writes. Our policy supplies the explicit RC target.
    await nx.releaseVersion({ projects: [domain], specifier: next.version, gitCommit: false, gitTag: false });
    mkdirSync('releases', { recursive: true });
    writeFileSync(recordPath(domain), JSON.stringify(next, null, 2) + '\n');
    const changelog = `domains/${domain}/CHANGELOG.md`;
    const old = existsSync(changelog) ? readFileSync(changelog, 'utf8') : '';
    writeFileSync(changelog, candidateNotes(next) + '\n\n' + old);
    preview.push(candidateNotes(next));
  }
  writeFileSync('release-preview.md', `# Prepare release candidates\n\n${preview.join('\n\n')}\n\nMerge to pin these candidates. DEV is not redeployed. Each domain needs fresh STAGE validation and separate PROD approval. Finalization reuses the accepted executable artifact.\n`);
}

async function main([command, domain]) {
  if (command === 'prepare') return prepare();
  if (command === 'preflight') {
    if (!domains.includes(domain)) throw new Error('Unknown domain');
    const record = read('artifact/candidate.json');
    const provenance = read('artifact/provenance.json');
    const latest = JSON.parse(Buffer.from(JSON.parse(gh(['api', `repos/${process.env.GITHUB_REPOSITORY}/contents/${recordPath(domain)}?ref=main`])).content, 'base64').toString());
    const digest = hash(readFileSync('artifact/dist/index.mjs'));
    const stable = productionBaseline(domain);
    if (provenance.domain !== domain || record.domain !== domain || provenance.version !== record.version) throw new Error('Candidate identity mismatch');
    assertPromotable(record, latest, stable, digest, provenance.sourceSha);
    const release = { domain, version: record.target, candidate: record.version, baseline: record.baseline, sourceSha: provenance.sourceSha, digest, artifactId: process.env.ARTIFACT_ID, changeIds: [...new Set([...(stable.changeIds || []), ...record.changes.map(change => change.id)])] };
    writeFileSync('artifact/release.json', JSON.stringify(release, null, 2) + '\n');
    writeFileSync('artifact/STABLE-NOTES.md', `# ${domain} ${record.target}\n\nProduction upgrade: **${record.baseline} → ${record.target}**\n\nAccepted candidate: **${record.version}**\n\nExecutable SHA-256: \`${digest}\`\n\n${record.changes.map(change => `- ${change.summary}`).join('\n\n')}\n`);
    return;
  }
  throw new Error('Use rc.mjs prepare | preflight <domain>');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });

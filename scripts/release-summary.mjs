// Thin presentation adapter. Nx owns versioning and changelogs; GitHub
// deployment statuses supply the comparison baseline, never the highest tag.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { ReleaseClient } from 'nx/release/index.js';
import { pathToFileURL } from 'node:url';

const domains = ['billing', 'payment', 'wingman'];
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const gh = args => execFileSync('gh', args, { encoding: 'utf8' }).trim();

export function successfulDeployment(deployments) {
  return [...deployments].sort((a, b) => b.id - a.id)
    .find(deployment => deployment.statuses[0]?.state === 'success') || null;
}

function production(domain) {
  if (process.env.DEPLOYMENT_BASELINES) return JSON.parse(readFileSync(process.env.DEPLOYMENT_BASELINES, 'utf8'))[domain] || null;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('Set GITHUB_REPOSITORY and GH_TOKEN, or DEPLOYMENT_BASELINES for offline checks');
  const deployments = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/deployments?environment=prod-${domain}&per_page=100`])).flat();
  // GitHub lists newest deployments first. The current run is in_progress and
  // is not a successful baseline; a failed newer attempt does not replace it.
  for (const deployment of deployments.sort((a, b) => b.id - a.id)) {
    const statuses = JSON.parse(gh(['api', `repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`]));
    if (successfulDeployment([{ ...deployment, statuses }])) {
      let version = 'unknown';
      try { version = JSON.parse(git(['show', `${deployment.sha}:domains/${domain}/package.json`])).version; } catch { throw new Error(`Production deployment ${deployment.id} source is missing from Git history`); }
      return { id: deployment.id, sha: deployment.sha, version };
    }
  }
  return null;
}

async function notes(domain, version, baseline) {
  const configuration = JSON.parse(readFileSync('nx.json', 'utf8')).release;
  delete configuration.git;
  const client = new ReleaseClient({ ...configuration, changelog: { ...configuration.changelog, git: { commit: false, tag: false } } }, true);
  if (baseline) execFileSync('git', ['merge-base', '--is-ancestor', baseline.sha, 'HEAD']);
  const result = await client.releaseChangelog({ projects: [domain], version, from: baseline?.sha, to: 'HEAD', firstRelease: !baseline, dryRun: true, interactive: false });
  return `## ${domain} · ${version}\n\nProduction deployment: **${baseline?.version || 'none'} → ${version}**\n\n${baseline ? `Baseline source: \`${baseline.sha}\` · deployment ${baseline.id}\n\n` : ''}${result.projectChangelogs?.[domain]?.contents || 'No application changes reported by Nx.'}\n`;
}

async function main([domain, mode]) {
  if (domain) {
    if (!domains.includes(domain)) throw new Error('Unknown domain');
    const baseline = production(domain);
    if (mode === 'verify') {
      const recorded = JSON.parse(readFileSync('artifact/baseline.json', 'utf8'));
      const provenance = JSON.parse(readFileSync('artifact/provenance.json', 'utf8'));
      if (baseline?.sha === provenance.sourceSha && baseline.version === provenance.version) return; // Retry after this artifact already deployed.
      if (JSON.stringify(recorded) !== JSON.stringify(baseline)) throw new Error('Production baseline changed since candidate notes were generated. Rebuild/review this candidate before retrying.');
      return;
    }
    const version = JSON.parse(readFileSync(`domains/${domain}/package.json`, 'utf8')).version;
    writeFileSync('artifact/RELEASE.md', await notes(domain, version, baseline));
    writeFileSync('artifact/baseline.json', JSON.stringify(baseline, null, 2) + '\n');
  } else {
    const blocks = [];
    for (const name of domains) {
      const version = JSON.parse(readFileSync(`domains/${name}/package.json`, 'utf8')).version;
      const before = JSON.parse(git(['show', `HEAD:domains/${name}/package.json`])).version;
      if (version !== before) blocks.push(await notes(name, version, production(name)));
    }
    writeFileSync('release-preview.md', `# Prepare domain releases\n\n${blocks.join('\n\n')}\n\nNx reserves these versions. This does not deploy DEV or production. STAGE and PROD require approval and use the same artifact. Skipped versions remain in cumulative production-to-candidate notes.\n`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });

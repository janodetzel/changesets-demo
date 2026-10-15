import test from 'node:test';
import assert from 'node:assert/strict';
import { entry, validatePreparation } from './release-notes.mjs';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

test('approval notes contain exactly the requested release, not previous releases', () => {
  const changelog = '# 1.5.0 (2026-10-15)\n\n### Features\n\n- Invoice descriptions (#20)\n\n### Fixes\n\n- Rounding (#21)\n\n## 1.4.2 (2026-10-01)\n\n- Older fix\n';
  assert.match(entry(changelog, '1.5.0'), /descriptions/);
  assert.match(entry(changelog, '1.5.0'), /Rounding/);
  assert.doesNotMatch(entry(changelog, '1.5.0'), /Older fix/);
  assert.throws(() => entry(changelog, '1.6.0'), /No generated changelog/);
});

test('preparation cannot hide source or build-dependency changes from DEV', () => {
  const before = { name: '@emp/billing', version: '1.0.0', dependencies: { money: '1.0.0' } };
  const after = { ...before, version: '1.1.0' };
  const changed = ['domains/billing/package.json', 'domains/billing/CHANGELOG.md', 'releases/billing.json'];
  assert.doesNotThrow(() => validatePreparation(changed, () => before, () => after));
  assert.throws(() => validatePreparation([...changed, 'domains/billing/src/index.mjs'], () => before, () => after), /only versions/);
  assert.throws(() => validatePreparation(changed, () => before, () => ({ ...after, dependencies: { money: '2.0.0' } })), /dependencies/);
  assert.throws(() => validatePreparation(changed, () => before, () => ({ ...after, scripts: { build: 'different' } })), /metadata/);
});

test('integration and promotion have disjoint environments and independent locks', () => {
  const load = name => parse(readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
  const workflow = load('domain-release');
  const integration = load('domain-dev');
  const { stage, production } = workflow.jobs;
  const { dev } = integration.jobs;
  const build = load('domain-build').jobs.build;
  assert.equal(build.environment, undefined, 'candidate build must not create a DEV deployment');
  assert.deepEqual(Object.keys(integration.jobs), ['build', 'dev']);
  assert.deepEqual(Object.keys(workflow.jobs), ['build', 'stage', 'production']);
  assert.equal(integration.jobs.build.with.release_candidate, false);
  assert.equal(workflow.jobs.build.with.release_candidate, true);
  assert.equal(dev.needs, 'build');
  assert.equal(stage.needs, 'build');
  assert.deepEqual(production.needs, ['build', 'stage']);
  assert.equal(workflow.concurrency.group, 'release-${{ inputs.domain }}');
  assert.equal(integration.concurrency.group, 'integration-${{ inputs.domain }}');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  for (const job of [dev, stage, production]) {
    assert.equal(job.steps.find(step => step.uses === 'actions/download-artifact@v4').with['artifact-ids'], '${{ needs.build.outputs.artifact_id }}');
  }
  for (const job of [dev, stage]) assert.ok(!job.steps.some(step => step.uses === 'actions/checkout@v4'));
  assert.ok(!production.steps.some(step => /pnpm.*build/.test(step.run || '')), 'production metadata finalization must not rebuild the application');
  assert.equal(build.steps[0].with.ref, '${{ github.sha }}', 'queued builds must pin the triggering commit');
  for (const [name, flow, domainWorkflow] of [['deploy-dev', 'dev', 'domain-dev'], ['release', 'release', 'domain-release']]) {
    const entrypoint = load(name);
    assert.equal(entrypoint.jobs.changes.with.flow, flow);
    for (const domain of ['billing', 'payment', 'wingman']) {
      assert.equal(entrypoint.jobs[domain].uses, `./.github/workflows/${domainWorkflow}.yml`);
      assert.equal(entrypoint.jobs[domain].if, `needs.changes.outputs.${domain} == 'true'`);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { entry, plans, validatePreparation } from './release-notes.mjs';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

test('approval notes contain exactly the requested release, not previous releases', () => {
  const changelog = '# 1.5.0 (2026-10-15)\n\n### Features\n\n- Invoice descriptions (#20)\n\n### Fixes\n\n- Rounding (#21)\n\n## 1.4.2 (2026-10-01)\n\n- Older fix\n';
  assert.match(entry(changelog, '1.5.0'), /descriptions/);
  assert.match(entry(changelog, '1.5.0'), /Rounding/);
  assert.doesNotMatch(entry(changelog, '1.5.0'), /Older fix/);
  assert.throws(() => entry(changelog, '1.6.0'), /No generated changelog/);
});

test('repository version plans parse and include release descriptions', () => {
  for (const plan of plans()) assert.ok(plan.summary.length > 0, plan.name);
});

test('preparation cannot hide source or build-dependency changes from DEV', () => {
  const before = { name: '@emp/billing', version: '1.0.0', dependencies: { money: '1.0.0' } };
  const after = { ...before, version: '1.1.0' };
  const changed = ['domains/billing/package.json', 'domains/billing/CHANGELOG.md', '.nx/version-plans/invoice.md'];
  assert.doesNotThrow(() => validatePreparation(changed, () => before, () => after));
  assert.throws(() => validatePreparation([...changed, 'domains/billing/src/index.mjs'], () => before, () => after), /only versions/);
  assert.throws(() => validatePreparation(changed, () => before, () => ({ ...after, dependencies: { money: '2.0.0' } })), /dependencies/);
  assert.throws(() => validatePreparation(changed, () => before, () => ({ ...after, scripts: { build: 'different' } })), /metadata/);
});

test('integration and promotion have disjoint environments and independent locks', () => {
  const workflow = parse(readFileSync('.github/workflows/domain-release.yml', 'utf8'));
  const { build, dev, stage, production } = workflow.jobs;
  assert.equal(build.environment, undefined, 'candidate build must not create a DEV deployment');
  assert.equal(dev.if, '${{ !inputs.release_candidate }}');
  assert.equal(stage.if, 'inputs.release_candidate');
  assert.equal(dev.needs, 'build');
  assert.equal(stage.needs, 'build');
  assert.deepEqual(production.needs, ['build', 'stage']);
  assert.equal(workflow.concurrency.group, "${{ inputs.release_candidate && 'release' || 'integration' }}-${{ inputs.domain }}");
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  for (const job of [dev, stage, production]) {
    assert.equal(job.steps.find(step => step.uses === 'actions/download-artifact@v4').with['artifact-ids'], '${{ needs.build.outputs.artifact_id }}');
    assert.ok(!job.steps.some(step => step.uses === 'actions/checkout@v4'), 'deployments must reuse the bundle');
  }
  assert.equal(build.steps[0].with.ref, '${{ github.sha }}', 'queued builds must pin the triggering commit');
});

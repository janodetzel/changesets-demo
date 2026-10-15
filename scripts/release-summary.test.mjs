import test from 'node:test';
import assert from 'node:assert/strict';
import { successfulDeployment } from './release-summary.mjs';

test('production baseline uses deployment order, not the highest version or a failed attempt', () => {
  const deployments = [
    { id: 10, sha: 'new-version', statuses: [{ state: 'inactive' }] },
    { id: 11, sha: 'rolled-back-version', statuses: [{ state: 'success' }] },
    { id: 12, sha: 'failed-version', statuses: [{ state: 'failure' }] },
    { id: 13, sha: 'candidate-in-progress', statuses: [{ state: 'in_progress' }] },
  ];
  assert.equal(successfulDeployment(deployments).sha, 'rolled-back-version');
  assert.equal(successfulDeployment([{id:1,statuses:[{state:'failure'}]}]), null);
});

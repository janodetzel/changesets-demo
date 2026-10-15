import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCandidate, candidateNotes, assertPromotable } from './rc.mjs';
import { entry } from './release-notes.mjs';

const empty = () => ({ domain: 'wingman', baseline: '1.0.0', target: null, version: null, sequence: 0, changes: [], delta: [] });
const change = (id, bump = 'minor') => ({ id, bump, summary: `Add ${id} to cities.`, plan: `${id}.md` });

test('Hamburg and Berlin grow one minor RC target with cumulative and delta notes', () => {
  const stable = { version: '1.0.0', changeIds: [] };
  const first = nextCandidate(empty(), stable, [change('Hamburg')]);
  const second = nextCandidate(first, stable, [change('Berlin')]);
  assert.equal(first.version, '1.1.0-rc.1');
  assert.equal(second.version, '1.1.0-rc.2');
  assert.deepEqual(second.changes.map(c => c.id), ['Hamburg', 'Berlin']);
  const [cumulative, delta] = candidateNotes(second).split('## Changes introduced in this candidate');
  assert.match(cumulative, /Hamburg/);
  assert.match(cumulative, /Berlin/);
  assert.doesNotMatch(delta, /Hamburg/);
  assert.match(delta, /Berlin/);
  assert.equal(entry(candidateNotes(second) + '\n' + candidateNotes(first), second.version), candidateNotes(second).trim());
});

test('patch fixes preserve the active target; breaking changes escalate it', () => {
  const stable = { version: '1.0.0', changeIds: [] };
  const first = nextCandidate(empty(), stable, [change('Hamburg')]);
  assert.equal(nextCandidate(first, stable, [change('fix', 'patch')]).version, '1.1.0-rc.2');
  assert.equal(nextCandidate(first, stable, [change('break', 'major')]).version, '2.0.0-rc.2');
});

test('after finalization only unshipped changes affect the next target', () => {
  const first = nextCandidate(empty(), { version: '1.0.0', changeIds: [] }, [change('Hamburg')]);
  const finalized = { version: '1.1.0', changeIds: ['Hamburg'] };
  const second = nextCandidate(first, finalized, [change('fix', 'patch')]);
  assert.equal(second.version, '1.1.1-rc.2');
  assert.deepEqual(second.changes.map(c => c.id), ['fix']);
  assert.equal(nextCandidate(first, finalized, []), null);
});

test('repeated history scans do not create new RCs or reintroduce shipped commits', () => {
  const hamburg = change('Hamburg');
  const berlin = change('Berlin');
  const stable = { version: '1.0.0', changeIds: [] };
  const first = nextCandidate(empty(), stable, [hamburg]);
  assert.equal(nextCandidate(first, stable, [hamburg]), null);
  const second = nextCandidate(first, stable, [hamburg, berlin]);
  assert.deepEqual(second.delta, ['Berlin']);
  const third = nextCandidate(second, { version: '1.1.0', changeIds: ['Hamburg', 'Berlin'] }, [hamburg, berlin, change('fix', 'patch')]);
  assert.equal(third.target, '1.1.1');
  assert.deepEqual(third.changes.map(item => item.id), ['fix']);
});

test('production rejects superseded candidates, changed baselines, and different stable artifacts', () => {
  const stable = { version: '1.0.0', changeIds: [] };
  const first = nextCandidate(empty(), stable, [change('Hamburg')]);
  const second = nextCandidate(first, stable, [change('Berlin')]);
  assert.throws(() => assertPromotable(first, second, stable, 'digest', 'sha'), /superseded/);
  assert.throws(() => assertPromotable(second, second, { version: '1.1.0', digest: 'other' }, 'digest', 'sha'), /different artifact/);
  assert.throws(() => assertPromotable(second, second, { version: '1.0.1' }, 'digest', 'sha'), /baseline changed/);
  assert.doesNotThrow(() => assertPromotable(second, second, stable, 'digest', 'sha'));
  assert.doesNotThrow(() => assertPromotable(second, second, { version: '1.1.0', digest: 'digest', sourceSha: 'sha', candidate: second.version }, 'digest', 'sha'));
});

test('reconciliation preserves unshipped changes and refuses missing finalization metadata', () => {
  const first = nextCandidate(empty(), { version: '1.0.0', changeIds: [] }, [change('Hamburg')]);
  const second = nextCandidate(first, { version: '1.0.0', changeIds: [] }, [change('Berlin')]);
  const next = nextCandidate(second, { version: '1.1.0', changeIds: ['Hamburg'] }, [change('fix', 'patch')]);
  assert.equal(next.target, '1.2.0');
  assert.deepEqual(next.changes.map(c => c.id), ['Berlin', 'fix']);
  assert.throws(() => nextCandidate(second, { version: '1.1.0' }, [change('fix', 'patch')]), /lacks change identities/);
});

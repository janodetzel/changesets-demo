import test from 'node:test';
import assert from 'node:assert/strict';
import { entry, plans } from './release-notes.mjs';

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

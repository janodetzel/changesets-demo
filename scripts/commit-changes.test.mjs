import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { parseMessage, validatePR, changesSince } from './commit-changes.mjs';

const filters = parse(readFileSync('.github/domain-paths.yml', 'utf8'));
const body = '## Release note\n\nAdd Berlin to cities.\n\n## Compatibility and migrations\n\nBackward compatible; no migrations.\n\n## Validation\n\nAcceptance passed.';

test('standard commit types, exclamation marks, and breaking footers determine bumps', () => {
  for (const [title, bump] of [['feat(wingman): add Berlin','minor'], ['fix: fix a refund','patch'], ['refactor(billing): simplify rounding','patch'], ['feat(wingman)!: change API','major'], ['docs: explain releases',null]]) assert.equal(parseMessage(title).bump,bump);
  assert.equal(parseMessage('fix: change API\n\nBREAKING CHANGE: remove old contract').bump,'major');
  assert.throws(() => parseMessage('Add Berlin'), /Conventional Commit/);
});

test('PR description coverage uses paths rather than a misleading title scope', () => {
  assert.deepEqual(validatePR('fix(wingman): correct money rounding',body,['packages/money/src/index.mjs'],filters), { affected:['billing','payment'],bump:'patch' });
  assert.throws(() => validatePR('chore: change cities',body,['domains/wingman/src/index.mjs'],filters), /Runtime/);
  assert.throws(() => validatePR('feat: add city','',['domains/wingman/src/index.mjs'],filters), /Release note/);
  assert.doesNotThrow(() => validatePR('feat: add city','## Release note\n\nCity.',['domains/wingman/src/index.mjs'],filters));
  assert.throws(() => validatePR('feat: add city','## Release note\n\nCity.\n\n## Release note\n\nPlaceholder.',['domains/wingman/src/index.mjs'],filters), /exactly one/);
  assert.throws(() => validatePR('feat: add city','## Release note\n\n<!-- Instructions only. -->',['domains/wingman/src/index.mjs'],filters), /non-empty/);
  assert.deepEqual(validatePR('docs: update guide','',['README.md'],filters).affected,[]);
});

test('real git history yields immutable domain changes and skips generated preparation commits', t => {
  const cwd = mkdtempSync(join(tmpdir(),'commit-release-'));
  t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  const env = { ...process.env,GIT_AUTHOR_NAME:'Demo',GIT_AUTHOR_EMAIL:'demo@example.invalid',GIT_COMMITTER_NAME:'Demo',GIT_COMMITTER_EMAIL:'demo@example.invalid' };
  const git = (...args) => execFileSync('git',args,{cwd,env,encoding:'utf8'}).trim();
  const write = (file,content) => { mkdirSync(join(cwd,file,'..'),{recursive:true});writeFileSync(join(cwd,file),content); };
  const commit = message => {git('add','.');git('commit','-m',message);return git('rev-parse','HEAD');};
  git('init','-b','main');
  write('.github/domain-paths.yml',readFileSync('.github/domain-paths.yml','utf8'));
  write('domains/wingman/package.json',JSON.stringify({name:'@emp/wingman',version:'1.0.0'}));
  write('domains/wingman/src/index.mjs','export const cities=[];');
  const base=commit('Old pre-migration history');
  write('domains/wingman/src/index.mjs','export const cities=["Berlin"];');
  const feature=commit(`feat(wingman): add Berlin (#42)\n\n${body}`);
  write('domains/wingman/package.json',JSON.stringify({name:'@emp/wingman',version:'1.1.0-rc.1'}));
  write('releases/wingman.json','{}');
  commit('Prepare domain releases (#43)');
  write('packages/money/src/index.mjs','export const money=1;');
  const shared=commit('fix(money): correct rounding (#44)\n\n## Release note\n\nCorrect fractional monetary rounding.');
  write('README.md','Documentation');commit('Update documentation');
  const changes=changesSince(base,'HEAD',cwd);
  assert.deepEqual(changes.wingman.map(c=>c.commit),[feature]);
  assert.deepEqual(changes.billing.map(c=>c.commit),[shared]);
  assert.deepEqual(changes.payment.map(c=>c.commit),[shared]);
  assert.match(changes.wingman[0].summary,/PR #42/);
  assert.doesNotMatch(changes.wingman[0].summary,/Acceptance passed/);
  assert.equal(changes.wingman[0].id,`commit:${feature}:wingman`);
  write('domains/wingman/src/index.mjs','export const cities=[];');commit('oops remove cities');
  assert.throws(()=>changesSince(base,'HEAD',cwd),/Conventional Commit/);
});

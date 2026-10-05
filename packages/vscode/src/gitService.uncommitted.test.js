import { afterEach, expect, mock, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

mock.module('vscode', () => ({ extensions: { getExtension: () => undefined } }));
const { getGitDiff } = await import('./gitService.ts?uncommitted-test');
const directories = [];
const git = (directory, ...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const repository = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-diff-test-'));
  directories.push(directory);
  git(directory, 'init');
  git(directory, 'config', 'user.name', 'Test');
  git(directory, 'config', 'user.email', 'test@example.com');
  return directory;
};
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

test('uncommitted compares current files with HEAD rather than the index', async () => {
  const directory = repository();
  const file = path.join(directory, 'file.txt');
  fs.writeFileSync(file, 'committed\n');
  git(directory, 'add', '.');
  git(directory, 'commit', '-m', 'initial');
  fs.writeFileSync(file, 'staged\n');
  git(directory, 'add', '.');
  fs.writeFileSync(file, 'current\n');
  for (const context of [3, 10000]) {
    expect((await getGitDiff(directory, 'file.txt', false, context, true)).diff).toContain('-committed\n+current');
  }
  expect((await getGitDiff(directory, 'file.txt', true)).diff).toContain('-committed\n+staged');
});

test('includes untracked files and recreated staged deletions without changing the index', async () => {
  const directory = repository();
  fs.writeFileSync(path.join(directory, 'file.txt'), 'committed\n');
  git(directory, 'add', '.');
  git(directory, 'commit', '-m', 'initial');
  git(directory, 'rm', 'file.txt');
  fs.writeFileSync(path.join(directory, 'file.txt'), 'recreated\n');
  fs.writeFileSync(path.join(directory, 'new.txt'), 'new\n');
  const indexBefore = git(directory, 'ls-files', '--stage');
  expect((await getGitDiff(directory, 'file.txt', false, 3, true)).diff).toContain('-committed\n+recreated');
  expect((await getGitDiff(directory, 'new.txt', false, 3, true)).diff).toContain('+new');
  expect(git(directory, 'ls-files', '--stage')).toBe(indexBefore);
});

test('uses current staged and untracked file contents before the first commit', async () => {
  const directory = repository();
  fs.writeFileSync(path.join(directory, 'file.txt'), 'staged\n');
  git(directory, 'add', '.');
  fs.writeFileSync(path.join(directory, 'file.txt'), 'current\n');
  fs.writeFileSync(path.join(directory, 'new.txt'), 'new\n');
  expect((await getGitDiff(directory, 'file.txt', false, 3, true)).diff).toContain('+current');
  expect((await getGitDiff(directory, 'new.txt', false, 3, true)).diff).toContain('+new');
});

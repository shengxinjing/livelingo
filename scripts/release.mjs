#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, capture = false) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit'
  });
}

function read(command, args) {
  return run(command, args, true).trim();
}

function nextPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function readPackageVersion() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return String(packageJson.version);
}

try {
  const branch = read('git', ['branch', '--show-current']);
  if (branch !== 'main') {
    throw new Error(`Releases must run from main. Current branch: ${branch || '(detached HEAD)'}`);
  }

  if (read('git', ['status', '--porcelain'])) {
    throw new Error('The working tree is not clean. Commit or stash changes before releasing.');
  }

  run('git', ['fetch', 'origin', 'main', '--tags']);
  const localHead = read('git', ['rev-parse', 'HEAD']);
  const remoteHead = read('git', ['rev-parse', 'origin/main']);
  if (localHead !== remoteHead) {
    throw new Error('main is not synchronized with origin/main. Push or pull changes before releasing.');
  }

  const currentVersion = readPackageVersion();
  const nextVersion = nextPatchVersion(currentVersion);
  const tag = `v${nextVersion}`;
  if (read('git', ['tag', '--list', tag])) {
    throw new Error(`Tag already exists: ${tag}`);
  }

  console.log(`Preparing release ${currentVersion} -> ${nextVersion}`);
  run('npm', ['run', 'lint']);
  run('npx', ['tsc', '--noEmit']);
  run('npm', ['version', 'patch', '--no-git-tag-version']);

  if (readPackageVersion() !== nextVersion) {
    throw new Error(`Version update failed. Expected ${nextVersion}.`);
  }

  run('git', ['add', 'package.json', 'package-lock.json']);
  run('git', ['commit', '-m', `release: ${tag}`]);
  run('git', ['tag', '-a', tag, '-m', tag]);
  run('git', ['push', '--atomic', 'origin', 'main', tag]);

  console.log(`Release ${tag} pushed. GitHub Actions will build and publish the DMG.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Release failed: ${message}`);
  process.exit(1);
}

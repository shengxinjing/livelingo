import fs from 'node:fs';
import path from 'node:path';

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]) + 1;
  return `${major}.${minor}.${patch}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const packageLockPath = path.join(root, 'package-lock.json');

const packageJson = readJson(packageJsonPath);
const currentVersion = String(packageJson.version ?? '0.0.0');
const nextVersion = bumpPatch(currentVersion);
packageJson.version = nextVersion;
writeJson(packageJsonPath, packageJson);

if (fs.existsSync(packageLockPath)) {
  const packageLock = readJson(packageLockPath);
  packageLock.version = nextVersion;
  if (packageLock.packages && packageLock.packages['']) {
    packageLock.packages[''].version = nextVersion;
  }
  writeJson(packageLockPath, packageLock);
}

console.log(`Version bumped: ${currentVersion} -> ${nextVersion}`);

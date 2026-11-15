#!/usr/bin/env node
// One-step setup after cloning: `npm install` (or `npm run setup`) in the repository root.
// Installs the server packages and creates zenzy_backend/.env from the example (branch duc: backend only).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const backend = path.join(root, 'zenzy_backend');
const notes = [];

function run(title, cmd, args, cwd) {
  console.log(`\n==> ${title}`);
  // shell: true so npm.cmd is found on Windows.
  const r = spawnSync([cmd, ...args].join(' '), { cwd, stdio: 'inherit', shell: true });
  return r.status === 0;
}

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`Node.js 22.9 or newer is required (found ${process.versions.node}). Install it from https://nodejs.org and run "npm install" again.`);
  process.exit(1);
}

// package-lock.json present -> exact, reproducible versions.
const npmArgs = fs.existsSync(path.join(backend, 'package-lock.json')) ? ['ci'] : ['install'];
if (!run(`Server packages (zenzy_backend: npm ${npmArgs[0]})`, 'npm', npmArgs, backend)) {
  console.error('\nInstalling the server packages failed. Fix the error above and run "npm install" again.');
  process.exit(1);
}

const env = path.join(backend, '.env');
if (!fs.existsSync(env)) {
  fs.copyFileSync(path.join(backend, '.env.example'), env);
  notes.push('Created zenzy_backend/.env from .env.example: open it and set MONGODB_URI (and the other values you need).');
}

console.log('\nSetup finished.');
for (const n of notes) console.log(`- ${n}`);
console.log(`
Next:
  npm run server     start the API on this PC (needs MongoDB, see README_DUC.md)
  npm test           run the API tests (uses an in-memory MongoDB, nothing to install)
  npm run docs       open the API documentation (Swagger UI)
Server addresses (host, ports, deployed URL): zenzy_backend/src/core/address.ts
`);

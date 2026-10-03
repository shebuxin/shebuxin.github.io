const { watch } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let timer;
let child;
let pending = false;
let stopping = false;

function build() {
  if (stopping) return;
  if (child) {
    pending = true;
    return;
  }
  pending = false;
  child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:js'], {
    cwd: root,
    stdio: 'inherit',
  });
  child.on('error', error => console.error(`JavaScript build could not start: ${error.message}`));
  child.on('close', code => {
    child = undefined;
    if (code && !stopping) console.error(`JavaScript build exited with code ${code}. Waiting for changes.`);
    if (pending) build();
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(build, 150);
}

const watchers = [
  watch(path.join(root, 'assets/js'), (_, name) => {
    if (name && name.toString() === '_main.js') schedule();
  }),
  watch(path.join(root, 'assets/js/plugins'), { recursive: true }, (_, name) => {
    if (!name || name.toString().endsWith('.js')) schedule();
  }),
];

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    clearTimeout(timer);
    watchers.forEach(watcher => watcher.close());
    if (child) child.kill(signal);
  });
}

console.log('Watching assets/js/_main.js and assets/js/plugins for changes.');
build();

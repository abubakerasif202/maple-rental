import { spawn } from 'node:child_process';

const run = (command, args, label) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      process.exit(code);
    }
  });

  return child;
};

run('node', ['--watch', 'server/index.js'], 'server');
run('npm', ['--prefix', 'client', 'run', 'dev'], 'client');

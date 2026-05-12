const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const ROOT = path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const ENV_PATH = path.join(ROOT, '.env.local');
const TUNNEL_TIMEOUT_MS = 30000;

const isWindows = process.platform === 'win32';
const venvBin = isWindows ? 'Scripts' : 'bin';

const LABELS = {
  tunnel:  { label: '[tunnel]',  color: chalk.blue },
  backend: { label: '[backend]', color: chalk.cyan },
  worker:  { label: '[worker]',  color: chalk.yellow },
  expo:    { label: '[expo]',    color: chalk.green },
};

let processes = [];
let cleanedUp = false;

function streamProcess(proc, label, color) {
  let stdoutBuf = '';
  let stderrBuf = '';

  function flush(buf, chunk) {
    buf += chunk;
    const lines = buf.split('\n');
    const tail = lines.pop();
    lines.forEach(line => { if (line) console.log(color(label) + ' ' + line); });
    return tail;
  }

  proc.stdout.on('data', data => { stdoutBuf = flush(stdoutBuf, data.toString()); });
  proc.stderr.on('data', data => { stderrBuf = flush(stderrBuf, data.toString()); });
  proc.stdout.on('end', () => { if (stdoutBuf) console.log(color(label) + ' ' + stdoutBuf); });
  proc.stderr.on('end', () => { if (stderrBuf) console.log(color(label) + ' ' + stderrBuf); });
}

function updateEnv(url) {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(chalk.red('[dev] .env.local not found at ' + ENV_PATH + '. Create it first.'));
    process.exit(1);
  }
  let content = fs.readFileSync(ENV_PATH, 'utf8');
  const key = 'EXPO_PUBLIC_BACKEND_URL';
  const regex = new RegExp('^' + key + '=.*', 'm');
  if (regex.test(content)) {
    content = content.replace(regex, key + '=' + url);
  } else {
    content = content.trimEnd() + '\n' + key + '=' + url + '\n';
  }
  fs.writeFileSync(ENV_PATH, content);
  console.log(chalk.blue('[tunnel]') + ' EXPO_PUBLIC_BACKEND_URL set to ' + url);
}

function killProc(proc) {
  if (!proc || !proc.pid) return;
  if (isWindows) {
    try {
      require('child_process').spawnSync(
        'taskkill', ['/F', '/T', '/PID', proc.pid.toString()], { stdio: 'ignore' }
      );
    } catch (e) {}
  } else {
    try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) {
      try { proc.kill('SIGKILL'); } catch (err) {}
    }
  }
}

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  processes.forEach(killProc);
  processes = [];
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

function spawnService(cmd, args, cwd, label, color, extraEnv = {}) {
  const proc = spawn(cmd, args, {
    cwd,
    shell: false,
    detached: !isWindows,
    env: { ...process.env, ...extraEnv, PYTHONUNBUFFERED: '1' },
  });
  streamProcess(proc, label, color);
  proc.on('exit', code => {
    if (code !== 0 && code !== null) {
      console.log(chalk.red(label + ' exited with code ' + code));
    }
  });
  processes.push(proc);
  return proc;
}

async function startTunnel() {
  return new Promise((resolve, reject) => {
    const { label, color } = LABELS.tunnel;
    console.log(color(label) + ' Starting cloudflared tunnel...');

    const cloudflaredExe = isWindows ? 'cloudflared.exe' : 'cloudflared';
    const proc = spawn(cloudflaredExe, ['tunnel', '--url', 'http://localhost:8000'], {
      shell: false,
      detached: !isWindows,
    });
    processes.push(proc);

    const timer = setTimeout(() => {
      reject(new Error('Tunnel URL not found within 30s. Is cloudflared installed and in PATH?'));
    }, TUNNEL_TIMEOUT_MS);

    let resolved = false;

    function onData(data) {
      const text = data.toString();
      text.split('\n').forEach(line => { if (line) console.log(color(label) + ' ' + line); });
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ url: match[0], proc });
      }
    }

    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);

    proc.on('exit', code => {
      if (!resolved) {
        clearTimeout(timer);
        reject(new Error('cloudflared exited with code ' + code + ' before URL was found'));
      }
    });

    proc.on('error', err => {
      if (!resolved) { clearTimeout(timer); reject(err); }
    });
  });
}

async function main() {
  try {
    const { url } = await startTunnel();
    updateEnv(url);

    const uvicorn = path.join(BACKEND_DIR, '.venv', venvBin, isWindows ? 'uvicorn.exe' : 'uvicorn');
    const celery  = path.join(BACKEND_DIR, '.venv', venvBin, isWindows ? 'celery.exe' : 'celery');

    spawnService(
      uvicorn, ['main:app', '--reload'], BACKEND_DIR,
      LABELS.backend.label, LABELS.backend.color, { PYTHONPATH: BACKEND_DIR }
    );

    spawnService(
      celery, ['-A', 'jobs.celery_app', 'worker', '--loglevel=info'], BACKEND_DIR,
      LABELS.worker.label, LABELS.worker.color, { PYTHONPATH: BACKEND_DIR }
    );

    // expo must inherit the parent TTY so ink renders the QR code (isTTY=false suppresses it)
    const npxExe = isWindows ? 'npx.cmd' : 'npx';
    const expoProc = spawn(npxExe, ['expo', 'start'], {
      cwd: ROOT,
      shell: false,
      stdio: 'inherit',
      env: { ...process.env },
    });
    expoProc.on('exit', code => {
      if (code !== 0 && code !== null) {
        console.log(chalk.red('[expo] exited with code ' + code));
      }
    });
    processes.push(expoProc);

  } catch (err) {
    console.error(chalk.red('[dev] ' + err.message));
    cleanup();
    process.exit(1);
  }
}

main();

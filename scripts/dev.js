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

# Dev Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken blessed TUI dev script with a clean color-prefixed log streaming orchestrator that starts cloudflared, syncs .env.local, then launches backend, worker, and expo.

**Architecture:** Single Node.js script. Sequential boot phase (tunnel → env write) then parallel service spawning. Each process streams line-buffered output with a colored label prefix. SIGINT kills all children cleanly.

**Tech Stack:** Node.js stdlib (`child_process`, `fs`, `path`), `chalk`.

---

### Task 1: Remove unused dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall blessed and blessed-contrib**

Run from project root:
```
npm uninstall blessed blessed-contrib
```

- [ ] **Step 2: Verify removal**

Check `package.json` — `blessed` and `blessed-contrib` should be gone from both `dependencies` and `devDependencies`. `chalk` must still be present.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused blessed TUI dependencies"
```

---

### Task 2: Write utility functions

**Files:**
- Modify: `scripts/dev.js`

- [ ] **Step 1: Write the full utility layer**

Replace the entire contents of `scripts/dev.js` with:

```javascript
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
  processes.forEach(killProc);
  processes = [];
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);
```

- [ ] **Step 2: Smoke-test the file parses cleanly**

Run:
```
node -e "require('./scripts/dev.js')"
```
Expected: process hangs (no `main()` call yet — that's fine). Press Ctrl+C to exit. No syntax errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/dev.js
git commit -m "feat: add dev script utility layer (streamProcess, updateEnv, cleanup)"
```

---

### Task 3: Write tunnel boot and service spawning

**Files:**
- Modify: `scripts/dev.js`

- [ ] **Step 1: Append `spawnService`, `startTunnel`, and `main` to `scripts/dev.js`**

Add the following after the last line of the existing file:

```javascript
function spawnService(cmd, args, cwd, label, color, extraEnv = {}) {
  const proc = spawn(cmd, args, {
    cwd,
    shell: true,
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

    const proc = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8000'], {
      shell: true,
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

    spawnService(
      'npx', ['expo', 'start'], ROOT,
      LABELS.expo.label, LABELS.expo.color
    );

  } catch (err) {
    console.error(chalk.red('[dev] ' + err.message));
    cleanup();
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Verify the file has no syntax errors**

Run:
```
node --check scripts/dev.js
```
Expected: no output (clean parse).

- [ ] **Step 3: Commit**

```bash
git add scripts/dev.js
git commit -m "feat: implement dev orchestrator with color-prefixed log streaming"
```

---

### Task 4: End-to-end verification

**Files:** none changed — this task is manual verification only.

- [ ] **Step 1: Start the dev script**

Run from project root:
```
npm run dev
```

- [ ] **Step 2: Verify tunnel phase**

Expected within ~10s:
- `[tunnel]` lines appear in blue while cloudflared initialises
- A line like `[tunnel] EXPO_PUBLIC_BACKEND_URL set to https://xxxx.trycloudflare.com` appears

- [ ] **Step 3: Verify .env.local was updated**

Open `.env.local`. Confirm `EXPO_PUBLIC_BACKEND_URL` contains the `trycloudflare.com` URL printed above. There should be exactly one occurrence of the key (no duplicates).

- [ ] **Step 4: Verify services start**

Expected shortly after the env write:
- `[backend]` lines in cyan (uvicorn startup messages)
- `[worker]` lines in yellow (celery startup messages)
- `[expo]` lines in green, including the QR code rendering in the terminal

- [ ] **Step 5: Verify clean shutdown**

Press Ctrl+C. Expected: process exits promptly with no hanging `uvicorn`, `celery`, or `cloudflared` processes.

Verify on Windows:
```
tasklist | findstr /I "uvicorn celery cloudflared node"
```
Expected: none of those processes appear.

- [ ] **Step 6: Commit (if any fixups were needed)**

If any bugs were fixed during verification, commit them:
```bash
git add scripts/dev.js
git commit -m "fix: <describe what was fixed>"
```

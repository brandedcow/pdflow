const blessed = require('blessed');
const contrib = require('blessed-contrib');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const screen = blessed.screen({
  smartCSR: true,
  title: 'pdflow Dev Dashboard'
});

const grid = new contrib.grid({
  rows: 12,
  cols: 12,
  screen: screen
});

const expoLog = grid.set(0, 0, 11, 7, blessed.log, {
  label: ' Expo ',
  border: { type: 'line' },
  scrollable: true
});

const backendLog = grid.set(0, 7, 5, 5, blessed.log, {
  label: ' Backend ',
  border: { type: 'line' },
  scrollable: true
});

const workerLog = grid.set(5, 7, 6, 5, blessed.log, {
  label: ' Worker ',
  border: { type: 'line' },
  scrollable: true
});

const footer = grid.set(11, 0, 1, 12, blessed.text, {
  content: ' q: Quit | r: Restart Backend | s: Clear Logs',
  style: { fg: 'black', bg: 'white' }
});

let processes = [];

function cleanup() {
    processes.forEach(p => {
        if (p && p.pid) {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/F', '/T', '/PID', p.pid.toString()], { stdio: 'ignore' });
            } else {
                try { process.kill(-p.pid); } catch (e) { p.kill(); }
            }
        }
    });
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
    cleanup();
    process.exit();
});

function updateEnv(url) {
    const ENV_PATH = path.join(__dirname, '..', '.env.local');
    let content = '';
    
    if (fs.existsSync(ENV_PATH)) {
        content = fs.readFileSync(ENV_PATH, 'utf8');
    }
    
    const key = 'EXPO_PUBLIC_EXTRACTION_API_URL';
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(content)) {
        content = content.replace(regex, `${key}=${url}`);
    } else {
        content += `\n${key}=${url}\n`;
    }
    fs.writeFileSync(ENV_PATH, content.trim() + '\n');
}

async function startTunnel() {
    return new Promise((resolve, reject) => {
        backendLog.log('{cyan-fg}Starting cloudflared tunnel...{/cyan-fg}');
        const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8000'], { shell: true });
        
        const exitHandler = (code) => {
            reject(new Error(`Cloudflared exited with code ${code} before finding URL`));
        };
        tunnel.on('exit', exitHandler);

        let resolved = false;
        tunnel.stderr.on('data', (data) => {
            const output = data.toString();
            backendLog.log(output);
            const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match && !resolved) {
                resolved = true;
                tunnel.removeListener('exit', exitHandler);
                resolve({ url: match[0], proc: tunnel });
            }
        });

        tunnel.on('error', (err) => {
            reject(err);
        });
    });
}

function startService(command, args, cwd, logPane, env = {}) {
    const proc = spawn(command, args, { 
        cwd, 
        shell: true, 
        env: { ...process.env, ...env, PYTHONUNBUFFERED: '1' } 
    });
    
    proc.stdout.on('data', (data) => {
        logPane.log(data.toString());
    });
    
    proc.stderr.on('data', (data) => {
        logPane.log(`{red-fg}${data.toString()}{/red-fg}`);
    });

    return proc;
}

let backendProc, workerProc, expoProc;
let uvicornPath, celeryPath, backendCwd, rootCwd;

function restartBackend() {
    backendLog.log('{yellow-fg}Restarting Backend and Worker...{/yellow-fg}');
    
    if (backendProc) {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/F', '/T', '/PID', backendProc.pid.toString()], { stdio: 'ignore' });
        } else {
            backendProc.kill();
        }
        processes = processes.filter(p => p !== backendProc);
    }
    
    if (workerProc) {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/F', '/T', '/PID', workerProc.pid.toString()], { stdio: 'ignore' });
        } else {
            workerProc.kill();
        }
        processes = processes.filter(p => p !== workerProc);
    }

    backendProc = startService(uvicornPath, ['main:app', '--reload'], backendCwd, backendLog, {
        PYTHONPATH: backendCwd
    });
    processes.push(backendProc);

    workerProc = startService(celeryPath, ['-A', 'jobs.celery_app', 'worker', '--loglevel=info'], backendCwd, workerLog, {
        PYTHONPATH: backendCwd
    });
    processes.push(workerProc);
}

async function main() {
  try {
    const { url, proc: tunnelProc } = await startTunnel();
    processes.push(tunnelProc);
    backendLog.log(`{green-fg}Tunnel active: ${url}{/green-fg}`);
    
    updateEnv(url);
    backendLog.log('{green-fg}.env.local updated with tunnel URL{/green-fg}');
    
    footer.setContent(` q: Quit | r: Restart | s: Clear | Tunnel: ${url}`);
    screen.render();

    const isWindows = process.platform === 'win32';
    const venvBin = isWindows ? 'Scripts' : 'bin';
    backendCwd = path.join(__dirname, '..', 'backend');
    rootCwd = path.join(__dirname, '..');
    
    uvicornPath = path.join(backendCwd, '.venv', venvBin, isWindows ? 'uvicorn.exe' : 'uvicorn');
    celeryPath = path.join(backendCwd, '.venv', venvBin, isWindows ? 'celery.exe' : 'celery');

    backendLog.log('{cyan-fg}Starting Backend...{/cyan-fg}');
    backendProc = startService(uvicornPath, ['main:app', '--reload'], backendCwd, backendLog, {
        PYTHONPATH: backendCwd
    });
    processes.push(backendProc);

    workerLog.log('{cyan-fg}Starting Worker...{/cyan-fg}');
    workerProc = startService(celeryPath, ['-A', 'jobs.celery_app', 'worker', '--loglevel=info'], backendCwd, workerLog, {
        PYTHONPATH: backendCwd
    });
    processes.push(workerProc);

    expoLog.log('{cyan-fg}Starting Expo...{/cyan-fg}');
    expoProc = startService('npx', ['expo', 'start'], rootCwd, expoLog);
    processes.push(expoProc);

  } catch (err) {
    backendLog.log(`{red-fg}Error: ${err.message}{/red-fg}`);
    if (err.message.includes('ENOENT')) {
        backendLog.log('{yellow-fg}Warning: cloudflared not found in PATH{/yellow-fg}');
    }
    screen.render();
  }
}

screen.key(['q', 'C-c'], () => {
    cleanup();
    process.exit(0);
});

screen.key(['r'], () => {
    restartBackend();
});

screen.key(['s'], () => {
    expoLog.setContent('');
    backendLog.setContent('');
    workerLog.setContent('');
    screen.render();
});

screen.render();
main();

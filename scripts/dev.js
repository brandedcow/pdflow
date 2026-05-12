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

function updateEnv(url) {
    const ENV_PATH = path.join(__dirname, '..', '.env.local');
    let content = '';
    
    if (fs.existsSync(ENV_PATH)) {
        content = fs.readFileSync(ENV_PATH, 'utf8');
    }
    
    const key = 'EXPO_PUBLIC_EXTRACTION_API_URL';
    if (content.includes(key)) {
        content = content.replace(new RegExp(`${key}=.*`), `${key}=${url}`);
    } else {
        content += `\n${key}=${url}\n`;
    }
    fs.writeFileSync(ENV_PATH, content.trim() + '\n');
}

async function startTunnel() {
    return new Promise((resolve, reject) => {
        backendLog.log('{cyan-fg}Starting cloudflared tunnel...{/cyan-fg}');
        const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8000'], { shell: true });
        
        tunnel.stderr.on('data', (data) => {
            const output = data.toString();
            // Optional: log tunnel stderr to backend log for debugging
            // backendLog.log(output);
            
            const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match) {
                resolve({ url: match[0], proc: tunnel });
            }
        });

        tunnel.on('error', (err) => {
            reject(err);
        });
    });
}

async function main() {
  try {
    const { url, proc } = await startTunnel();
    backendLog.log(`{green-fg}Tunnel active: ${url}{/green-fg}`);
    
    updateEnv(url);
    backendLog.log('{green-fg}.env.local updated with tunnel URL{/green-fg}');
    
    // Log success to footer or a specific pane
    footer.setContent(` q: Quit | r: Restart | Tunnel: ${url}`);
    screen.render();

    // Here we would typically start the other processes
    // startBackend();
    // startWorker();
    // startExpo();

  } catch (err) {
    backendLog.log(`{red-fg}Error: ${err.message}{/red-fg}`);
    if (err.message.includes('ENOENT')) {
        backendLog.log('{yellow-fg}Warning: cloudflared not found in PATH{/yellow-fg}');
    }
    screen.render();
  }
}

screen.key(['q', 'C-c'], () => {
    process.exit(0);
});

screen.render();
main();

# TUI Development Orchestrator Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a robust, TUI-based dev script that manages Cloudflare tunnels, environment variables, and multiple service logs.

**Architecture:** A Node.js orchestrator using `blessed` for the UI, `child_process.spawn` for service management, and a sequential bootloader to ensure environment sync.

**Tech Stack:** Node.js, `blessed`, `blessed-contrib`, `chalk`.

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install TUI and logging libraries**

Run: `npm install blessed blessed-contrib chalk`

**Step 2: Verify installation**

Check `package.json` for new dependencies.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dependencies for TUI dev script"
```

---

### Task 2: Basic TUI Layout Setup

**Files:**
- Modify: `scripts/dev.js`

**Step 1: Implement basic screen and grid layout**

```javascript
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const screen = blessed.screen({ smartCSR: true, title: 'pdflow Dev Dashboard' });
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

const expoLog = grid.set(0, 0, 11, 7, blessed.log, { label: ' Expo ', border: { type: 'line' }, scrollable: true });
const backendLog = grid.set(0, 7, 5, 5, blessed.log, { label: ' Backend ', border: { type: 'line' }, scrollable: true });
const workerLog = grid.set(5, 7, 6, 5, blessed.log, { label: ' Worker ', border: { type: 'line' }, scrollable: true });
const footer = grid.set(11, 0, 1, 12, blessed.text, { content: ' q: Quit | r: Restart Backend | s: Clear Logs', style: { fg: 'black', bg: 'white' } });

screen.key(['q', 'C-c'], () => process.exit(0));
screen.render();
```

**Step 2: Run to verify layout**

Run: `node scripts/dev.js`
Expected: TUI appears with three empty panes and a footer. Exit with 'q'.

**Step 3: Commit**

```bash
git add scripts/dev.js
git commit -m "feat: implement basic TUI layout for dev script"
```

---

### Task 3: Tunnel URL Extraction & Env Sync

**Files:**
- Modify: `scripts/dev.js`

**Step 1: Implement tunnel URL regex and .env.local update**

```javascript
// ... after screen setup
function updateEnv(url) {
    const ENV_PATH = path.join(__dirname, '..', '.env.local');
    let content = fs.readFileSync(ENV_PATH, 'utf8');
    const key = 'EXPO_PUBLIC_EXTRACTION_API_URL';
    if (content.includes(key)) {
        content = content.replace(new RegExp(`${key}=.*`), `${key}=${url}`);
    } else {
        content += `\n${key}=${url}\n`;
    }
    fs.writeFileSync(ENV_PATH, content.trim() + '\n');
}

async function startTunnel() {
    return new Promise((resolve) => {
        const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8000'], { shell: true });
        tunnel.stderr.on('data', (data) => {
            const match = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match) resolve(match[0]);
        });
    });
}
```

**Step 2: Verify logic with a mock tunnel start**

**Step 3: Commit**

```bash
git add scripts/dev.js
git commit -m "feat: add tunnel URL extraction and env sync"
```

---

### Task 4: Process Management and Logging

**Files:**
- Modify: `scripts/dev.js`

**Step 1: Implement ProcessHandler to pipe logs to TUI panes**

```javascript
function startService(command, args, cwd, logPane, env = {}) {
    const proc = spawn(command, args, { cwd, shell: true, env: { ...process.env, ...env } });
    proc.stdout.on('data', (data) => logPane.log(data.toString()));
    proc.stderr.on('data', (data) => logPane.log(`{red-fg}${data.toString()}{/red-fg}`));
    return proc;
}
```

**Step 2: Integration of all services in main()**

**Step 3: Test full startup sequence**

**Step 4: Commit**

```bash
git add scripts/dev.js
git commit -m "feat: integrate backend, worker, and expo processes into TUI"
```

---

### Task 5: Robust Cleanup

**Files:**
- Modify: `scripts/dev.js`

**Step 1: Implement recursive process kill for Windows**

```javascript
function cleanup() {
    processes.forEach(p => {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/F', '/T', '/PID', p.pid]);
        } else {
            p.kill();
        }
    });
}
process.on('exit', cleanup);
```

**Step 2: Verify no orphan processes remain**

**Step 3: Commit**

```bash
git add scripts/dev.js
git commit -m "fix: implement robust process cleanup"
```

---

### Task 6: TUI Interactivity (Focus & Scrolling)

**Files:**
- Modify: `scripts/dev.js`

**Step 1: Implement focus management and scrolling keys**

```javascript
let focusedPane = expoLog;
const panes = [expoLog, backendLog, workerLog];

function setFocus(pane) {
    panes.forEach(p => {
        p.style.border.fg = 'default';
        p.style.label.fg = 'default';
    });
    pane.style.border.fg = 'cyan';
    pane.style.label.fg = 'cyan';
    focusedPane = pane;
    screen.render();
}

// Initial focus
setFocus(expoLog);

// Tab to cycle focus
screen.key(['tab'], () => {
    const idx = panes.indexOf(focusedPane);
    setFocus(panes[(idx + 1) % panes.length]);
});

// Scrolling keys
screen.key(['up', 'k'], () => focusedPane.scroll(-1));
screen.key(['down', 'j'], () => focusedPane.scroll(1));
screen.key(['pageup'], () => focusedPane.scroll(-focusedPane.height + 2));
screen.key(['pagedown'], () => focusedPane.scroll(focusedPane.height - 2));

// Mouse support
screen.enableMouse();
panes.forEach(pane => {
    pane.on('click', () => setFocus(pane));
    pane.on('element wheeldown', () => pane.scroll(1));
    pane.on('element wheelup', () => pane.scroll(-1));
});
```

**Step 2: Commit**

```bash
git add scripts/dev.js
git commit -m "feat: add focus management and scrolling to TUI"
```

---

### Task 7: Maximize Pane Toggle

**Files:**
- Modify: `scripts/dev.js`

**Step 1: Implement 'm' key to toggle fullscreen for focused pane**

```javascript
let isMaximized = false;
let originalPositions = new Map();

screen.key(['m'], () => {
    if (isMaximized) {
        // Restore all
        panes.forEach(p => {
            const pos = originalPositions.get(p);
            p.position.left = pos.left;
            p.position.top = pos.top;
            p.position.width = pos.width;
            p.position.height = pos.height;
            p.hidden = false;
        });
        isMaximized = false;
    } else {
        // Save current positions and maximize focused
        panes.forEach(p => {
            originalPositions.set(p, {
                left: p.position.left,
                top: p.position.top,
                width: p.position.width,
                height: p.position.height
            });
            if (p !== focusedPane) p.hidden = true;
        });
        focusedPane.position.left = 0;
        focusedPane.position.top = 0;
        focusedPane.position.width = '100%';
        focusedPane.position.height = '92%'; // Leave room for footer
        isMaximized = true;
    }
    screen.render();
});
```

**Step 2: Commit**

```bash
git add scripts/dev.js
git commit -m "feat: implement maximize pane toggle"
```

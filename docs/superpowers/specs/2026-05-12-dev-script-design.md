# Design Spec: Unified Dev Startup Script

## Overview

A single Node.js script (`scripts/dev.js`) that orchestrates the full dev environment startup: Cloudflare tunnel, FastAPI backend, Celery worker, and Expo — in the correct order, with color-prefixed log streaming to a single terminal.

## Problem Statement

Starting the dev environment requires multiple terminals, and the critical step of writing the tunnel URL to `.env.local` before Expo starts is manual and error-prone. The previous `blessed` TUI implementation broke Expo's QR code rendering and produced poorly formatted logs.

## Architecture

Single-file Node.js script. No TUI framework. Uses `child_process.spawn` and `chalk`. Runs in three sequential phases.

### Startup Sequence

1. **Boot phase**: spawn `cloudflared tunnel --url http://localhost:8000`, stream its stderr with a `[tunnel]` prefix, block until a `trycloudflare.com` URL is captured. Timeout after 30s — exit 1 with a clear error.
2. **Env write**: rewrite `EXPO_PUBLIC_BACKEND_URL` in `.env.local` (replace existing line or append). Print the URL. Exit 1 if `.env.local` doesn't exist.
3. **Service phase**: spawn backend (`uvicorn`), worker (`celery`), and expo (`npx expo start`) in parallel. Tunnel process continues running alongside.

### Color Assignments

| Service  | Label       | Color  |
|----------|-------------|--------|
| Tunnel   | `[tunnel]`  | Blue   |
| Backend  | `[backend]` | Cyan   |
| Worker   | `[worker]`  | Yellow |
| Expo     | `[expo]`    | Green  |

## Components

### `streamProcess(proc, label, color)`

Attaches to a process's stdout and stderr. Line-buffers output (holds partial lines until a newline arrives), then prints `color('[label]') + ' ' + line` for each complete line. Both stdout and stderr go through the same prefix — no distinction needed at this stage.

### `updateEnv(url)`

Reads `.env.local` from the project root. Replaces `EXPO_PUBLIC_BACKEND_URL=...` if present, otherwise appends it. Writes back atomically. Exits 1 with a clear message if the file is missing.

### `main()`

Orchestrates the three phases in sequence. If a spawned service exits unexpectedly after startup, logs `[label] exited with code N` in red but does not kill sibling processes.

## Error Handling

- **Tunnel timeout (30s)**: print error, exit 1.
- **Missing `.env.local`**: print error, exit 1.
- **Service exits unexpectedly**: log in red, leave other services running.
- **SIGINT (Ctrl+C)**: kill all child processes using `taskkill /F /T /PID` on Windows, `SIGKILL` on Unix, then exit 0.

## Package Changes

- **Remove**: `blessed`, `blessed-contrib` (unused after TUI removal).
- **Keep**: `chalk` (already present, used for color prefixes).

## What's Out of Scope

- Restart commands (`r` to restart backend)
- Per-service pane toggling
- Status line / header
- Auto-retry on tunnel drop

These are reasonable next additions once the base is solid.

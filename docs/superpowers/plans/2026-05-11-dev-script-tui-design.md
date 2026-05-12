# Design Spec: TUI-based Development Orchestrator

## Overview
A robust development script (`scripts/dev.js`) that orchestrates the startup of the full stack (Cloudflare Tunnel, FastAPI Backend, Celery Worker, and Expo) using a Terminal User Interface (TUI) for clear log management and process control.

## Problem Statement
Developing the mobile app requires multiple services to be running simultaneously. Currently, starting these involves multiple terminal windows, and the critical step of updating the Expo environment with a dynamic Cloudflare Tunnel URL is manual and error-prone.

## Architecture
The script acts as a state-aware orchestrator using `blessed` to manage a multi-pane TUI.

### Initialization Sequence
1. **Tunnel Initialization**: Start `cloudflared tunnel`. Block further execution until the `trycloudflare.com` URL is captured.
2. **Environment Sync**: Atomically update `.env.local` with `EXPO_PUBLIC_EXTRACTION_API_URL`.
3. **Service Launch**: Launch Backend, Worker, and Expo in parallel.
4. **Active Monitoring**: Capture logs, manage process lifecycles, and handle user input.

## TUI Layout
- **Header**: Displays Tunnel URL and service health status.
- **Left Pane (Large)**: Interactive Expo logs and QR code.
- **Right Top Pane**: FastAPI Backend logs.
- **Right Bottom Pane**: Celery Worker logs.
- **Footer**: Keyboard shortcuts (`q` to quit, `r` to restart backend, etc.).

## Components
- **TuiManager**: Manages the `blessed` screen, grid layout, and keyboard event routing.
- **ProcessHandler**: Wraps `child_process.spawn`. Features:
    - Log buffering and scroll management.
    - Error detection via regex (highlighting panes on failure).
    - Recursive process tree cleanup (crucial for Windows).
    - Platform-specific path resolution (venv/Scripts vs venv/bin).

## Error Handling & Edge Cases
- **Tunnel Timeout**: 15-second grace period for URL generation before failing fast.
- **Zombie Processes**: Uses `taskkill /F /T` on Windows to ensure no background processes persist after the TUI closes.
- **Port Conflicts**: Graceful detection of busy ports with UI alerts.
- **Network Recovery**: Auto-restarts the tunnel if the connection drops.

## Implementation Details
- **Dependencies**: `blessed`, `blessed-contrib`, `chalk`.
- **Environment**: Node.js.
- **Platform Support**: Primary focus on Windows (PowerShell/CMD), secondary support for Unix.

## Verification Plan
1. **Startup Check**: Verify all panes populate and the Tunnel URL appears in the header.
2. **Env Check**: Confirm `.env.local` is updated correctly before Expo finishes loading.
3. **Cleanup Check**: Ensure no `uvicorn`, `celery`, or `cloudflared` processes remain after exiting.

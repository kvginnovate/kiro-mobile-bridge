# Technical Architecture

## Technology Stack
- **Runtime**: Node.js 18+ (ES modules)
- **Backend**: Express.js for HTTP server
- **Real-time**: WebSocket (ws library) for live updates
- **Protocol**: Chrome DevTools Protocol (CDP) for Kiro communication
- **Frontend**: Vanilla HTML/CSS/JS (mobile-optimized)

## Architecture Overview
```
┌─────────────────┐     CDP      ┌─────────────────┐
│   Kiro IDE      │◄────────────►│  Bridge Server  │
│ (port 9000-9003)│              │   (port 3000)   │
└─────────────────┘              └────────┬────────┘
                                          │
                                   HTTP + WebSocket
                                          │
                                 ┌────────▼────────┐
                                 │  Mobile Client  │
                                 │   (browser)     │
                                 └─────────────────┘
```

**Components:**
- **Discovery Service**: Scans ports 9000-9003 for Kiro instances every 10s
- **CDP Client**: Connects to Kiro via WebSocket, captures DOM snapshots
- **HTTP API**: REST endpoints for snapshots, cascades, and actions
- **WebSocket Server**: Pushes real-time updates to mobile clients
- **Static Server**: Serves mobile web interface

## Development Environment
- Node.js 18+
- npm for package management
- Any code editor (VS Code, Kiro IDE recommended)
- Kiro IDE with `--remote-debugging-port` flag for testing

## Code Standards
- ES modules (`import`/`export`)
- Async/await for asynchronous operations
- Descriptive function and variable names
- JSDoc comments for public APIs
- Single-file server architecture (server.js)

## Testing Strategy
- Manual testing with Kiro IDE instances
- Test across different mobile browsers (Chrome, Safari)
- Verify WebSocket reconnection behavior
- Test discovery across port range

## Deployment Process
- Local development only (LAN-based tool)
- `npm install` → `npm start`
- Environment variable `PORT` for custom port

## Performance Requirements
- Snapshot capture: < 500ms
- WebSocket latency: < 100ms
- Discovery cycle: 10 seconds
- Snapshot polling: 3 seconds
- Support multiple concurrent mobile clients

## Security Considerations
- **LAN-only**: No authentication (trusted network assumption)
- **No HTTPS**: Local network traffic only
- **Firewall**: Users must allow port 3000 access
- **Warning**: Not suitable for public/untrusted networks

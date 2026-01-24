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
│ (port 9222,9229)│              │                 │
└─────────────────┘              └────────┬────────┘
                                          │
                                   HTTP + WebSocket
                                          │
                                 ┌────────▼────────┐
                                 │  Mobile Client  │
                                 │   (browser)     │
                                 └─────────────────┘
```

**Server Components (Modular):**
- **Discovery Service** (`server.js`): Scans ports 9000-9003, 9222, 9229 for Kiro instances
- **CDP Service** (`services/cdp.js`): WebSocket connection, context management, RPC calls
- **Snapshot Service** (`services/snapshot.js`): DOM capture for chat, editor, CSS
- **Click Service** (`services/click.js`): UI element interaction via CDP
- **Message Service** (`services/message.js`): Chat input injection
- **API Routes** (`routes/api.js`): REST endpoints for mobile client
- **WebSocket Server** (`server.js`): Real-time updates to mobile clients

## Module Dependencies
```
server.js
├── services/cdp.js        # CDP connection management
├── services/snapshot.js   # DOM capture functions
├── routes/api.js
│   ├── services/message.js  # Chat injection
│   └── services/click.js    # Element clicking
└── utils/
    ├── hash.js            # MD5 for change detection
    └── network.js         # Local IP detection
```

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
- Modular architecture with clear separation of concerns
- IIFE pattern for CDP expressions (null safety)

## Testing Strategy
- Manual testing with Kiro IDE instances
- Test across different mobile browsers (Chrome, Safari)
- Verify WebSocket reconnection behavior
- Test discovery across port range

## Deployment Process
- Local development only (LAN-based tool)
- `npm install` → `npm start`
- Environment variable `PORT` for custom port
- Published to npm as `kiro-mobile-bridge`

## Performance Requirements
- Snapshot capture: < 500ms
- WebSocket latency: < 100ms
- Discovery cycle: 10s (active) → 30s (stable) - adaptive
- Snapshot polling: 1s (active) → 3s (idle) - adaptive
- Support multiple concurrent mobile clients

## Security Considerations
- **LAN-only**: No authentication (trusted network assumption)
- **No HTTPS**: Local network traffic only
- **Firewall**: Users must allow port 3000 access
- **Warning**: Not suitable for public/untrusted networks

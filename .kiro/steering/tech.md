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

## Architecture Design Decisions

### Self-Contained Mobile UI (`index.html`)
The mobile client is intentionally a single self-contained HTML file (~4000 lines) for these reasons:
- **Zero build step**: No webpack, no bundling - just works
- **Offline-capable**: All CSS/JS inline, only external dependency is codicon font
- **Fast loading**: Single HTTP request for entire UI
- **Easy debugging**: View source shows everything
- **Mobile-first**: Optimized for phone browsers with touch targets, viewport handling

### Comprehensive Click Service (`click.js`)
The click service is feature-rich (~1400 lines) because it handles the full complexity of Kiro's UI:
- **Multiple element types**: Tabs, buttons, toggles, model selectors, dialogs, notifications
- **React fiber detection**: Finds actual click handlers in React components
- **Fallback strategies**: Multiple selector approaches for reliability
- **Context-aware clicking**: Message action buttons use parent context for accuracy
- **VS Code patterns**: Handles nested iframes, portals, and floating elements

### DOM Capture Approach
Full HTML capture (not incremental) is intentional:
- **Preserves Kiro styling**: Original CSS classes and structure maintained
- **Reliable rendering**: No sync issues between partial updates
- **Hash-based optimization**: Only broadcasts when content actually changes
- **Checkbox state sync**: Properly syncs JS properties to HTML attributes for cloning

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

### Intentional Security Model
- **Zero-config access by design**: No authentication is a deliberate choice, not a missing feature. Authentication would add friction (password management, token handling, session expiration) that defeats the core "just works" philosophy.
- **Trusted network only**: Same security model as every local dev server (webpack-dev-server, Vite, Create React App). If you trust `localhost:3000`, you can trust this on your LAN.
- **No HTTPS by design**: LAN traffic doesn't traverse the internet. Self-signed certs trigger browser warnings; CA-signed certs require domain ownership. Plain HTTP is the pragmatic choice.

### Operational Security
- **Firewall**: Users must allow port 3000 access
- **Network scope**: Designed for home/office WiFi where you control devices
- **Threat model**: If attackers are on your LAN, you have bigger problems

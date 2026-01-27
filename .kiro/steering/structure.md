# Project Structure

## Directory Layout
```
kiro-mobile-bridge/
├── src/
│   ├── server.js           # Main server orchestration (Express + WebSocket)
│   ├── public/
│   │   └── index.html      # Mobile web interface (self-contained)
│   ├── routes/
│   │   └── api.js          # REST API endpoints
│   ├── services/
│   │   ├── cdp.js          # Chrome DevTools Protocol connection
│   │   ├── snapshot.js     # DOM snapshot capture (chat, editor, CSS)
│   │   ├── click.js        # UI element click handling
│   │   └── message.js      # Chat message injection
│   └── utils/
│       ├── constants.js    # Configuration constants (ports, intervals, limits)
│       ├── hash.js         # MD5 hashing for change detection
│       ├── network.js      # Local IP detection
│       └── security.js     # Input validation, path traversal prevention, XSS protection
├── package.json            # Dependencies and scripts
├── package-lock.json       # Locked dependency versions
├── .gitignore              # Git ignore rules
├── README.md               # Project documentation
├── DEVLOG.md               # Development log
├── CHANGELOG.md            # Version history
└── LICENSE                 # MIT license
```

## File Naming Conventions
- Lowercase with hyphens for files (`server.js`, `index.html`)
- Descriptive names reflecting purpose
- `.js` extension for ES modules
- Service files named by domain (`cdp.js`, `snapshot.js`)

## Module Organization
- **Modular architecture**: Separation of concerns across services
- **Services layer**: CDP, snapshot, click, message services
- **Routes layer**: Express API endpoints
- **Utils layer**: Shared utilities (constants, hash, network, security)
- **No build step**: Direct execution with Node.js

## Service Responsibilities
- `cdp.js` - CDP WebSocket connection, context management, RPC calls
- `snapshot.js` - DOM capture (metadata, CSS, chat HTML, editor content)
- `click.js` - Element finding and click simulation via CDP
- `message.js` - Chat input injection and submit handling
- `api.js` - REST endpoints for mobile client communication

## Utility Responsibilities
- `constants.js` - CDP ports, polling intervals, timeouts, file limits, language mappings
- `hash.js` - MD5 hashing for change detection, cascade ID generation
- `network.js` - Local IP detection for network URL display
- `security.js` - Path traversal validation, JavaScript escaping, input sanitization

## Configuration Files
- `package.json` - Project metadata and dependencies
- `.gitignore` - Excludes `node_modules/`
- Environment variables for runtime config (`PORT`)

## Documentation Structure
- `README.md` - Setup, usage, API reference, troubleshooting
- `DEVLOG.md` - Development history and decisions
- `CHANGELOG.md` - Version release notes
- Inline code comments for complex logic
- JSDoc for public APIs

## Asset Organization
- `src/public/` - Static web assets
  - `index.html` - Mobile interface (self-contained HTML/CSS/JS)

## Build Artifacts
- `node_modules/` - Installed dependencies (gitignored)
- No compilation or bundling required

## Environment-Specific Files
- Single environment (local development)
- `PORT` environment variable for custom port binding

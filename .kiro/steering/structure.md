# Project Structure

## Directory Layout
```
kiro-mobile-bridge/
├── server.js           # Main server (Express + WebSocket + CDP)
├── public/             # Static frontend files
│   └── index.html      # Mobile web interface
├── package.json        # Dependencies and scripts
├── package-lock.json   # Locked dependency versions
├── .gitignore          # Git ignore rules
└── README.md           # Project documentation
```

## File Naming Conventions
- Lowercase with hyphens for files (`server.js`, `index.html`)
- Descriptive names reflecting purpose
- `.js` extension for ES modules

## Module Organization
- **Single-file architecture**: All server logic in `server.js`
- **Inline frontend**: HTML/CSS/JS served from `public/`
- **No build step**: Direct execution with Node.js

## Configuration Files
- `package.json` - Project metadata and dependencies
- `.gitignore` - Excludes `node_modules/`
- Environment variables for runtime config (`PORT`)

## Documentation Structure
- `README.md` - Setup, usage, API reference, troubleshooting
- Inline code comments for complex logic
- JSDoc for public functions

## Asset Organization
- `public/` - Static web assets
  - `index.html` - Mobile interface (self-contained)

## Build Artifacts
- `node_modules/` - Installed dependencies (gitignored)
- No compilation or bundling required

## Environment-Specific Files
- Single environment (local development)
- `PORT` environment variable for custom port binding

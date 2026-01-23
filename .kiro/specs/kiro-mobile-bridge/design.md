# Design: Kiro Mobile Bridge

## Overview

Simple server that connects to Kiro via CDP, captures chat snapshots, and serves them to a mobile web client.

## Architecture

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

## Server Components

### State Management

```javascript
// Map of active cascades (chat sessions)
let cascades = new Map(); // cascadeId -> { id, cdp, metadata, snapshot, css, snapshotHash }
```

### CDP Connection

```javascript
interface CDPConnection {
  ws: WebSocket;           // CDP WebSocket
  call: (method, params) => Promise<any>;  // Send CDP command
  contexts: ExecutionContext[];  // Runtime contexts
  rootContextId: number | null;  // Main context for evaluation
}
```

### Cascade Object

```javascript
interface Cascade {
  id: string;              // Hash of WebSocket URL
  cdp: CDPConnection;
  metadata: {
    windowTitle: string;
    chatTitle: string;
    isActive: boolean;
  };
  snapshot: {
    html: string;
    bodyBg: string;
    bodyColor: string;
  } | null;
  css: string;             // Captured once on connect
  snapshotHash: string | null;
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cascades` | List active chat sessions |
| GET | `/snapshot/:id` | Get HTML snapshot for a cascade |
| GET | `/snapshot` | Get snapshot of first active cascade |
| GET | `/styles/:id` | Get CSS for a cascade |
| POST | `/send/:id` | Send message to a cascade |

## WebSocket Messages

### Server → Client

```javascript
// Cascade list update
{ type: 'cascade_list', cascades: [{ id, title, window, active }] }

// Snapshot changed
{ type: 'snapshot_update', cascadeId: string }
```

## CDP Scripts

### Extract Metadata
Finds the chat element and extracts title/active state.

### Capture CSS
Gathers all stylesheets and namespaces them to prevent style leaks.

### Capture HTML
Clones the chat element, removes input area, returns HTML with body styles.

### Inject Message
Finds input element, inserts text, triggers send button or Enter key.

## Polling Intervals

- **Discovery**: Every 10 seconds - scan for new/removed Kiro instances
- **Snapshots**: Every 3 seconds - capture HTML changes

## Mobile Client

Single HTML page with:
- Iframe or div to render captured HTML + CSS
- WebSocket connection for real-time updates
- Simple message input form
- Connection status indicator

## Dependencies

```json
{
  "express": "^4.18.2",
  "ws": "^8.18.0"
}
```

That's it. No auth, no HTTPS, no mDNS - just works over LAN.

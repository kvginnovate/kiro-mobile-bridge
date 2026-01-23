# Tasks: Kiro Mobile Bridge

## Overview

Build a simple mobile monitor for Kiro IDE.

## Tasks

- [x] 1. Set up project structure
  - [x] 1.1 Create `kiro-mobile-bridge/` directory with `server.js` and `public/` folder
  - [x] 1.2 Create package.json with express and ws dependencies
  - [x] 1.3 Set up ES modules (type: module)

- [x] 2. Implement CDP connection
  - [x] 2.1 Create helper to fetch JSON from CDP endpoints (`/json/list`)
  - [x] 2.2 Implement WebSocket connection to CDP target
  - [x] 2.3 Implement CDP `call()` method for sending commands
  - [x] 2.4 Track execution contexts from Runtime events

- [x] 3. Implement discovery loop
  - [x] 3.1 Scan ports 9000-9003 for CDP targets
  - [x] 3.2 Filter for workbench targets
  - [x] 3.3 Connect to new targets, reuse existing connections
  - [x] 3.4 Clean up disconnected targets
  - [x] 3.5 Run discovery every 10 seconds

- [x] 4. Implement snapshot capture
  - [x] 4.1 Write CDP script to extract chat metadata (title, active state)
  - [x] 4.2 Write CDP script to capture CSS (run once per connection)
  - [x] 4.3 Write CDP script to capture HTML snapshot
  - [x] 4.4 Implement hash comparison to detect changes
  - [x] 4.5 Run snapshot polling every 3 seconds

- [x] 5. Implement Express server
  - [x] 5.1 Set up Express with JSON middleware
  - [x] 5.2 Serve static files from `public/` directory
  - [x] 5.3 Add GET `/cascades` endpoint
  - [x] 5.4 Add GET `/snapshot/:id` and `/snapshot` endpoints
  - [x] 5.5 Add GET `/styles/:id` endpoint
  - [x] 5.6 Add POST `/send/:id` endpoint

- [x] 6. Implement message injection
  - [x] 6.1 Write CDP script to find input element (contenteditable or textarea)
  - [x] 6.2 Insert text into input element
  - [x] 6.3 Trigger send button click or Enter key

- [x] 7. Implement WebSocket server
  - [x] 7.1 Create WebSocketServer attached to HTTP server
  - [x] 7.2 Send cascade list on client connect
  - [x] 7.3 Broadcast snapshot updates when content changes

- [x] 8. Create mobile client UI
  - [x] 8.1 Create `public/index.html` with basic structure
  - [x] 8.2 Add container to render captured HTML + CSS
  - [x] 8.3 Add WebSocket connection logic
  - [x] 8.4 Fetch and display snapshots on update
  - [x] 8.5 Add message input form
  - [x] 8.6 Add connection status indicator
  - [x] 8.7 Style for mobile viewport

- [x] 9. Test and polish
  - [x] 9.1 Test with Kiro running with `--remote-debugging-port=9000`
  - [x] 9.2 Test from mobile device on same network
  - [x] 9.3 Add README with setup instructions

## Notes

- No authentication needed - LAN only
- No HTTPS - keep it simple


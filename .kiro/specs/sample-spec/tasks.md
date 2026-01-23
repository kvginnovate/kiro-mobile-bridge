# Tasks: sample

## Overview

Build a simple mobile monitor for Kiro, following the Antigravity-Shit-Chat pattern.

## Tasks

- [ ] 1. Set up project structure
  - [ ] 1.1 Create `kiro-mobile-bridge/` directory with `server.js` and `public/` folder
  - [ ] 1.2 Create package.json with express and ws dependencies
  - [ ] 1.3 Set up ES modules (type: module)

- [ ] 2. Implement CDP connection
  - [ ] 2.1 Create helper to fetch JSON from CDP endpoints (`/json/list`)
  - [ ] 2.2 Implement WebSocket connection to CDP target
  - [ ] 2.3 Implement CDP `call()` method for sending commands
  - [ ] 2.4 Track execution contexts from Runtime events

- [ ] 3. Implement discovery loop
  - [ ] 3.1 Scan ports 9000-9003 for CDP targets
  - [ ] 3.2 Filter for workbench targets
  - [ ] 3.3 Connect to new targets, reuse existing connections
  - [ ] 3.4 Clean up disconnected targets
  - [ ] 3.5 Run discovery every 10 seconds

- [ ] 4. Implement snapshot capture
  - [ ] 4.1 Write CDP script to extract chat metadata (title, active state)
  - [ ] 4.2 Write CDP script to capture CSS (run once per connection)
  - [ ] 4.3 Write CDP script to capture HTML snapshot
  - [ ] 4.4 Implement hash comparison to detect changes
  - [ ] 4.5 Run snapshot polling every 3 seconds

- [ ] 5. Implement Express server
  - [ ] 5.1 Set up Express with JSON middleware
  - [ ] 5.2 Serve static files from `public/` directory
  - [ ] 5.3 Add GET `/cascades` endpoint
  - [ ] 5.4 Add GET `/snapshot/:id` and `/snapshot` endpoints
  - [ ] 5.5 Add GET `/styles/:id` endpoint
  - [ ] 5.6 Add POST `/send/:id` endpoint

- [ ] 6. Implement message injection
  - [ ] 6.1 Write CDP script to find input element (contenteditable or textarea)
  - [ ] 6.2 Insert text into input element
  - [ ] 6.3 Trigger send button click or Enter key

- [] 7. Implement WebSocket server
  - [ ] 7.1 Create WebSocketServer attached to HTTP server
  - [ ] 7.2 Send cascade list on client connect
  - [ ] 7.3 Broadcast snapshot updates when content changes

- [ ] 8. Create mobile client UI
  - [ ] 8.1 Create `public/index.html` with basic structure
  - [ ] 8.2 Add container to render captured HTML + CSS
  - [ ] 8.3 Add WebSocket connection logic
  - [ ] 8.4 Fetch and display snapshots on update
  - [ ] 8.5 Add message input form
  - [ ] 8.6 Add connection status indicator
  - [ ] 8.7 Style for mobile viewport

- [ ] 9. Test and polish
  - [ ] 9.1 Test with Kiro running with `--remote-debugging-port=9000`
  - [ ] 9.2 Test from mobile device on same network
  - [ ] 9.3 Add README with setup instructions


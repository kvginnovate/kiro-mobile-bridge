# Requirements: Kiro Mobile Bridge

## Introduction

A simple mobile web interface for monitoring Kiro IDE agent sessions from your phone over LAN. Inspired by Antigravity-Shit-Chat - captures snapshots of the chat interface via CDP and lets you send messages remotely.

## Glossary

- **Bridge_Server**: HTTP/WebSocket server running alongside Kiro that serves the mobile UI
- **Mobile_Client**: Browser-based mobile interface on your phone
- **Snapshot**: HTML capture of the current chat interface
- **CDP**: Chrome DevTools Protocol - used to read/inject into Kiro

## Requirements

### Requirement 1: Server Startup

**User Story:** As a developer, I want to start a mobile bridge server so I can monitor Kiro from my phone.

#### Acceptance Criteria

1. WHEN the server starts, IT SHALL listen on port 3000 (or configurable via PORT env)
2. WHEN the server starts, IT SHALL display the connection URL with local IP
3. THE server SHALL serve static files from a public directory

### Requirement 2: CDP Discovery

**User Story:** As a developer, I want the server to automatically find my Kiro instance.

#### Acceptance Criteria

1. THE server SHALL scan ports 9000-9003 for CDP targets
2. THE server SHALL connect to targets with "workbench" in the URL or title
3. WHEN a target disconnects, THE server SHALL remove it from the active list
4. THE server SHALL re-discover targets every 10 seconds

### Requirement 3: Snapshot Capture

**User Story:** As a developer, I want to see the current chat state on my phone.

#### Acceptance Criteria

1. THE server SHALL capture HTML snapshots of the chat interface via CDP
2. THE server SHALL capture CSS styles on initial connection (once, since it's large)
3. THE server SHALL poll for HTML changes every 3 seconds
4. THE server SHALL only broadcast updates when content actually changes (hash comparison)

### Requirement 4: Real-Time Updates

**User Story:** As a developer, I want my phone to update automatically when the chat changes.

#### Acceptance Criteria

1. THE server SHALL use WebSocket to push snapshot updates to connected clients
2. WHEN a client connects, THE server SHALL send the current cascade list
3. WHEN a snapshot changes, THE server SHALL broadcast the update to all clients

### Requirement 5: Message Sending

**User Story:** As a developer, I want to send messages to Kiro from my phone.

#### Acceptance Criteria

1. THE Mobile_Client SHALL provide a text input and send button
2. WHEN a message is sent, THE server SHALL inject it into the chat via CDP
3. THE server SHALL find the contenteditable or textarea input element
4. THE server SHALL trigger the send button or Enter key after injection

### Requirement 6: Mobile UI

**User Story:** As a developer, I want a simple mobile-friendly interface.

#### Acceptance Criteria

1. THE Mobile_Client SHALL display the captured chat HTML with original CSS
2. THE Mobile_Client SHALL auto-scroll when new content appears
3. THE Mobile_Client SHALL show connection status
4. THE Mobile_Client SHALL work on mobile browsers over LAN

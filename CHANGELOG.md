# Changelog

All notable changes to this project will be documented in this file.

## v1.0.15 (2026-01-25)
- ci: allow manual trigger for auto-release workflow


## 2026-01-25

- chore: bump version to 1.0.15 [skip ci]
- fix: Improve file handling and editor snapshot capture
- Enhance file path cleaning in openFileInEditor() to handle quotes, markdown headers, and list markers
- Improve editor info banner styling with gradient background and warning icon
- Add file completion indicator showing "✓ Complete file" when full file is displayed
- Enhance line number display with better formatting and line count information
- Add error logging for failed file read operations
- Improve code comments and formatting for better maintainability

## 2026-01-24

- docs: Add Linux firewall troubleshooting guide and improve server output
- Add comprehensive Linux firewall troubleshooting section to README with UFW and iptables examples
- Improve server startup output formatting with consistent separator line length
- chore(server): Remove version tag and clean up formatting
- chore: add version tag to server.js
- chore: Remove unused import in click service

## 2026-01-23

- ci(release): Improve commit message handling in changelog generation
- fix(ui): Fix send button not clickable on mobile interface
- fix(ui): Remove placeholder text overlap in chat input
- fix(ui): Hide model descriptions in dropdown menu for cleaner UI
- feat(ui): Add support for ProseMirror/TipTap editor (in addition to Lexical)
- fix(server): Remove placeholder elements from captured HTML snapshots
- fix(client): Detect send button by data-variant="submit" attribute
- fix(client): Support codicon icon fonts (not just SVG icons)
- docs: Remove terminal panel references and add MIT license
- Simplify product description to focus on chat, files, and editor panels
- Add MIT License file for project
- Initial release
- Mobile web interface for monitoring Kiro IDE agent sessions
- Real-time chat, files, and editor panels
- WebSocket-based live updates
- Auto-discovery of Kiro instances on ports 9000-9003

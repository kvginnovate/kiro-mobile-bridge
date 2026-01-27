# Product Overview

## Product Purpose
Kiro Mobile Bridge is a mobile web interface that lets developers monitor and interact with Kiro IDE agent sessions from their phone over LAN. It captures real-time snapshots of the chat interface, file explorer, and editor via Chrome DevTools Protocol (CDP), enabling remote monitoring and control without being at your desk.

## Target Users
- **Developers using Kiro IDE** who want to monitor long-running agent tasks from their phone
- **Remote workers** who need to check on AI coding sessions while away from their computer
- **Power users** who want multi-device access to their development environment

## Key Features

### Core Panels
- 📱 **Mobile-optimized UI** - Tab navigation, touch targets (44px min), viewport handling
- 💬 **Chat Panel** - Full chat history with real-time updates, message sending
- 📝 **Code Panel** - File explorer + editor with syntax highlighting and search
- 📋 **Tasks Panel** - Kiro spec task files with completion tracking

### Real-Time Capabilities
- 🔄 **Adaptive polling** - 200ms when active → 800ms when idle (saves resources)
- 📡 **WebSocket updates** - Instant push notifications on content changes
- 🔍 **Auto-discovery** - Scans ports 9000-9003, 9222, 9229 for Kiro instances
- ⚡ **Hash-based sync** - Only updates when content actually changes

### Interactive Features
- 🖱️ **Click-through support** - Tabs, buttons, toggles, model selectors, dialogs
- 📂 **File navigation** - Click file links in chat to open in editor
- 🔎 **Editor search** - Find text with match highlighting and navigation
- 📁 **File tree browser** - Hierarchical workspace navigation

### Advanced Capabilities
- 🎨 **Preserves Kiro styling** - Original CSS captured and applied
- 🔧 **Multi-editor support** - ProseMirror, Lexical, textarea injection
- 🎯 **React fiber detection** - Finds actual click handlers in React components
- 🔒 **Security utilities** - Path traversal prevention, XSS protection, input sanitization

## Business Objectives
- Enable seamless mobile monitoring of AI-assisted development sessions
- Reduce context-switching by allowing developers to stay informed on the go
- Provide a lightweight, zero-config solution for LAN-based remote access

## User Journey
1. Start Kiro IDE with CDP enabled (`--remote-debugging-port=9000`)
2. Run the bridge server (`npm start`)
3. Open the network URL on phone (same WiFi network)
4. Monitor chat, files, and editor in real-time
5. Send messages to Kiro agent directly from phone

## Success Criteria
- Reliable real-time synchronization between Kiro IDE and mobile client
- Sub-second latency for snapshot updates (achieved: 200ms active polling)
- Intuitive mobile UI that works across different phone sizes
- Zero configuration required beyond starting the server

## Feature Completeness

### ✅ Fully Implemented
| Feature | Status | Notes |
|---------|--------|-------|
| Chat monitoring | ✅ Complete | Real-time with adaptive polling |
| Message sending | ✅ Complete | Multi-editor support (ProseMirror, Lexical, textarea) |
| File explorer | ✅ Complete | Hierarchical tree with folder expansion |
| File reading | ✅ Complete | Full file content via filesystem API |
| Editor viewing | ✅ Complete | Syntax highlighting + search |
| Tasks panel | ✅ Complete | Spec task files with completion tracking |
| Click interactions | ✅ Complete | Tabs, buttons, toggles, dialogs, model selectors |
| Auto-discovery | ✅ Complete | Ports 9000-9003, 9222, 9229 |
| Cross-platform | ✅ Complete | Windows, macOS, Linux network detection |
| Security | ✅ Complete | Path traversal, XSS, input sanitization |
| Zero-config access | ✅ By Design | No auth required - optimized for trusted LAN environments |

### Architecture Quality
- **Modular design**: 6 service modules + utilities
- **Error handling**: Graceful degradation, isolated errors per cascade
- **Performance**: Adaptive polling, hash-based change detection
- **Maintainability**: Clear separation of concerns, JSDoc comments

### Intentional Design Decisions
- **No authentication**: Zero-config access is a feature, not a limitation. Adding auth would introduce friction (passwords, tokens, sessions) that contradicts the "just works" philosophy for personal/office use.
- **Trusted network only**: Same security model as localhost dev servers (webpack, Vite, etc.). Clear documentation over false security from optional auth.
- **No HTTPS**: LAN traffic doesn't need encryption. Self-signed certs cause browser warnings; CA certs require domains. Plain HTTP is pragmatic for local tools.

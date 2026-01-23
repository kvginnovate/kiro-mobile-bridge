# Product Overview

## Product Purpose
Kiro Mobile Bridge is a mobile web interface that lets developers monitor and interact with Kiro IDE agent sessions from their phone over LAN. It captures real-time snapshots of the chat interface, file explorer, and editor via Chrome DevTools Protocol (CDP), enabling remote monitoring and control without being at your desk.

## Target Users
- **Developers using Kiro IDE** who want to monitor long-running agent tasks from their phone
- **Remote workers** who need to check on AI coding sessions while away from their computer
- **Power users** who want multi-device access to their development environment

## Key Features
- 📱 Mobile-optimized web interface with tab navigation
- 💬 Chat Panel - View and send messages to Kiro's agent
- 📁 Files Panel - Browse file explorer and Kiro panels (specs, hooks, steering)
- 📝 Editor Panel - View currently open file with syntax highlighting
- 🔄 Real-time updates via WebSocket
- 🔍 Auto-discovers Kiro instances on ports 9000-9003
- 🎨 Preserves original Kiro styling

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
- Sub-second latency for snapshot updates
- Intuitive mobile UI that works across different phone sizes
- Zero configuration required beyond starting the server

# Kiro Mobile Bridge

A mobile web interface for monitoring Kiro IDE agent sessions from your phone over LAN. Captures snapshots of the chat interface, file explorer, and editor via Chrome DevTools Protocol (CDP) and lets you interact remotely.

## Features

- 📱 Mobile-optimized web interface with tab navigation
- 💬 **Chat Panel** - View and send messages to Kiro's agent
- 📝 **Editor Panel** - Browse file explorer and open file 
- 🔄 Real-time updates via WebSocket

## Prerequisites

- **Node.js** 18+ (uses ES modules)
- **Kiro IDE** 

## Quick Start

### 1. Enable CDP in Kiro

Start Kiro with the remote debugging port enabled:
Option 1: **Run Kiro with debugging port:**
```bash
# Windows (from default install location)
"%LOCALAPPDATA%\Programs\Kiro\Kiro.exe" --remote-debugging-port=9000

# macOS
/Applications/Kiro.app/Contents/MacOS/Kiro --remote-debugging-port=9000

# Linux (installed)
/opt/Kiro/kiro --remote-debugging-port=9000
```

Option 2: **Finding Kiro's location:**

```bash
where kiro # Windows (CMD)
which kiro # macOS/Linux
```

Then use the path in your command:

```bash
# Example
"C:\Users\YourName\AppData\Local\Programs\Kiro\Kiro.exe" --remote-debugging-port=9000
```

### 2. Run with npx (Recommended)

No installation needed! Just run:

```bash
npx kiro-mobile-bridge
```

### Alternative: Clone and Run

```bash
git clone 
cd kiro-mobile-bridge
npm install
npm start
```

You'll see output like:

```
🌉 Kiro Mobile Bridge
─────────────────────
Local:   http://localhost:3000
Network: http://192.168.1.100:3000

Open the Network URL on your phone to monitor Kiro.
```

### 3. Open on Your Phone

1. Make sure your phone is on the **same WiFi network** as your computer
2. Open the **Network URL** (e.g., `http://192.168.1.100:3000`) in your phone's browser
3. The interface will automatically connect and show your Kiro chat


## How It Works

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

1. **Discovery**: Server scans ports 9000-9003 for Kiro instances (adaptive: 10s → 30s when stable)
2. **Connection**: Connects to Kiro via CDP WebSocket
3. **Snapshots**: Captures chat HTML with adaptive polling (1s active → 3s idle), broadcasts changes
4. **Messages**: Injects text into Kiro's chat input via CDP

## Troubleshooting

### "No sessions available"

- Make sure Kiro is running with `--remote-debugging-port=9000`
- Check that Kiro has a chat/agent session open
- Wait a few seconds for discovery 

### Can't connect from phone

- Ensure phone and computer are on the **same network**
- Check your firewall allows connections on port 3000
- Try the IP address shown in the server output (not `localhost`)

## Security Notes

⚠️ **This is designed for local network use only:**

- No authentication
- No HTTPS
- Exposes Kiro's chat interface to anyone on your network

Only run this on trusted networks.

## License

MIT

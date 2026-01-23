# Kiro Mobile Bridge

A mobile web interface for monitoring Kiro IDE agent sessions from your phone over LAN. Captures snapshots of the chat interface, terminal, file explorer, and editor via Chrome DevTools Protocol (CDP) and lets you interact remotely.

## Features

- 📱 Mobile-optimized web interface with tab navigation
- 💬 **Chat Panel** - View and send messages to Kiro's agent
- 🖥️ **Terminal Panel** - View terminal output in real-time
- 📁 **Files Panel** - Browse file explorer and Kiro panels (specs, hooks, steering)
- 📝 **Editor Panel** - View currently open file with syntax highlighting
- 🔄 Real-time updates via WebSocket
- 🔍 Auto-discovers Kiro instances on ports 9000-9003
- 🎨 Preserves original Kiro styling

## Prerequisites

- **Node.js** 18+ (uses ES modules)
- **Kiro IDE** with Chrome DevTools Protocol enabled

## Quick Start

### 1. Enable CDP in Kiro

Start Kiro with the remote debugging port enabled:

```bash
# Windows (from default install location)
"%LOCALAPPDATA%\Programs\Kiro\Kiro.exe" --remote-debugging-port=9000

# macOS
/Applications/Kiro.app/Contents/MacOS/Kiro --remote-debugging-port=9000

# Linux (AppImage)
~/Applications/Kiro.AppImage --remote-debugging-port=9000

# Linux (installed)
/opt/Kiro/kiro --remote-debugging-port=9000
```

**Finding Kiro's location:**

```bash
# Windows (CMD)
where kiro

# Windows (PowerShell)
Get-Command kiro | Select-Object Source

# macOS/Linux
which kiro
```

Then use the path in your command:

```bash
# Example: If 'where kiro' returns C:\Users\YourName\AppData\Local\Programs\Kiro\Kiro.exe
"C:\Users\YourName\AppData\Local\Programs\Kiro\Kiro.exe" --remote-debugging-port=9000
```

| OS | Default Location |
|----|------------------|
| Windows | `%LOCALAPPDATA%\Programs\Kiro\Kiro.exe` |
| macOS | `/Applications/Kiro.app/Contents/MacOS/Kiro` |
| Linux (AppImage) | `~/Applications/Kiro.AppImage` or where you downloaded it |
| Linux (deb/rpm) | `/opt/Kiro/kiro` or `/usr/bin/kiro` |


### 2. Run with npx (Recommended)

No installation needed! Just run:

```bash
npx kiro-mobile-bridge
```

Or with a custom port:

```bash
PORT=8080 npx kiro-mobile-bridge
```

### Alternative: Install Globally

```bash
npm install -g kiro-mobile-bridge
kiro-mobile-bridge
```

### Alternative: Clone and Run

```bash
git clone <repo-url>
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

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server port |

Example:
```bash
PORT=8080 npx kiro-mobile-bridge
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cascades` | List active chat sessions |
| `GET` | `/snapshot/:id` | Get chat HTML snapshot for a cascade |
| `GET` | `/snapshot` | Get snapshot of first cascade |
| `GET` | `/terminal/:id` | Get terminal output snapshot |
| `GET` | `/sidebar/:id` | Get sidebar/file explorer snapshot |
| `GET` | `/editor/:id` | Get editor content snapshot |
| `GET` | `/styles/:id` | Get CSS for a cascade |
| `POST` | `/send/:id` | Send message to a cascade |
| `POST` | `/click/:id` | Click an element in Kiro UI |

### WebSocket Messages

The server pushes updates via WebSocket:

```javascript
// Cascade list update
{ type: 'cascade_list', cascades: [{ id, title, window, active }] }

// Snapshot changed (panel: 'chat' | 'terminal' | 'sidebar' | 'editor')
{ type: 'snapshot_update', cascadeId: string, panel: string }
```

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

1. **Discovery**: Server scans ports 9000-9003 every 10 seconds for Kiro instances
2. **Connection**: Connects to Kiro via CDP WebSocket
3. **Snapshots**: Captures chat HTML every 3 seconds, broadcasts changes
4. **Messages**: Injects text into Kiro's chat input via CDP

## Troubleshooting

### "No sessions available"

- Make sure Kiro is running with `--remote-debugging-port=9000`
- Check that Kiro has a chat/agent session open
- Wait a few seconds for discovery (runs every 10s)

### Can't connect from phone

- Ensure phone and computer are on the **same network**
- Check your firewall allows connections on port 3000
- Try the IP address shown in the server output (not `localhost`)

### Finding your local IP

The server displays your local IP on startup. You can also find it:

```bash
# Windows
ipconfig

# macOS
ifconfig | grep "inet "

# Linux
ip addr show | grep "inet "
```

### Message not sending

- The chat input must be visible in Kiro
- Try clicking in the chat input in Kiro first
- Check the server console for error messages

## Security Notes

⚠️ **This is designed for local network use only:**

- No authentication
- No HTTPS
- Exposes Kiro's chat interface to anyone on your network

Only run this on trusted networks.

## License

MIT

# Kiro Mobile Bridge

A lightweight mobile interface that lets you monitor and control Kiro IDE agent sessions from your phone over LAN, with a live preview of chat, tasks, and code via Chrome DevTools Protocol.

<img width="1829" height="1065" alt="Untitled design (4)" src="https://github.com/user-attachments/assets/d548c43b-4501-4d66-aed7-ad021a44f9cb" />


## Features

- 📱 Mobile-optimized web interface with tab navigation
- 🔑 **OTP Authentication** - 6-digit access code generated on server startup
- 💬 **Chat** - View and send messages to Kiro's agent
- 📝 **Code** - Browse file explorer and view files with syntax highlighting
- 📋 **Tasks** - View and navigate Kiro spec task files
- 🔄 Real-time updates via WebSocket with adaptive polling

## Prerequisites

- **Node.js** 18+ (uses ES modules)
- **Kiro IDE** 

## Quick Start

### 1. Open your target project on Kiro and then close Kiro.
The bridge needs an workspace session to detect and connect to.

### 2. Start Kiro from the terminal to enable CDP

Open Kiro with the remote debugging port enabled:

**Run Kiro with debugging port on CMD/Terminal:**
```bash
kiro --remote-debugging-port=9000
```

### 3. Run with npx (Recommended)

Start Server

```bash
npx kiro-mobile-bridge
```

#### Alternative: Clone and Run

```bash
git clone 
cd kiro-mobile-bridge
npm install
npm start
```

You'll see output like:

```
Kiro Mobile Bridge
─────────────────────
Local:   http://localhost:3000
Network: http://192.168.16.106:3000

🔑 Access Code: 847291

Enter this code on your device to connect.
```

### 4. Open on Your Phone

1. Make sure your phone is on the **same WiFi network** as your computer
2. Open the **Network URL** (e.g., `http://192.168.1.100:3000`) in your phone's browser
3. Enter the **6-digit access code** shown in the terminal
4. The interface will connect and show your Kiro session
5. Use the tabs to switch between Chat, Code, and Tasks panels

> **Note:** The access code is single-use — only one device can authenticate per server session. Restart the server to generate a new code.

#### Disable Authentication

For trusted environments where you want the original no-auth experience:

```bash
npx kiro-mobile-bridge --no-auth
```


#### How It Works

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

1. **Discovery**: Server scans ports 9000-9003, 9222, 9229 for Kiro instances (adaptive: 10s → 30s when stable)
2. **Connection**: Connects to Kiro via CDP WebSocket
3. **Snapshots**: Captures chat, editor, and tasks with adaptive polling (1s active → 3s idle)
4. **Messages**: Injects text into Kiro's chat input via CDP

## Troubleshooting

#### "No sessions available"

- Make sure Kiro is running with `--remote-debugging-port=9000`
- Check that Kiro has a chat/agent session open
- Wait a few seconds for discovery 

#### Can't connect from phone

- Ensure phone and computer are on the **same network**
- Check your firewall allows connections on port 3000
- Try the IP address shown in the server output (not `localhost`)

#### Windows: Works on your computer but not on mobile, even on same WiFi.

**Root Cause:** Node.js firewall rule only allows **Public** networks by default. If your network is set to **Private**, mobile devices can't connect.

**Quick Fix - Option 1: Change Network to Public (Easiest)**
1. Open **Settings** → **Network & Internet**
2. Click your connection (WiFi or Ethernet)
3. Under "Network profile type", select **Public network (Recommended)**
4. Try accessing from mobile again

**Quick Fix - Option 2: Update Firewall Rule (Better for home networks)**

Run this command **as Administrator** (Win + X → Terminal Admin):
```cmd
netsh advfirewall firewall set rule name="Node.js JavaScript Runtime" new profile=private,public
```

#### Linux: Firewall blocking connections

If you're on Linux and can't connect from your phone, your firewall may be blocking port 3000. Allow it with:

```bash
# UFW (Ubuntu, Arch, etc.)
sudo ufw allow 3000/tcp

# Or with iptables directly
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

## Security Notes

#### OTP Authentication
- A **6-digit access code** is generated on each server startup and displayed in the terminal
- The code is **single-use** — once a device authenticates, the code is consumed and all other devices are immediately locked out
- New devices opening the login page during lockout or after the code is consumed will see a locked UI immediately
- Sessions use **HttpOnly cookies** — tokens are not exposed to client-side JavaScript
- Use `--no-auth` to disable authentication for fully trusted environments

## License

MIT

/**
 * Network utilities for cross-platform local IP detection
 * 
 * Supports: Windows, macOS, Linux
 * 
 * Node.js os.networkInterfaces() family property:
 * - Node < 18.0.0: returns string ('IPv4' or 'IPv6')
 * - Node 18.0.0 - 18.3.x: returns number (4 or 6)
 * - Node >= 18.4.0: returns string ('IPv4' or 'IPv6')
 */
import { networkInterfaces } from 'os';

/**
 * Check if interface is IPv4
 * Handles both string ('IPv4') and number (4) family values
 * for compatibility across Node.js versions
 * @param {object} iface - Network interface object
 * @returns {boolean}
 */
function isIPv4(iface) {
  return iface.family === 'IPv4' || iface.family === 4;
}

/**
 * Check if interface name is a virtual/container interface to skip
 * @param {string} name - Interface name
 * @returns {boolean}
 */
function isVirtualInterface(name) {
  const lowerName = name.toLowerCase();
  const virtualPatterns = [
    'vethernet',    // Windows WSL/Hyper-V
    'docker',       // Docker
    'vmware',       // VMware
    'virtualbox',   // VirtualBox
    'vbox',         // VirtualBox alternate
    'virbr',        // Linux libvirt bridge
    'br-',          // Docker bridge
    'veth',         // Virtual ethernet
    'tailscale',    // Tailscale VPN
    'tun',          // VPN tunnel
    'tap',          // VPN tap
    'utun',         // macOS VPN
    'awdl',         // Apple Wireless Direct Link
    'llw',          // Apple Low Latency WLAN
    'bridge',       // Bridge interfaces
    'ham',          // Hamachi VPN
    'zt',           // ZeroTier
  ];
  
  return virtualPatterns.some(pattern => lowerName.includes(pattern));
}

/**
 * Get local IP address for LAN access
 * Returns the first non-internal IPv4 address found, prioritizing
 * physical network interfaces over virtual ones.
 * 
 * Platform-specific interface names:
 * - Windows: 'Ethernet', 'Wi-Fi', 'Ethernet 2', 'Local Area Connection'
 * - macOS: 'en0' (Wi-Fi), 'en1' (Ethernet), 'en2', etc.
 * - Linux: 'eth0', 'enp0s3', 'ens33', 'wlan0', 'wlp2s0'
 * 
 * @returns {string} - Local IP or 'localhost' if no suitable interface found
 */
export function getLocalIP() {
  const interfaces = networkInterfaces();
  
  // Priority 1: Common physical interface names across platforms
  // Order matters - check most common first
  const priorityInterfaces = [
    // Windows
    'Ethernet', 'Wi-Fi', 'Ethernet 2', 'Local Area Connection',
    // macOS
    'en0', 'en1', 'en2', 'en3', 'en4', 'en5',
    // Linux (traditional)
    'eth0', 'eth1', 'wlan0', 'wlan1',
    // Linux (systemd predictable names)
    'enp0s3', 'enp0s25', 'enp0s31f6', 'ens33', 'ens160', 'ens192',
    'wlp2s0', 'wlp3s0', 'wlp0s20f3',
  ];
  
  // First pass: try priority interfaces
  for (const name of priorityInterfaces) {
    const ifaces = interfaces[name];
    if (ifaces) {
      for (const iface of ifaces) {
        if (isIPv4(iface) && !iface.internal) {
          return iface.address;
        }
      }
    }
  }
  
  // Second pass: any non-virtual interface
  for (const name of Object.keys(interfaces)) {
    if (isVirtualInterface(name)) continue;
    
    for (const iface of interfaces[name]) {
      if (isIPv4(iface) && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  // Last resort: any non-internal IPv4 (including virtual)
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (isIPv4(iface) && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return 'localhost';
}

/**
 * Get all available local IP addresses
 * Useful for debugging or when user needs to choose interface
 * 
 * @returns {Array<{name: string, address: string}>} - Array of interface names and addresses
 */
export function getAllLocalIPs() {
  const interfaces = networkInterfaces();
  const results = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (isIPv4(iface) && !iface.internal) {
        results.push({ name, address: iface.address });
      }
    }
  }
  
  return results;
}

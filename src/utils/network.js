/**
 * Network utilities
 */
import { networkInterfaces } from 'os';

/**
 * Check if interface is IPv4
 * Handles both string ('IPv4') and number (4) family values
 * @param {object} iface - Network interface object
 * @returns {boolean}
 */
function isIPv4(iface) {
  return iface.family === 'IPv4' || iface.family === 4;
}

/**
 * Get local IP address for LAN access
 * Returns the first non-internal IPv4 address found.
 * 
 * NOTE: On systems with multiple network interfaces, this returns the first one found.
 * For more control, consider using environment variables or configuration.
 * 
 * @returns {string} - Local IP or 'localhost' if no suitable interface found
 */
export function getLocalIP() {
  const interfaces = networkInterfaces();
  
  // Prioritize common interface names (Linux, macOS, Windows)
  const priorityInterfaces = ['Ethernet', 'Wi-Fi', 'eth0', 'en0', 'wlan0'];
  
  // First, try priority interfaces
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
  
  // Fallback: return first non-internal IPv4 (skip virtual/WSL interfaces)
  for (const name of Object.keys(interfaces)) {
    // Skip virtual interfaces (WSL, Docker, VPN, etc.)
    if (name.toLowerCase().includes('vethernet') || 
        name.toLowerCase().includes('docker') ||
        name.toLowerCase().includes('vmware') ||
        name.toLowerCase().includes('virtualbox')) {
      continue;
    }
    for (const iface of interfaces[name]) {
      if (isIPv4(iface) && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  // Last resort: any non-internal IPv4
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

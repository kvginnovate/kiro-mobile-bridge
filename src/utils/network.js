/**
 * Network utilities
 */
import { networkInterfaces } from 'os';

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
  
  // Prioritize common interface names
  const priorityInterfaces = ['eth0', 'en0', 'wlan0', 'Wi-Fi', 'Ethernet'];
  
  // First, try priority interfaces
  for (const name of priorityInterfaces) {
    const ifaces = interfaces[name];
    if (ifaces) {
      for (const iface of ifaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  }
  
  // Fallback: return first non-internal IPv4
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
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
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push({ name, address: iface.address });
      }
    }
  }
  
  return results;
}

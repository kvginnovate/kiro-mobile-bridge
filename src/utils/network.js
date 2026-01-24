/**
 * Network utilities
 */
import { networkInterfaces } from 'os';

/**
 * Get local IP address for LAN access
 * @returns {string} - Local IP or 'localhost'
 */
export function getLocalIP() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

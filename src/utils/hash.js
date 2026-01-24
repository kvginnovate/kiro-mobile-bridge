/**
 * Hash utilities for content change detection
 */
import crypto from 'crypto';

/**
 * Generate a unique ID from a string (e.g., WebSocket URL)
 * @param {string} input - String to hash
 * @returns {string} - 8-character hash ID
 */
export function generateId(input) {
  return crypto.createHash('md5').update(input).digest('hex').substring(0, 8);
}

/**
 * Compute MD5 hash for change detection
 * @param {string} content - Content to hash
 * @returns {string} - Full MD5 hash
 */
export function computeHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

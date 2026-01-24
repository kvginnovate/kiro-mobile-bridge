/**
 * Hash utilities for content change detection
 * 
 * NOTE: MD5 is used here for change detection only, NOT for security purposes.
 * MD5 is fast and sufficient for detecting content changes in snapshots.
 * Do NOT use these functions for password hashing, authentication, or any security-sensitive operations.
 */
import crypto from 'crypto';

/**
 * Generate a unique ID from a string (e.g., WebSocket URL)
 * Used for cascade identification, not security
 * @param {string} input - String to hash
 * @returns {string} - 8-character hash ID
 */
export function generateId(input) {
  if (typeof input !== 'string' || !input) {
    return crypto.randomBytes(4).toString('hex');
  }
  return crypto.createHash('md5').update(input).digest('hex').substring(0, 8);
}

/**
 * Compute MD5 hash for change detection
 * Used to detect content changes in snapshots, not for security
 * @param {string} content - Content to hash
 * @returns {string} - Full MD5 hash
 */
export function computeHash(content) {
  if (typeof content !== 'string') {
    return '';
  }
  return crypto.createHash('md5').update(content).digest('hex');
}

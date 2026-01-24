/**
 * Chrome DevTools Protocol (CDP) connection service
 */
import http from 'http';
import { WebSocket } from 'ws';

/**
 * Fetch JSON from a CDP endpoint
 * @param {number} port - The port to fetch from
 * @param {string} path - The path to fetch (default: /json/list)
 * @returns {Promise<any>} - Parsed JSON response
 */
export function fetchCDPTargets(port, path = '/json/list') {
  return new Promise((resolve, reject) => {
    const url = `http://127.0.0.1:${port}${path}`;
    
    const req = http.get(url, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    });
    
    req.on('error', (err) => reject(new Error(`Failed to fetch ${url}: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Create a CDP connection to a target
 * @param {string} wsUrl - WebSocket debugger URL
 * @returns {Promise<CDPConnection>} - CDP connection object
 */
export function connectToCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const pendingCalls = new Map();
    const contexts = [];
    let rootContextId = null;
    let isConnected = false;
    
    ws.on('message', (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        
        if (msg.method === 'Runtime.executionContextCreated') {
          const ctx = msg.params.context;
          contexts.push(ctx);
          if (rootContextId === null || ctx.auxData?.isDefault) {
            rootContextId = ctx.id;
          }
        }
        
        if (msg.method === 'Runtime.executionContextDestroyed') {
          const ctxId = msg.params.executionContextId;
          const idx = contexts.findIndex(c => c.id === ctxId);
          if (idx !== -1) contexts.splice(idx, 1);
          if (rootContextId === ctxId) {
            rootContextId = contexts.length > 0 ? contexts[0].id : null;
          }
        }
        
        if (msg.method === 'Runtime.executionContextsCleared') {
          contexts.length = 0;
          rootContextId = null;
        }
        
        if (msg.id !== undefined && pendingCalls.has(msg.id)) {
          const { resolve: res, reject: rej } = pendingCalls.get(msg.id);
          pendingCalls.delete(msg.id);
          if (msg.error) {
            rej(new Error(`CDP Error: ${msg.error.message} (code: ${msg.error.code})`));
          } else {
            res(msg.result);
          }
        }
      } catch (e) {
        console.error('[CDP] Failed to parse message:', e.message);
      }
    });
    
    ws.on('open', async () => {
      isConnected = true;
      console.log(`[CDP] Connected to ${wsUrl}`);
      
      const cdp = {
        ws,
        contexts,
        get rootContextId() { return rootContextId; },
        
        call(method, params = {}) {
          return new Promise((res, rej) => {
            if (!isConnected) {
              rej(new Error('CDP connection is closed'));
              return;
            }
            
            const id = idCounter++;
            pendingCalls.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id, method, params }));
            
            setTimeout(() => {
              if (pendingCalls.has(id)) {
                pendingCalls.delete(id);
                rej(new Error(`CDP call timeout: ${method}`));
              }
            }, 10000);
          });
        },
        
        close() {
          isConnected = false;
          for (const [, { reject }] of pendingCalls) {
            reject(new Error('CDP connection closed'));
          }
          pendingCalls.clear();
          ws.terminate();
        }
      };
      
      try {
        await cdp.call('Runtime.enable', {});
        await new Promise(r => setTimeout(r, 300));
        console.log(`[CDP] Runtime enabled, found ${contexts.length} context(s)`);
        resolve(cdp);
      } catch (err) {
        cdp.close();
        reject(err);
      }
    });
    
    ws.on('error', (err) => {
      console.error(`[CDP] WebSocket error: ${err.message}`);
      isConnected = false;
      reject(err);
    });
    
    ws.on('close', () => {
      console.log('[CDP] Connection closed');
      isConnected = false;
      for (const [, { reject }] of pendingCalls) {
        reject(new Error('CDP connection closed'));
      }
      pendingCalls.clear();
    });
  });
}

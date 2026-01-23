/**
 * Kiro Mobile Bridge Server
 * 
 * A simple mobile web interface for monitoring Kiro IDE agent sessions from your phone over LAN.
 * Captures snapshots of the chat interface via CDP and lets you send messages remotely.
 */

import express from 'express';
import { createServer } from 'http';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { networkInterfaces } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const CDP_PORTS = [9000, 9001, 9002, 9003, 9222, 9229];

// State management
const cascades = new Map(); // cascadeId -> { id, cdp, metadata, snapshot, css, snapshotHash, terminal, sidebar, editor }
const mainWindowCDP = { connection: null, id: null }; // Separate CDP connection for main VS Code window

// =============================================================================
// CDP Connection Helpers (Task 2)
// =============================================================================

/**
 * Fetch JSON from a CDP endpoint
 * @param {number} port - The port to fetch from
 * @param {string} path - The path to fetch (default: /json/list)
 * @returns {Promise<any>} - Parsed JSON response
 */
function fetchCDPTargets(port, path = '/json/list') {
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
    
    req.on('error', (err) => {
      reject(new Error(`Failed to fetch ${url}: ${err.message}`));
    });
    
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
 * 
 * @typedef {Object} CDPConnection
 * @property {WebSocket} ws - The WebSocket connection
 * @property {function(string, object): Promise<any>} call - Send CDP command
 * @property {Array<{id: number, name: string, origin: string}>} contexts - Runtime execution contexts
 * @property {number|null} rootContextId - Main context ID for evaluation
 * @property {function(): void} close - Close the connection
 */
function connectToCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const pendingCalls = new Map(); // id -> { resolve, reject }
    const contexts = [];
    let rootContextId = null;
    let isConnected = false;
    
    // Handle incoming messages
    ws.on('message', (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        
        // Handle CDP events
        if (msg.method === 'Runtime.executionContextCreated') {
          const ctx = msg.params.context;
          contexts.push(ctx);
          
          // Track the main/root context (usually the first one or one with specific origin)
          // The root context typically has origin matching the page or is the first created
          if (rootContextId === null || ctx.auxData?.isDefault) {
            rootContextId = ctx.id;
          }
          
          console.log(`[CDP] Context created: id=${ctx.id}, name="${ctx.name}", origin="${ctx.origin}"`);
        }
        
        if (msg.method === 'Runtime.executionContextDestroyed') {
          const ctxId = msg.params.executionContextId;
          const idx = contexts.findIndex(c => c.id === ctxId);
          if (idx !== -1) {
            contexts.splice(idx, 1);
            console.log(`[CDP] Context destroyed: id=${ctxId}`);
          }
          if (rootContextId === ctxId) {
            rootContextId = contexts.length > 0 ? contexts[0].id : null;
          }
        }
        
        if (msg.method === 'Runtime.executionContextsCleared') {
          contexts.length = 0;
          rootContextId = null;
          console.log('[CDP] All contexts cleared');
        }
        
        // Handle responses to our calls
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
      
      // Create the CDP connection object
      const cdp = {
        ws,
        contexts,
        get rootContextId() { return rootContextId; },
        
        /**
         * Send a CDP command and wait for response
         * @param {string} method - CDP method name
         * @param {object} params - Method parameters
         * @returns {Promise<any>} - CDP response result
         */
        call(method, params = {}) {
          return new Promise((res, rej) => {
            if (!isConnected) {
              rej(new Error('CDP connection is closed'));
              return;
            }
            
            const id = idCounter++;
            pendingCalls.set(id, { resolve: res, reject: rej });
            
            const message = JSON.stringify({ id, method, params });
            ws.send(message);
            
            // Timeout for calls (10 seconds)
            setTimeout(() => {
              if (pendingCalls.has(id)) {
                pendingCalls.delete(id);
                rej(new Error(`CDP call timeout: ${method}`));
              }
            }, 10000);
          });
        },
        
        /**
         * Close the CDP connection
         */
        close() {
          isConnected = false;
          // Reject all pending calls
          for (const [id, { reject }] of pendingCalls) {
            reject(new Error('CDP connection closed'));
          }
          pendingCalls.clear();
          ws.terminate();
        }
      };
      
      try {
        // Enable Runtime to receive execution context events
        await cdp.call('Runtime.enable', {});
        
        // Wait a bit for contexts to be discovered
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
      // Reject all pending calls
      for (const [id, { reject }] of pendingCalls) {
        reject(new Error('CDP connection closed'));
      }
      pendingCalls.clear();
    });
  });
}

/**
 * Generate a unique ID for a cascade based on WebSocket URL
 * @param {string} wsUrl - WebSocket debugger URL
 * @returns {string} - Hash ID
 */
function generateCascadeId(wsUrl) {
  return crypto.createHash('md5').update(wsUrl).digest('hex').substring(0, 8);
}

// =============================================================================
// Snapshot Capture (Task 4)
// =============================================================================

/**
 * Compute a simple hash of content for change detection
 * @param {string} content - Content to hash
 * @returns {string} - Hash string
 */
function computeHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Extract chat metadata (title, active state) from the page via CDP
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<{chatTitle: string, isActive: boolean}>}
 */
async function captureMetadata(cdp) {
  if (!cdp.rootContextId) {
    return { chatTitle: '', isActive: false };
  }
  
  const script = `
    (function() {
      // Try to find chat title from various possible elements
      let chatTitle = '';
      let isActive = false;
      
      // Look for chat title in common locations
      // Kiro might have title in header, tab, or specific element
      const titleSelectors = [
        '.chat-title',
        '.conversation-title',
        '[data-testid="chat-title"]',
        '.chat-header h1',
        '.chat-header h2',
        '.chat-header .title'
      ];
      
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent) {
          chatTitle = el.textContent.trim();
          break;
        }
      }
      
      // Check if chat is active (has recent activity or is focused)
      // Look for typing indicators, loading states, or recent messages
      const activeIndicators = [
        '.typing-indicator',
        '.loading-indicator',
        '[data-loading="true"]',
        '.chat-loading'
      ];
      
      for (const selector of activeIndicators) {
        if (document.querySelector(selector)) {
          isActive = true;
          break;
        }
      }
      
      // Also check if document is focused
      isActive = isActive || document.hasFocus();
      
      return { chatTitle, isActive };
    })()
  `;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    
    if (result.result && result.result.value) {
      return result.result.value;
    }
  } catch (err) {
    console.error('[Snapshot] Failed to capture metadata:', err.message);
  }
  
  return { chatTitle: '', isActive: false };
}

/**
 * Capture CSS styles from the page (run once per connection)
 * Gathers all stylesheets and CSS variables, returns CSS string
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<string>} - Combined CSS string
 */
async function captureCSS(cdp) {
  if (!cdp.rootContextId) {
    return '';
  }
  
  const script = `
    (function() {
      let css = '';
      
      // VS Code webviews use nested iframes - look for #active-frame
      let targetDoc = document;
      const activeFrame = document.getElementById('active-frame');
      if (activeFrame && activeFrame.contentDocument) {
        targetDoc = activeFrame.contentDocument;
      }
      
      // First, capture all CSS custom properties (variables) from :root/html/body
      // These are needed because VS Code styles use var(--vscode-*) extensively
      const rootEl = targetDoc.documentElement;
      const bodyEl = targetDoc.body;
      const rootStyles = window.getComputedStyle(rootEl);
      const bodyStyles = window.getComputedStyle(bodyEl);
      
      let cssVars = ':root {\\n';
      
      // Get all CSS properties and filter for custom properties (start with --)
      const allProps = [];
      for (let i = 0; i < rootStyles.length; i++) {
        allProps.push(rootStyles[i]);
      }
      
      // Also check for VS Code specific variables by iterating stylesheets
      for (const sheet of targetDoc.styleSheets) {
        try {
          if (sheet.cssRules) {
            for (const rule of sheet.cssRules) {
              if (rule.style) {
                for (let i = 0; i < rule.style.length; i++) {
                  const prop = rule.style[i];
                  if (prop.startsWith('--') && !allProps.includes(prop)) {
                    allProps.push(prop);
                  }
                }
              }
            }
          }
        } catch (e) {}
      }
      
      // Get computed values for all custom properties
      for (const prop of allProps) {
        if (prop.startsWith('--')) {
          const value = rootStyles.getPropertyValue(prop).trim();
          if (value) {
            cssVars += '  ' + prop + ': ' + value + ';\\n';
          }
        }
      }
      cssVars += '}\\n\\n';
      
      css += cssVars;
      
      // Gather all stylesheets from target document
      for (const sheet of targetDoc.styleSheets) {
        try {
          if (sheet.cssRules) {
            for (const rule of sheet.cssRules) {
              css += rule.cssText + '\\n';
            }
          }
        } catch (e) {
          // Cross-origin stylesheets will throw
        }
      }
      
      // Also gather inline styles from <style> tags
      const styleTags = targetDoc.querySelectorAll('style');
      for (const tag of styleTags) {
        css += tag.textContent + '\\n';
      }
      
      return css;
    })()
  `;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    
    if (result.result && result.result.value) {
      return result.result.value;
    }
  } catch (err) {
    console.error('[Snapshot] Failed to capture CSS:', err.message);
  }
  
  return '';
}

/**
 * Capture HTML snapshot of the chat interface
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<{html: string, bodyBg: string, bodyColor: string} | null>}
 */
async function captureSnapshot(cdp) {
  if (!cdp.rootContextId) {
    console.log('[Snapshot] No rootContextId available');
    return null;
  }
  
  const script = `
    (function() {
      const debug = {
        hasActiveFrame: false,
        activeFrameAccessible: false,
        bodyExists: false,
        selectorsChecked: [],
        foundElement: null,
        htmlLength: 0
      };
      
      // VS Code webviews use nested iframes - look for #active-frame
      let targetDoc = document;
      let targetBody = document.body;
      
      debug.bodyExists = !!targetBody;
      
      const activeFrame = document.getElementById('active-frame');
      debug.hasActiveFrame = !!activeFrame;
      if (activeFrame && activeFrame.contentDocument) {
        debug.activeFrameAccessible = true;
        targetDoc = activeFrame.contentDocument;
        targetBody = targetDoc.body;
      }
      
      if (!targetBody) {
        return { html: '<div style="padding:20px;color:#888;">No content found</div>', bodyBg: '', bodyColor: '', debug };
      }
      
      // Get body styles
      const bodyStyles = window.getComputedStyle(targetBody);
      const bodyBg = bodyStyles.backgroundColor || '';
      const bodyColor = bodyStyles.color || '';
      
      // Look for the main content container
      const chatSelectors = [
        '#root',
        '#app',
        '.app',
        'main',
        '[class*="chat"]',
        '[class*="message"]',
        'body > div'
      ];
      
      let chatElement = null;
      for (const selector of chatSelectors) {
        const el = targetDoc.querySelector(selector);
        const len = el ? el.innerHTML.length : 0;
        debug.selectorsChecked.push({ selector, found: !!el, htmlLength: len });
        if (el && len > 50) {
          chatElement = el;
          debug.foundElement = selector;
          break;
        }
      }
      
      if (!chatElement) {
        chatElement = targetBody;
        debug.foundElement = 'body (fallback)';
      }
      
      debug.htmlLength = chatElement.innerHTML.length;
      
      // Scroll chat container to bottom to show latest messages
      const scrollContainers = targetDoc.querySelectorAll('[class*="scroll"], [style*="overflow"]');
      for (const container of scrollContainers) {
        if (container.scrollHeight > container.clientHeight) {
          container.scrollTop = container.scrollHeight;
        }
      }
      
      // Remove tooltips, popovers, and other overlay elements before capture
      // IMPORTANT: Don't remove dropdown buttons (model selector), only dropdown menus/panels
      const elementsToRemove = [
        '[role="tooltip"]',
        '[data-tooltip]',
        '[class*="tooltip"]:not(button):not([role="button"])',
        '[class*="Tooltip"]:not(button):not([role="button"])',
        '[class*="popover"]:not(button):not([role="button"])',
        '[class*="Popover"]:not(button):not([role="button"])',
        '[class*="dropdown-menu"]',
        '[class*="dropdownMenu"]',
        '[class*="DropdownMenu"]',
        '[class*="dropdown-content"]',
        '[class*="dropdownContent"]',
        '[class*="menu"]:not([role="menubar"]):not([class*="menubar"]):not(button):not([role="button"])',
        '[class*="overlay"]:not(button):not([role="button"])',
        '[class*="Overlay"]:not(button):not([role="button"])',
        '[class*="modal"]',
        '[class*="Modal"]',
        '[style*="position: fixed"]:not(button):not([role="button"]):not([class*="input"]):not([class*="chat"])',
        '[style*="position:fixed"]:not(button):not([role="button"]):not([class*="input"]):not([class*="chat"])'
      ];
      
      elementsToRemove.forEach(selector => {
        try {
          chatElement.querySelectorAll(selector).forEach(el => {
            // Don't remove if it's a main content element or important UI component
            const isMainContent = el.closest('#root > div:first-child');
            const isTooltip = el.matches('[role="tooltip"], [class*="tooltip"], [class*="Tooltip"]');
            const isImportantUI = el.matches('[class*="model"], [class*="Model"], [class*="context"], [class*="Context"], [class*="input"], [class*="Input"], [class*="selector"], [class*="Selector"], button, [role="button"]');
            
            if (isTooltip || (!isMainContent && !isImportantUI)) {
              el.remove();
            }
          });
        } catch(e) {}
      });
      
      // Before cloning, inline computed styles for SVGs (currentColor fix)
      const originalSvgs = chatElement.querySelectorAll('svg');
      for (const svg of originalSvgs) {
        try {
          const computedColor = window.getComputedStyle(svg).color || window.getComputedStyle(svg.parentElement).color;
          if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)') {
            svg.querySelectorAll('[fill="currentColor"]').forEach(el => el.setAttribute('fill', computedColor));
            svg.querySelectorAll('[stroke="currentColor"]').forEach(el => el.setAttribute('stroke', computedColor));
            if (svg.getAttribute('fill') === 'currentColor') svg.setAttribute('fill', computedColor);
            if (svg.getAttribute('stroke') === 'currentColor') svg.setAttribute('stroke', computedColor);
            if (!svg.getAttribute('fill') && !svg.getAttribute('stroke')) svg.style.color = computedColor;
          }
        } catch(e) {}
      }
      
      // Clone and return
      const clone = chatElement.cloneNode(true);
      
      return {
        html: clone.outerHTML,
        bodyBg,
        bodyColor,
        debug
      };
    })()
  `;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    
    if (result.result && result.result.value) {
      return result.result.value;
    }
  } catch (err) {
    console.error('[Snapshot] Failed to capture HTML:', err.message);
  }
  
  return null;
}

/**
 * Capture Terminal panel HTML snapshot
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<{html: string, hasContent: boolean} | null>}
 */
async function captureTerminal(cdp) {
  if (!cdp.rootContextId) return null;
  
  // VS Code terminal uses xterm.js which renders to canvas
  // We need to access the accessibility buffer or use xterm's serialize addon
  const script = `
    (function() {
      let targetDoc = document;
      let textContent = '';
      let terminalTabs = [];
      
      // Find the terminal panel area
      const terminalPanel = targetDoc.querySelector('.terminal-outer-container, .integrated-terminal, [class*="terminal-wrapper"]');
      
      // Try to get terminal tabs/instances
      const tabElements = targetDoc.querySelectorAll('.terminal-tab, .single-terminal-tab, [class*="terminal-tabs"] .tab');
      tabElements.forEach((tab, i) => {
        const label = tab.textContent?.trim() || tab.getAttribute('aria-label') || '';
        const isActive = tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true';
        if (label) {
          terminalTabs.push({ label, isActive, index: i });
        }
      });
      
      // Method 1: xterm accessibility tree (most reliable)
      const xtermAccessibility = targetDoc.querySelector('.xterm-accessibility-tree, .xterm-accessibility');
      if (xtermAccessibility) {
        // Get all rows from accessibility tree
        const rows = xtermAccessibility.querySelectorAll('[role="listitem"], div[style*="position"]');
        const lines = [];
        rows.forEach(row => {
          const rowText = row.textContent || '';
          // Filter out screen reader toggle text
          if (rowText && !rowText.includes('Toggle Screen Reader') && rowText.trim()) {
            lines.push(rowText);
          }
        });
        if (lines.length > 0) {
          textContent = lines.join('\\n');
        }
      }
      
      // Method 2: xterm screen buffer via textarea (fallback)
      if (!textContent.trim()) {
        const xtermTextarea = targetDoc.querySelector('.xterm-helper-textarea');
        if (xtermTextarea && xtermTextarea.value) {
          textContent = xtermTextarea.value;
        }
      }
      
      // Method 3: Look for terminal rows with actual content
      if (!textContent.trim()) {
        const xtermRows = targetDoc.querySelectorAll('.xterm-rows > div, .xterm-screen .xterm-rows span');
        const lines = [];
        xtermRows.forEach(row => {
          const spans = row.querySelectorAll('span');
          let lineText = '';
          spans.forEach(span => {
            lineText += span.textContent || '';
          });
          if (!lineText) lineText = row.textContent || '';
          if (lineText.trim()) {
            lines.push(lineText);
          }
        });
        if (lines.length > 0) {
          textContent = lines.join('\\n');
        }
      }
      
      // Method 4: Try OUTPUT panel (HTML-based, not canvas)
      if (!textContent.trim()) {
        const outputPanel = targetDoc.querySelector('.output-view, .repl-input-wrapper, [class*="output"]');
        if (outputPanel) {
          const outputText = outputPanel.textContent || '';
          if (outputText.trim()) {
            textContent = outputText;
          }
        }
      }
      
      // Method 5: Problems panel
      if (!textContent.trim()) {
        const problemsPanel = targetDoc.querySelector('.markers-panel, [class*="problems"]');
        if (problemsPanel) {
          textContent = problemsPanel.textContent || '';
        }
      }
      
      // Method 6: Debug Console
      if (!textContent.trim()) {
        const debugConsole = targetDoc.querySelector('.debug-console, .repl, [class*="debug-console"]');
        if (debugConsole) {
          textContent = debugConsole.textContent || '';
        }
      }
      
      // Method 7: Any panel content in bottom area
      if (!textContent.trim()) {
        const panelContent = targetDoc.querySelector('.panel .content, .panel-body, .pane-body');
        if (panelContent) {
          const panelText = panelContent.textContent || '';
          if (panelText.trim() && panelText.length > 20) {
            textContent = panelText;
          }
        }
      }
      
      // Clean up the text
      textContent = textContent.trim();
      
      // Build HTML representation
      let html = '';
      if (terminalTabs.length > 0) {
        html += '<div class="terminal-tabs">';
        terminalTabs.forEach(tab => {
          html += '<span class="terminal-tab-item' + (tab.isActive ? ' active' : '') + '">' + tab.label + '</span>';
        });
        html += '</div>';
      }
      
      if (textContent) {
        html += '<pre class="terminal-output">' + textContent.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
      }
      
      return {
        html: html,
        textContent: textContent,
        hasContent: textContent.length > 0,
        tabs: terminalTabs
      };
    })()
  `;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    if (result.result && result.result.value) {
      const data = result.result.value;
      if (data.hasContent) {
        console.log(`[Terminal] Captured ${data.textContent.length} chars of output`);
      }
      return data;
    }
  } catch (err) {
    console.error('[Terminal] Failed to capture:', err.message);
  }
  return null;
}

/**
 * Capture Sidebar panel HTML snapshot (File Explorer + Kiro panels)
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<{html: string, files: Array, kiroPanels: Array} | null>}
 */
async function captureSidebar(cdp) {
  if (!cdp.rootContextId) return null;
  
  const script = `
    (function() {
      let targetDoc = document;
      const activeFrame = document.getElementById('active-frame');
      if (activeFrame && activeFrame.contentDocument) {
        targetDoc = activeFrame.contentDocument;
      }
      
      const result = {
        html: '',
        files: [],
        kiroPanels: [],
        hasContent: false
      };
      
      // Look for file explorer / sidebar
      const sidebarSelectors = [
        '.sidebar',
        '.explorer-viewlet',
        '[class*="sidebar"]',
        '.activitybar + .part',
        '.monaco-workbench .part.sidebar',
        '[data-testid="sidebar"]',
        '.composite.viewlet'
      ];
      
      let sidebarElement = null;
      for (const selector of sidebarSelectors) {
        const el = targetDoc.querySelector(selector);
        if (el && el.innerHTML.length > 50) {
          sidebarElement = el;
          break;
        }
      }
      
      // Extract file tree structure
      const fileTreeSelectors = [
        '.monaco-list-row',
        '.explorer-item',
        '[class*="tree-row"]',
        '.file-icon-themable-tree .monaco-list-row'
      ];
      
      for (const selector of fileTreeSelectors) {
        const items = targetDoc.querySelectorAll(selector);
        if (items.length > 0) {
          items.forEach(item => {
            const label = item.querySelector('.label-name, .monaco-icon-label-container, [class*="label"]');
            const icon = item.querySelector('.file-icon, .folder-icon, [class*="icon"]');
            const isFolder = item.classList.contains('folder') || 
                           item.querySelector('.folder-icon') !== null ||
                           item.getAttribute('aria-expanded') !== null;
            const isExpanded = item.getAttribute('aria-expanded') === 'true';
            const depth = parseInt(item.style.paddingLeft || item.style.textIndent || '0') / 8 || 0;
            
            if (label && label.textContent) {
              result.files.push({
                name: label.textContent.trim(),
                isFolder,
                isExpanded,
                depth: Math.floor(depth)
              });
            }
          });
          break;
        }
      }
      
      // Look for Kiro-specific panels (specs, hooks, steering)
      const kiroPanelSelectors = [
        '[class*="kiro"]',
        '[data-testid*="kiro"]',
        '.specs-panel',
        '.hooks-panel',
        '.steering-panel'
      ];
      
      for (const selector of kiroPanelSelectors) {
        const panels = targetDoc.querySelectorAll(selector);
        panels.forEach(panel => {
          const title = panel.querySelector('h2, h3, .title, [class*="title"]');
          if (title && title.textContent) {
            result.kiroPanels.push({
              title: title.textContent.trim(),
              html: panel.outerHTML.substring(0, 5000) // Limit size
            });
          }
        });
      }
      
      if (sidebarElement) {
        result.html = sidebarElement.outerHTML;
        result.hasContent = true;
      }
      
      result.hasContent = result.hasContent || result.files.length > 0 || result.kiroPanels.length > 0;
      
      return result;
    })()
  `;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    if (result.result && result.result.value) return result.result.value;
  } catch (err) {
    console.error('[Sidebar] Failed to capture:', err.message);
  }
  return null;
}

/**
 * Capture Editor panel HTML snapshot (currently open file)
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<{html: string, fileName: string, language: string, content: string} | null>}
 */
async function captureEditor(cdp) {
  if (!cdp.rootContextId) return null;
  
  const script = `
    (function() {
      let targetDoc = document;
      const activeFrame = document.getElementById('active-frame');
      if (activeFrame && activeFrame.contentDocument) {
        targetDoc = activeFrame.contentDocument;
      }
      
      const result = {
        html: '',
        fileName: '',
        language: '',
        content: '',
        lineCount: 0,
        hasContent: false
      };
      
      // Get active tab / file name - try multiple selectors
      const tabSelectors = [
        '.tab.active .label-name',
        '.tab.active .monaco-icon-label-container .label-name',
        '.tab.selected .monaco-icon-label',
        '[class*="tab"][class*="active"] .label-name',
        '.editor-group-container .tab.active',
        '.tabs-container .tab.active',
        '.tab.active',
        '[role="tab"][aria-selected="true"]'
      ];
      
      for (const selector of tabSelectors) {
        try {
          const tab = targetDoc.querySelector(selector);
          if (tab && tab.textContent) {
            result.fileName = tab.textContent.trim().split('\\n')[0].trim();
            if (result.fileName) break;
          }
        } catch(e) {}
      }
      
      // Try to get content from Monaco editor's internal model (best approach)
      try {
        // Look for Monaco editor instance
        const monacoEditors = targetDoc.querySelectorAll('.monaco-editor');
        for (const editorEl of monacoEditors) {
          // Try to access the editor instance through VS Code's API
          const editorInstance = editorEl.__vscode_editor__ || 
                                 editorEl._editor ||
                                 (window.monaco && window.monaco.editor.getEditors && window.monaco.editor.getEditors()[0]);
          
          if (editorInstance && editorInstance.getModel) {
            const model = editorInstance.getModel();
            if (model) {
              result.content = model.getValue();
              result.lineCount = model.getLineCount();
              result.language = model.getLanguageId ? model.getLanguageId() : (model.getModeId ? model.getModeId() : '');
              result.hasContent = true;
              break;
            }
          }
        }
      } catch(e) {
        console.log('Monaco API access failed:', e);
      }
      
      // Fallback: Try to get content from textarea (some editors use this)
      if (!result.content) {
        try {
          const textareas = targetDoc.querySelectorAll('textarea.inputarea, textarea[class*="input"]');
          for (const ta of textareas) {
            if (ta.value && ta.value.length > 10) {
              result.content = ta.value;
              result.hasContent = true;
              break;
            }
          }
        } catch(e) {}
      }
      
      // Fallback: Extract from visible view-lines (limited to what's rendered)
      if (!result.content) {
        const editorSelectors = [
          '.monaco-editor .view-lines',
          '.monaco-editor',
          '.lines-content'
        ];
        
        let viewLinesElement = null;
        let editorElement = null;
        for (const selector of editorSelectors) {
          try {
            const el = targetDoc.querySelector(selector);
            if (el) {
              viewLinesElement = el.querySelector('.view-lines') || el;
              editorElement = el.closest('.monaco-editor') || el;
              break;
            }
          } catch(e) {}
        }
        
        if (viewLinesElement) {
          const lines = viewLinesElement.querySelectorAll('.view-line');
          
          // Try to get line numbers from the line number gutter
          const lineNumberElements = editorElement ? 
            editorElement.querySelectorAll('.line-numbers, .margin-view-overlays .line-numbers') : [];
          
          if (lines.length > 0) {
            // Create a map of line number to content
            const lineMap = new Map();
            let minLineNum = Infinity;
            let maxLineNum = 0;
            
            // Try to match lines with their line numbers from the gutter
            const lineNumMap = new Map();
            lineNumberElements.forEach(ln => {
              const top = parseFloat(ln.style.top) || 0;
              const num = parseInt(ln.textContent, 10);
              if (!isNaN(num)) {
                lineNumMap.set(Math.round(top), num);
              }
            });
            
            lines.forEach(line => {
              const top = parseFloat(line.style.top) || 0;
              const roundedTop = Math.round(top);
              
              // Try to get line number from gutter, or calculate from position
              let lineNum = lineNumMap.get(roundedTop);
              if (!lineNum) {
                // Fallback: calculate from top position (19px line height)
                const lineHeight = 19;
                lineNum = Math.round(top / lineHeight) + 1;
              }
              
              const text = line.textContent || '';
              lineMap.set(lineNum, text);
              minLineNum = Math.min(minLineNum, lineNum);
              maxLineNum = Math.max(maxLineNum, lineNum);
            });
            
            // Build content from line map, starting from minLineNum
            let codeContent = '';
            const startLine = Math.max(1, minLineNum);
            for (let i = startLine; i <= Math.min(maxLineNum, startLine + 500); i++) {
              codeContent += (lineMap.get(i) || '') + '\\n';
            }
            
            result.content = codeContent;
            result.lineCount = maxLineNum;
            result.startLine = startLine;
            result.hasContent = codeContent.trim().length > 0;
            
            // Mark as partial if we don't start from line 1
            if (startLine > 1) {
              result.isPartial = true;
              result.note = 'Showing lines ' + startLine + '-' + maxLineNum + '. Scroll in Kiro to see other parts.';
            }
          }
        }
      }
      
      // Get language from editor element if not already set
      if (!result.language) {
        try {
          const monacoEditor = targetDoc.querySelector('.monaco-editor');
          if (monacoEditor) {
            const modeId = monacoEditor.getAttribute('data-mode-id');
            if (modeId) result.language = modeId;
            
            const langMatch = monacoEditor.className.match(/\\b(typescript|javascript|python|java|html|css|json|markdown|yaml|xml|sql|go|rust|c|cpp|csharp)\\b/i);
            if (langMatch) result.language = langMatch[1].toLowerCase();
          }
        } catch(e) {}
      }
      
      // Fallback: detect language from filename
      if (!result.language && result.fileName) {
        const ext = result.fileName.split('.').pop()?.toLowerCase();
        const extMap = {
          'ts': 'typescript', 'tsx': 'typescript',
          'js': 'javascript', 'jsx': 'javascript',
          'py': 'python', 'java': 'java',
          'html': 'html', 'css': 'css',
          'json': 'json', 'md': 'markdown',
          'yaml': 'yaml', 'yml': 'yaml',
          'xml': 'xml', 'sql': 'sql',
          'go': 'go', 'rs': 'rust',
          'c': 'c', 'cpp': 'cpp', 'h': 'c',
          'cs': 'csharp', 'rb': 'ruby',
          'php': 'php', 'sh': 'bash'
        };
        result.language = extMap[ext] || ext || '';
      }
      
      // Add note about partial content
      if (result.hasContent && result.lineCount < 50) {
        result.isPartial = true;
        result.note = 'Showing visible lines only. Scroll in Kiro to see more.';
      }
      
      return result;
    })()
  `;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    if (result.result && result.result.value) return result.result.value;
  } catch (err) {
    console.error('[Editor] Failed to capture:', err.message);
  }
  return null;
}

/**
 * Alternative: Read file content directly from filesystem
 * This is more reliable than trying to scrape Monaco editor
 */
async function readFileContent(filePath, workspaceRoot) {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  try {
    // Try to resolve the file path
    let fullPath = filePath;
    if (!path.isAbsolute(filePath) && workspaceRoot) {
      fullPath = path.join(workspaceRoot, filePath);
    }
    
    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch (err) {
    console.error('[ReadFile] Failed to read:', err.message);
    return null;
  }
}

/**
 * Poll all cascades for snapshot changes
 * Captures snapshots, compares hashes, and broadcasts updates on change
 */
async function pollSnapshots() {
  for (const [cascadeId, cascade] of cascades) {
    try {
      const cdp = cascade.cdp;
      
      // Capture CSS once if not already captured
      if (cascade.css === null) {
        console.log(`[Snapshot] Capturing CSS for cascade ${cascadeId}...`);
        cascade.css = await captureCSS(cdp);
        console.log(`[Snapshot] CSS captured: ${cascade.css.length} chars`);
      }
      
      // Capture metadata
      const metadata = await captureMetadata(cdp);
      cascade.metadata.chatTitle = metadata.chatTitle || cascade.metadata.chatTitle;
      cascade.metadata.isActive = metadata.isActive;
      
      // Capture HTML snapshot (chat) from Kiro Agent webview
      const snapshot = await captureSnapshot(cdp);
      
      if (snapshot) {
        // Log debug info for troubleshooting
        if (snapshot.debug) {
          console.log(`[Snapshot] Debug for ${cascadeId}:`, JSON.stringify(snapshot.debug, null, 2));
        }
        
        const newHash = computeHash(snapshot.html);
        if (newHash !== cascade.snapshotHash) {
          console.log(`[Snapshot] Chat content changed for cascade ${cascadeId} (${snapshot.html.length} chars)`);
          cascade.snapshot = snapshot;
          cascade.snapshotHash = newHash;
          broadcastSnapshotUpdate(cascadeId, 'chat');
        }
      } else {
        console.log(`[Snapshot] captureSnapshot returned null for cascade ${cascadeId}`);
      }
      
      // Use main window CDP for terminal/sidebar/editor
      const mainCDP = mainWindowCDP.connection;
      if (mainCDP && mainCDP.rootContextId) {
        // Capture Terminal snapshot from main window
        const terminal = await captureTerminal(mainCDP);
        if (terminal && terminal.hasContent) {
          const termHash = computeHash(terminal.html || terminal.textContent || '');
          if (termHash !== cascade.terminalHash) {
            console.log(`[Snapshot] Terminal content changed for cascade ${cascadeId}`);
            cascade.terminal = terminal;
            cascade.terminalHash = termHash;
            broadcastSnapshotUpdate(cascadeId, 'terminal');
          }
        }
        
        // Capture Sidebar snapshot from main window
        const sidebar = await captureSidebar(mainCDP);
        if (sidebar && sidebar.hasContent) {
          const sideHash = computeHash(JSON.stringify(sidebar.files) + sidebar.html);
          if (sideHash !== cascade.sidebarHash) {
            console.log(`[Snapshot] Sidebar content changed for cascade ${cascadeId}`);
            cascade.sidebar = sidebar;
            cascade.sidebarHash = sideHash;
            broadcastSnapshotUpdate(cascadeId, 'sidebar');
          }
        }
        
        // Capture Editor snapshot from main window
        const editor = await captureEditor(mainCDP);
        if (editor && editor.hasContent) {
          const editorHash = computeHash(editor.content + editor.fileName);
          if (editorHash !== cascade.editorHash) {
            console.log(`[Snapshot] Editor content changed for cascade ${cascadeId}`);
            cascade.editor = editor;
            cascade.editorHash = editorHash;
            broadcastSnapshotUpdate(cascadeId, 'editor');
          }
        } else if (cascade.editor && cascade.editor.hasContent) {
          // Clear stale editor data when no file is open
          console.log(`[Snapshot] Editor closed/no file open for cascade ${cascadeId}`);
          cascade.editor = { hasContent: false, fileName: '', content: '' };
          cascade.editorHash = '';
          broadcastSnapshotUpdate(cascadeId, 'editor');
        }
      } else if (!mainCDP) {
        // Main window not connected yet - this is normal during startup
      }
    } catch (err) {
      console.error(`[Snapshot] Error polling cascade ${cascadeId}:`, err.message);
    }
  }
}

/**
 * Broadcast a snapshot update notification to all connected WebSocket clients
 * @param {string} cascadeId - ID of the cascade that was updated
 * @param {string} panel - Panel type that was updated (chat, terminal, sidebar, editor)
 */
function broadcastSnapshotUpdate(cascadeId, panel = 'chat') {
  const message = JSON.stringify({
    type: 'snapshot_update',
    cascadeId,
    panel
  });
  
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// =============================================================================
// Message Injection (Task 6)
// =============================================================================

/**
 * CDP script to inject a message into the chat input and send it.
 * 
 * This script:
 * 1. Finds the chat input element (contenteditable div or textarea)
 * 2. Inserts the message text into the input
 * 3. Triggers the send button click or dispatches Enter key event
 * 
 * @param {string} messageText - The message to inject (will be escaped)
 * @returns {string} - JavaScript expression to evaluate in the page context
 */
function createInjectMessageScript(messageText) {
  // Escape the message for safe inclusion in JavaScript string
  const escapedMessage = messageText
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  
  return `(async () => {
    const text = '${escapedMessage}';
    
    // VS Code webviews use nested iframes - look for #active-frame
    let targetDoc = document;
    const activeFrame = document.getElementById('active-frame');
    if (activeFrame && activeFrame.contentDocument) {
      targetDoc = activeFrame.contentDocument;
    }
    
    // 6.1 Find input element (contenteditable or textarea)
    // Try Kiro's Lexical editor first (contenteditable div)
    let editors = [...targetDoc.querySelectorAll('[data-lexical-editor="true"][contenteditable="true"][role="textbox"]')]
      .filter(el => el.offsetParent !== null);
    let editor = editors.at(-1);
    
    // Fallback: try any contenteditable in the cascade area
    if (!editor) {
      editors = [...targetDoc.querySelectorAll('#cascade [contenteditable="true"]')]
        .filter(el => el.offsetParent !== null);
      editor = editors.at(-1);
    }
    
    // Fallback: try any contenteditable
    if (!editor) {
      editors = [...targetDoc.querySelectorAll('[contenteditable="true"]')]
        .filter(el => el.offsetParent !== null);
      editor = editors.at(-1);
    }
    
    // Fallback: try textarea
    if (!editor) {
      const textareas = [...targetDoc.querySelectorAll('textarea')]
        .filter(el => el.offsetParent !== null);
      editor = textareas.at(-1);
    }
    
    if (!editor) {
      return { ok: false, error: 'editor_not_found', message: 'Could not find chat input element' };
    }
    
    const isTextarea = editor.tagName.toLowerCase() === 'textarea';
    
    // 6.2 Insert text into input element
    editor.focus();
    
    if (isTextarea) {
      // For textarea, set value directly and dispatch input event
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // For contenteditable, use execCommand or fallback to direct manipulation
      // First, select all and delete existing content
      targetDoc.execCommand?.('selectAll', false, null);
      targetDoc.execCommand?.('delete', false, null);
      
      // Try insertText command
      let inserted = false;
      try {
        inserted = !!targetDoc.execCommand?.('insertText', false, text);
      } catch (e) {
        inserted = false;
      }
      
      // Fallback: set textContent and dispatch events
      if (!inserted) {
        editor.textContent = text;
        editor.dispatchEvent(new InputEvent('beforeinput', { 
          bubbles: true, 
          inputType: 'insertText', 
          data: text 
        }));
        editor.dispatchEvent(new InputEvent('input', { 
          bubbles: true, 
          inputType: 'insertText', 
          data: text 
        }));
      }
    }
    
    // Wait for React/framework to process the input
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    
    // 6.3 Trigger send button click or Enter key
    // Try to find the send button (arrow-right icon button)
    const submitButton = targetDoc.querySelector('svg.lucide-arrow-right')?.closest('button');
    
    if (submitButton && !submitButton.disabled) {
      submitButton.click();
      return { ok: true, method: 'click_submit', inputType: isTextarea ? 'textarea' : 'contenteditable' };
    }
    
    // Fallback: try other common send button patterns
    const altSubmitButtons = [
      targetDoc.querySelector('[data-tooltip-id*="send"]')?.closest('button'),
      targetDoc.querySelector('button[type="submit"]'),
      targetDoc.querySelector('button[aria-label*="send" i]'),
      targetDoc.querySelector('button[aria-label*="submit" i]')
    ].filter(btn => btn && !btn.disabled && btn.offsetParent !== null);
    
    if (altSubmitButtons.length > 0) {
      altSubmitButtons[0].click();
      return { ok: true, method: 'click_alt_submit', inputType: isTextarea ? 'textarea' : 'contenteditable' };
    }
    
    // Last resort: dispatch Enter key event
    editor.dispatchEvent(new KeyboardEvent('keydown', { 
      bubbles: true, 
      key: 'Enter', 
      code: 'Enter',
      keyCode: 13,
      which: 13
    }));
    editor.dispatchEvent(new KeyboardEvent('keypress', { 
      bubbles: true, 
      key: 'Enter', 
      code: 'Enter',
      keyCode: 13,
      which: 13
    }));
    editor.dispatchEvent(new KeyboardEvent('keyup', { 
      bubbles: true, 
      key: 'Enter', 
      code: 'Enter',
      keyCode: 13,
      which: 13
    }));
    
    return { 
      ok: true, 
      method: 'enter_key', 
      inputType: isTextarea ? 'textarea' : 'contenteditable',
      submitButtonFound: !!submitButton,
      submitButtonDisabled: submitButton?.disabled ?? null
    };
  })()`;
}

/**
 * Inject a message into the chat via CDP
 * 
 * @param {CDPConnection} cdp - CDP connection object
 * @param {string} message - Message text to inject
 * @returns {Promise<{success: boolean, method?: string, error?: string}>}
 */
async function injectMessage(cdp, message) {
  if (!cdp.rootContextId) {
    return { success: false, error: 'No execution context available' };
  }
  
  const script = createInjectMessageScript(message);
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true,
      awaitPromise: true
    });
    
    if (result.exceptionDetails) {
      const errorMsg = result.exceptionDetails.exception?.description || 
                       result.exceptionDetails.text || 
                       'Unknown error';
      console.error('[Inject] Script exception:', errorMsg);
      return { success: false, error: errorMsg };
    }
    
    const value = result.result?.value;
    if (!value) {
      return { success: false, error: 'No result from injection script' };
    }
    
    if (value.ok) {
      console.log(`[Inject] Message sent via ${value.method} (${value.inputType})`);
      return { 
        success: true, 
        method: value.method,
        inputType: value.inputType
      };
    } else {
      console.error('[Inject] Failed:', value.error, value.message);
      return { success: false, error: value.message || value.error };
    }
  } catch (err) {
    console.error('[Inject] CDP call failed:', err.message);
    return { success: false, error: err.message };
  }
}

// =============================================================================
// Discovery Loop (Task 3)
// =============================================================================

/**
 * Discover CDP targets across all configured ports
 * Scans ports 9000-9003, connects to:
 * 1. Kiro Agent webview (for chat)
 * 2. Main VS Code window (for terminal, sidebar, editor)
 */
async function discoverTargets() {
  console.log('[Discovery] Scanning for CDP targets...');
  
  // Track which cascade IDs we find in this scan
  const foundCascadeIds = new Set();
  let foundMainWindow = false;
  
  // 3.1 Scan all CDP ports for targets
  for (const port of CDP_PORTS) {
    try {
      const targets = await fetchCDPTargets(port);
      
      // Debug: log all targets found on this port
      console.log(`[Discovery] Port ${port}: Found ${targets.length} target(s)`);
      targets.forEach((t, i) => {
        console.log(`  [${i}] type="${t.type}" title="${t.title?.substring(0, 40)}" url="${t.url?.substring(0, 50)}..."`);
      });
      
      // Find the main VS Code window (type: page, url starts with vscode-file://)
      const mainWindowTarget = targets.find(target => {
        const url = (target.url || '').toLowerCase();
        return target.type === 'page' && 
               (url.startsWith('vscode-file://') || url.includes('workbench')) &&
               target.webSocketDebuggerUrl;
      });
      
      // Connect to main window for terminal/sidebar/editor
      if (mainWindowTarget && !mainWindowCDP.connection) {
        console.log(`[Discovery] Found main VS Code window: ${mainWindowTarget.title}`);
        try {
          const cdp = await connectToCDP(mainWindowTarget.webSocketDebuggerUrl);
          mainWindowCDP.connection = cdp;
          mainWindowCDP.id = generateCascadeId(mainWindowTarget.webSocketDebuggerUrl);
          foundMainWindow = true;
          console.log(`[Discovery] Connected to main window: ${mainWindowCDP.id}`);
          
          // Set up disconnect handler
          cdp.ws.on('close', () => {
            console.log(`[Discovery] Main window disconnected`);
            mainWindowCDP.connection = null;
            mainWindowCDP.id = null;
          });
        } catch (err) {
          console.error(`[Discovery] Failed to connect to main window: ${err.message}`);
        }
      } else if (mainWindowTarget) {
        foundMainWindow = true;
      }
      
      // Find Kiro Agent webview (for chat)
      const kiroAgentTargets = targets.filter(target => {
        const url = (target.url || '').toLowerCase();
        return (url.includes('kiroagent') || url.includes('vscode-webview')) && 
               target.webSocketDebuggerUrl &&
               target.type !== 'page';
      });
      
      for (const target of kiroAgentTargets) {
        const wsUrl = target.webSocketDebuggerUrl;
        const cascadeId = generateCascadeId(wsUrl);
        foundCascadeIds.add(cascadeId);
        
        // 3.3 Connect to new targets, reuse existing connections
        if (!cascades.has(cascadeId)) {
          console.log(`[Discovery] Found new Kiro Agent: ${target.title} (${cascadeId})`);
          
          try {
            const cdp = await connectToCDP(wsUrl);
            
            // Create cascade object
            const cascade = {
              id: cascadeId,
              cdp,
              metadata: {
                windowTitle: target.title || 'Unknown',
                chatTitle: '',
                isActive: true
              },
              snapshot: null,
              css: null,
              snapshotHash: null,
              // Panel snapshots (populated from main window)
              terminal: null,
              terminalHash: null,
              sidebar: null,
              sidebarHash: null,
              editor: null,
              editorHash: null
            };
            
            cascades.set(cascadeId, cascade);
            console.log(`[Discovery] Connected to cascade: ${cascadeId}`);
            
            // Set up disconnect handler
            cdp.ws.on('close', () => {
              console.log(`[Discovery] Cascade disconnected: ${cascadeId}`);
              cascades.delete(cascadeId);
              broadcastCascadeList();
            });
            
            // Broadcast updated cascade list to all clients
            broadcastCascadeList();
            
          } catch (err) {
            console.error(`[Discovery] Failed to connect to ${cascadeId}: ${err.message}`);
          }
        } else {
          // Update metadata for existing connection
          const cascade = cascades.get(cascadeId);
          cascade.metadata.windowTitle = target.title || cascade.metadata.windowTitle;
        }
      }
    } catch (err) {
      // Port not available or no CDP server
      console.log(`[Discovery] Port ${port}: ${err.message}`);
    }
  }
  
  // 3.4 Clean up disconnected targets
  for (const [cascadeId, cascade] of cascades) {
    if (!foundCascadeIds.has(cascadeId)) {
      console.log(`[Discovery] Target no longer available: ${cascadeId}`);
      try {
        cascade.cdp.close();
      } catch (e) {}
      cascades.delete(cascadeId);
      broadcastCascadeList();
    }
  }
  
  console.log(`[Discovery] Active cascades: ${cascades.size}`);
}

/**
 * Broadcast the current cascade list to all connected WebSocket clients
 */
function broadcastCascadeList() {
  const cascadeList = Array.from(cascades.values()).map(c => ({
    id: c.id,
    title: c.metadata.chatTitle || c.metadata.windowTitle,
    window: c.metadata.windowTitle,
    active: c.metadata.isActive
  }));
  
  const message = JSON.stringify({
    type: 'cascade_list',
    cascades: cascadeList
  });
  
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Get local IP address for display
function getLocalIP() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Express app setup
const app = express();
app.use(express.json());

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// =============================================================================
// REST API Endpoints (Task 5)
// =============================================================================

/**
 * GET /cascades - List active chat sessions
 * Returns array of { id, title, window, active }
 */
app.get('/cascades', (req, res) => {
  const cascadeList = Array.from(cascades.values()).map(c => ({
    id: c.id,
    title: c.metadata?.chatTitle || c.metadata?.windowTitle || 'Unknown',
    window: c.metadata?.windowTitle || 'Unknown',
    active: c.metadata?.isActive || false
  }));
  res.json(cascadeList);
});

/**
 * GET /snapshot/:id - Get HTML snapshot for a specific cascade
 * Returns snapshot object { html, bodyBg, bodyColor } or 404
 */
app.get('/snapshot/:id', (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  if (!cascade.snapshot) {
    return res.status(404).json({ error: 'No snapshot available' });
  }
  res.json(cascade.snapshot);
});

/**
 * GET /snapshot - Get snapshot of first active cascade (convenience endpoint)
 * Returns snapshot object or 404 if no cascades available
 */
app.get('/snapshot', (req, res) => {
  const firstCascade = cascades.values().next().value;
  if (!firstCascade) {
    return res.status(404).json({ error: 'No cascades available' });
  }
  if (!firstCascade.snapshot) {
    return res.status(404).json({ error: 'No snapshot available' });
  }
  res.json(firstCascade.snapshot);
});

/**
 * GET /debug/:id - Debug endpoint to discover DOM structure
 * Returns list of potential chat elements
 */
app.get('/debug/:id', async (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  
  // Instead of looking at DOM, let's list ALL CDP targets
  const results = [];
  
  for (const port of CDP_PORTS) {
    try {
      const targets = await fetchCDPTargets(port);
      targets.forEach(t => {
        results.push({
          port,
          type: t.type,
          title: t.title,
          url: t.url?.substring(0, 100),
          hasWsUrl: !!t.webSocketDebuggerUrl
        });
      });
    } catch (e) {
      // ignore
    }
  }
  
  res.json(results);
});

/**
 * GET /dom/:id - Debug endpoint to see actual DOM content
 */
app.get('/dom/:id', async (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  
  const script = `
    (function() {
      // Check for nested iframe (VS Code webview pattern)
      const activeFrame = document.getElementById('active-frame');
      if (activeFrame && activeFrame.contentDocument) {
        const innerBody = activeFrame.contentDocument.body;
        return {
          type: 'nested-iframe',
          url: window.location.href,
          innerURL: activeFrame.src,
          innerBodyHTML: innerBody ? innerBody.innerHTML.substring(0, 5000) : 'no inner body',
          innerBodyChildCount: innerBody ? innerBody.children.length : 0,
          innerDivs: innerBody ? Array.from(innerBody.querySelectorAll('div')).slice(0, 30).map(d => ({
            id: d.id,
            className: d.className?.substring?.(0, 100) || '',
            childCount: d.children.length
          })) : []
        };
      }
      
      return {
        type: 'direct',
        url: window.location.href,
        title: document.title,
        bodyHTML: document.body ? document.body.innerHTML.substring(0, 5000) : 'no body',
        bodyChildCount: document.body ? document.body.children.length : 0,
        hasActiveFrame: !!activeFrame,
        activeFrameSrc: activeFrame?.src
      };
    })()
  `;
  
  try {
    const result = await cascade.cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cascade.cdp.rootContextId,
      returnByValue: true
    });
    
    res.json(result.result?.value || { error: 'no result' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /styles/:id - Get CSS for a specific cascade
 * Returns CSS string or 404
 */
app.get('/styles/:id', (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  if (!cascade.css) {
    return res.status(404).json({ error: 'No styles available' });
  }
  res.type('text/css').send(cascade.css);
});

/**
 * GET /terminal/:id - Get Terminal snapshot for a specific cascade
 * Returns terminal object { html, textContent, hasContent } or 404
 */
app.get('/terminal/:id', (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  if (!cascade.terminal || !cascade.terminal.hasContent) {
    return res.status(404).json({ error: 'No terminal content available' });
  }
  res.json(cascade.terminal);
});

/**
 * GET /sidebar/:id - Get Sidebar snapshot for a specific cascade
 * Returns sidebar object { html, files, kiroPanels, hasContent } or 404
 */
app.get('/sidebar/:id', (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  if (!cascade.sidebar || !cascade.sidebar.hasContent) {
    return res.status(404).json({ error: 'No sidebar content available' });
  }
  res.json(cascade.sidebar);
});

/**
 * GET /editor/:id - Get Editor snapshot for a specific cascade
 * Returns editor object { html, fileName, language, content, lineCount, hasContent } or 404
 */
app.get('/editor/:id', (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  if (!cascade.editor || !cascade.editor.hasContent) {
    return res.status(404).json({ error: 'No editor content available' });
  }
  res.json(cascade.editor);
});

/**
 * POST /readFile/:id - Read a file directly from the filesystem
 * Body: { filePath: string }
 * Returns { content, fileName, language, lineCount, hasContent: true }
 * This bypasses Monaco's virtual scrolling limitation by reading the file directly
 */
app.post('/readFile/:id', async (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  
  const { filePath } = req.body;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'filePath is required' });
  }
  
  console.log(`[ReadFile] Reading file: ${filePath}`);
  
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Helper function to recursively find a file by name
    async function findFileRecursive(dir, fileName, maxDepth = 4, currentDepth = 0) {
      if (currentDepth > maxDepth) return null;
      
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        // First check if file exists directly in this directory
        for (const entry of entries) {
          if (entry.isFile() && entry.name === fileName) {
            return path.join(dir, entry.name);
          }
        }
        
        // Then search subdirectories (skip node_modules, .git, etc.)
        for (const entry of entries) {
          if (entry.isDirectory() && 
              !entry.name.startsWith('.') && 
              entry.name !== 'node_modules' &&
              entry.name !== 'dist' &&
              entry.name !== 'build' &&
              entry.name !== '.next') {
            const found = await findFileRecursive(
              path.join(dir, entry.name), 
              fileName, 
              maxDepth, 
              currentDepth + 1
            );
            if (found) return found;
          }
        }
      } catch (e) {
        // Directory not accessible
      }
      return null;
    }
    
    // Try to get workspace root from VS Code via CDP
    let workspaceRoot = null;
    if (mainWindowCDP.connection && mainWindowCDP.connection.rootContextId) {
      try {
        const wsScript = `
          (function() {
            // Try to get workspace folder from VS Code API
            if (typeof acquireVsCodeApi !== 'undefined') {
              return null; // Can't access workspace from webview
            }
            
            // Try to find workspace path from window title or breadcrumbs
            let targetDoc = document;
            const activeFrame = document.getElementById('active-frame');
            if (activeFrame && activeFrame.contentDocument) {
              targetDoc = activeFrame.contentDocument;
            }
            
            // Look for breadcrumb path
            const breadcrumb = targetDoc.querySelector('.monaco-breadcrumbs, .breadcrumbs-control');
            if (breadcrumb) {
              const parts = breadcrumb.textContent.split(/[/\\\\]/);
              if (parts.length > 1) {
                return parts.slice(0, -1).join('/');
              }
            }
            
            // Try to get from window title
            const title = document.title || '';
            const match = title.match(/- ([A-Za-z]:[^-]+|\/[^-]+)/);
            if (match) {
              return match[1].trim();
            }
            
            return null;
          })()
        `;
        
        const wsResult = await mainWindowCDP.connection.call('Runtime.evaluate', {
          expression: wsScript,
          contextId: mainWindowCDP.connection.rootContextId,
          returnByValue: true
        });
        
        if (wsResult.result && wsResult.result.value) {
          workspaceRoot = wsResult.result.value;
        }
      } catch (e) {
        console.log('[ReadFile] Could not get workspace root from CDP:', e.message);
      }
    }
    
    // Try multiple possible paths
    const possiblePaths = [];
    const fileName = path.basename(filePath);
    
    // If path is absolute, use it directly
    if (path.isAbsolute(filePath)) {
      possiblePaths.push(filePath);
    } else {
      // Try relative to workspace root if we have it
      if (workspaceRoot) {
        possiblePaths.push(path.join(workspaceRoot, filePath));
      }
      
      // Try relative to common workspace locations
      const commonRoots = [
        process.cwd(),
        path.dirname(__dirname), // Parent of kiro-mobile-bridge
        path.join(path.dirname(__dirname), '..'), // Two levels up
      ];
      
      for (const root of commonRoots) {
        possiblePaths.push(path.join(root, filePath));
        // Also try in public subdirectory (common for web projects)
        possiblePaths.push(path.join(root, 'public', filePath));
        possiblePaths.push(path.join(root, 'src', filePath));
      }
    }
    
    // Try each path until we find the file
    let content = null;
    let foundPath = null;
    
    for (const tryPath of possiblePaths) {
      try {
        content = await fs.readFile(tryPath, 'utf-8');
        foundPath = tryPath;
        console.log(`[ReadFile] Found file at: ${tryPath}`);
        break;
      } catch (e) {
        // File not found at this path, try next
      }
    }
    
    // If still not found, do a recursive search from workspace roots
    if (!content) {
      console.log(`[ReadFile] Direct paths failed, searching recursively for: ${fileName}`);
      const searchRoots = [
        process.cwd(),
        path.dirname(__dirname),
      ];
      
      for (const root of searchRoots) {
        foundPath = await findFileRecursive(root, fileName);
        if (foundPath) {
          try {
            content = await fs.readFile(foundPath, 'utf-8');
            console.log(`[ReadFile] Found file via recursive search: ${foundPath}`);
            break;
          } catch (e) {
            foundPath = null;
          }
        }
      }
    }
    
    if (!content) {
      console.log(`[ReadFile] File not found. Tried paths:`, possiblePaths);
      return res.status(404).json({ error: 'File not found', triedPaths: possiblePaths, searchedFor: fileName });
    }
    
    // Detect language from file extension
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const extMap = {
      'ts': 'typescript', 'tsx': 'typescript',
      'js': 'javascript', 'jsx': 'javascript',
      'py': 'python', 'java': 'java',
      'html': 'html', 'css': 'css',
      'json': 'json', 'md': 'markdown',
      'yaml': 'yaml', 'yml': 'yaml',
      'xml': 'xml', 'sql': 'sql',
      'go': 'go', 'rs': 'rust',
      'c': 'c', 'cpp': 'cpp', 'h': 'c',
      'cs': 'csharp', 'rb': 'ruby',
      'php': 'php', 'sh': 'bash',
      'vue': 'vue', 'svelte': 'svelte',
      'cob': 'cobol', 'cbl': 'cobol'
    };
    
    const language = extMap[ext] || ext || '';
    const lines = content.split('\n');
    
    res.json({
      content,
      fileName: path.basename(filePath),
      fullPath: foundPath,
      language,
      lineCount: lines.length,
      hasContent: true,
      startLine: 1,
      isPartial: false
    });
    
  } catch (err) {
    console.error(`[ReadFile] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /files/:id - List all code files in the workspace
 * Returns { files: [{ name, path, language }] }
 * Scans workspace directory for code files (filtered by extension)
 */
app.get('/files/:id', async (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  
  console.log(`[Files] Listing workspace files`);
  
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Code file extensions to include
    const codeExtensions = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.java', '.go', '.rs', '.rb', '.php',
      '.html', '.css', '.scss', '.sass', '.less',
      '.json', '.yaml', '.yml', '.xml', '.toml',
      '.md', '.mdx', '.txt',
      '.sql', '.graphql', '.gql',
      '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
      '.c', '.cpp', '.h', '.hpp', '.cs',
      '.vue', '.svelte', '.astro',
      '.env', '.gitignore', '.dockerignore',
      '.cob', '.cbl'
    ]);
    
    // Extension to language mapping
    const extToLang = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
      '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust',
      '.rb': 'ruby', '.php': 'php',
      '.html': 'html', '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less',
      '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml', '.toml': 'toml',
      '.md': 'markdown', '.mdx': 'markdown',
      '.sql': 'sql', '.graphql': 'graphql', '.gql': 'graphql',
      '.sh': 'bash', '.bash': 'bash', '.zsh': 'zsh', '.ps1': 'powershell', '.bat': 'batch', '.cmd': 'batch',
      '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp', '.cs': 'csharp',
      '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
      '.cob': 'cobol', '.cbl': 'cobol'
    };
    
    const files = [];
    // Use parent directory as workspace root (kiro-mobile-bridge is inside the workspace)
    const workspaceRoot = path.dirname(__dirname);
    
    // Recursive function to collect files
    async function collectFiles(dir, relativePath = '', depth = 0) {
      if (depth > 5) return; // Max depth
      
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          // Skip hidden files/folders and common non-code directories
          if (entry.name.startsWith('.') ||
              entry.name === 'node_modules' ||
              entry.name === 'dist' ||
              entry.name === 'build' ||
              entry.name === '.next' ||
              entry.name === '__pycache__' ||
              entry.name === 'venv' ||
              entry.name === 'coverage') {
            continue;
          }
          
          const entryPath = path.join(dir, entry.name);
          const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          
          if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (codeExtensions.has(ext) || entry.name === 'Dockerfile' || entry.name === 'Makefile') {
              files.push({
                name: entry.name,
                path: entryRelative,
                language: extToLang[ext] || ext.slice(1) || 'text'
              });
            }
          } else if (entry.isDirectory()) {
            await collectFiles(entryPath, entryRelative, depth + 1);
          }
        }
      } catch (e) {
        // Directory not accessible
      }
    }
    
    await collectFiles(workspaceRoot);
    
    // Sort files: by path for easier browsing
    files.sort((a, b) => a.path.localeCompare(b.path));
    
    console.log(`[Files] Found ${files.length} code files`);
    res.json({ files, workspaceRoot });
    
  } catch (err) {
    console.error(`[Files] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /openFile/:id - Open a file in the Kiro editor
 * Body: { filePath: string }
 * Uses VS Code command to open the file
 */
app.post('/openFile/:id', async (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  
  const { filePath } = req.body;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'filePath is required' });
  }
  
  // Use main window CDP to execute VS Code command
  if (!mainWindowCDP.connection || !mainWindowCDP.connection.rootContextId) {
    return res.status(503).json({ error: 'Main window CDP connection not available' });
  }
  
  console.log(`[OpenFile] Opening file: ${filePath}`);
  
  try {
    const cdp = mainWindowCDP.connection;
    
    // Execute VS Code command to open file via the command palette API
    const script = `
      (function() {
        const filePath = ${JSON.stringify(filePath)};
        
        // Try to find and use VS Code API
        if (typeof acquireVsCodeApi !== 'undefined') {
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'openFile', path: filePath });
          return { success: true, method: 'vscodeApi' };
        }
        
        // Try clicking on file link in the chat if it exists
        let targetDoc = document;
        const activeFrame = document.getElementById('active-frame');
        if (activeFrame && activeFrame.contentDocument) {
          targetDoc = activeFrame.contentDocument;
        }
        
        // Look for file links that match the path
        const fileLinks = targetDoc.querySelectorAll('a[href], [data-path], [class*="file"], [class*="link"]');
        for (const link of fileLinks) {
          const text = link.textContent || '';
          const href = link.getAttribute('href') || '';
          const dataPath = link.getAttribute('data-path') || '';
          
          if (text.includes(filePath) || href.includes(filePath) || dataPath.includes(filePath)) {
            link.click();
            return { success: true, method: 'linkClick', element: text.substring(0, 50) };
          }
        }
        
        // Try keyboard shortcut Ctrl+P to open quick open, then type filename
        // This is a fallback that simulates user behavior
        return { success: false, error: 'Could not find file link' };
      })()
    `;
    
    const evalResult = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true,
      awaitPromise: false
    });
    
    if (evalResult.result && evalResult.result.value) {
      res.json(evalResult.result.value);
    } else {
      res.json({ success: false, error: 'Script execution returned no result' });
    }
  } catch (err) {
    console.error(`[OpenFile] Error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /send/:id - Send message to a cascade
 * Body: { message: string }
 * Injects the message into the chat via CDP (Task 6)
 */
app.post('/send/:id', async (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  if (!cascade.cdp) {
    return res.status(503).json({ error: 'CDP connection not available' });
  }
  
  console.log(`[Send] Injecting message to cascade ${req.params.id}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
  
  try {
    const result = await injectMessage(cascade.cdp, message);
    
    if (result.success) {
      res.json({ 
        success: true, 
        method: result.method,
        inputType: result.inputType
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.error || 'Message injection failed'
      });
    }
  } catch (err) {
    console.error(`[Send] Error injecting message:`, err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * POST /click/:id - Click an element in the Kiro UI
 * Body: { tag, text, ariaLabel, title, role, className, id, relativeX, relativeY }
 * Finds and clicks the matching element via CDP
 */
app.post('/click/:id', async (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade) {
    return res.status(404).json({ error: 'Cascade not found' });
  }
  
  if (!cascade.cdp || !cascade.cdp.rootContextId) {
    return res.status(503).json({ error: 'CDP connection not available' });
  }
  
  const clickInfo = req.body;
  console.log(`[Click] Attempting click:`, clickInfo.text?.substring(0, 30) || clickInfo.ariaLabel || clickInfo.tag);
  
  try {
    const result = await clickElement(cascade.cdp, clickInfo);
    res.json(result);
  } catch (err) {
    console.error(`[Click] Error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Click an element in the Kiro UI via CDP using native mouse events
 */
async function clickElement(cdp, clickInfo) {
  // First, find the element and get its coordinates
  const findScript = `
    (function() {
      let targetDoc = document;
      const activeFrame = document.getElementById('active-frame');
      if (activeFrame && activeFrame.contentDocument) {
        targetDoc = activeFrame.contentDocument;
      }
      
      const info = ${JSON.stringify(clickInfo)};
      let element = null;
      let matchMethod = '';
      let isTabClick = info.isTab || info.role === 'tab';
      let isCloseButton = info.isCloseButton || (info.ariaLabel && info.ariaLabel.toLowerCase() === 'close');
      let isToggle = info.isToggle || info.role === 'switch';
      let isDropdown = info.isDropdown || info.ariaHaspopup;
      
      // Handle toggle/switch clicks
      if (isToggle && !element) {
        // Find by toggle ID first
        if (info.toggleId) {
          element = targetDoc.getElementById(info.toggleId);
          if (element) matchMethod = 'toggle-id';
        }
        // Find by label text
        if (!element && info.text) {
          const toggles = targetDoc.querySelectorAll('.kiro-toggle-switch, [role="switch"]');
          for (const t of toggles) {
            const label = t.querySelector('label') || t.closest('.kiro-toggle-switch')?.querySelector('label');
            if (label && label.textContent.trim().toLowerCase().includes(info.text.toLowerCase())) {
              element = t.querySelector('input') || t;
              matchMethod = 'toggle-label';
              break;
            }
          }
        }
        // Fallback: find any toggle switch
        if (!element) {
          element = targetDoc.querySelector('#autonomy-mode-toggle-switch, .kiro-toggle-switch input, [role="switch"]');
          if (element) matchMethod = 'toggle-fallback';
        }
      }
      
      // Handle dropdown clicks
      if (isDropdown && !element) {
        // Find dropdown by text content
        if (info.text) {
          const dropdowns = targetDoc.querySelectorAll('.kiro-dropdown-trigger, [aria-haspopup="true"], [aria-haspopup="listbox"]');
          for (const d of dropdowns) {
            if (d.textContent.trim().toLowerCase().includes(info.text.toLowerCase())) {
              element = d;
              matchMethod = 'dropdown-text';
              break;
            }
          }
        }
        // Fallback: find any dropdown trigger
        if (!element) {
          element = targetDoc.querySelector('.kiro-dropdown-trigger, [aria-haspopup="true"]');
          if (element) matchMethod = 'dropdown-fallback';
        }
      }
      
      // Handle close button clicks explicitly
      if (isCloseButton) {
        const closeButtons = targetDoc.querySelectorAll('[aria-label="close"], .kiro-tabs-item-close, [class*="close"]');
        for (const btn of closeButtons) {
          // Find the close button in the currently selected tab or matching context
          const parentTab = btn.closest('[role="tab"]');
          if (parentTab && parentTab.getAttribute('aria-selected') === 'true') {
            element = btn;
            matchMethod = 'close-button-selected-tab';
            break;
          }
        }
        // If no selected tab close button, find any close button
        if (!element && closeButtons.length > 0) {
          element = closeButtons[0];
          matchMethod = 'close-button-first';
        }
      }
      
      // Handle file link clicks - find and click file references in chat
      if (info.isFileLink && info.filePath && !element) {
        const filePath = info.filePath;
        const fileName = filePath.split('/').pop().split('\\\\').pop();
        
        // Look for file links in the chat
        const fileSelectors = [
          'a[href*="' + fileName + '"]',
          '[data-path*="' + fileName + '"]',
          'code',
          'span',
          '[class*="file"]',
          '[class*="link"]',
          '[class*="path"]'
        ];
        
        for (const selector of fileSelectors) {
          const candidates = targetDoc.querySelectorAll(selector);
          for (const el of candidates) {
            const text = (el.textContent || '').trim();
            const dataPath = el.getAttribute('data-path') || '';
            const href = el.getAttribute('href') || '';
            
            if (text.includes(filePath) || text.includes(fileName) ||
                dataPath.includes(filePath) || dataPath.includes(fileName) ||
                href.includes(filePath) || href.includes(fileName)) {
              element = el;
              matchMethod = 'file-link-' + selector.split('[')[0];
              break;
            }
          }
          if (element) break;
        }
      }
      
      // For tabs, find by label text and click the tab itself (not close button)
      if (isTabClick && !element) {
        const allTabs = targetDoc.querySelectorAll('[role="tab"]');
        const searchText = (info.tabLabel || info.text || '').trim().toLowerCase();
        
        for (const tab of allTabs) {
          const labelEl = tab.querySelector('.kiro-tabs-item-label, [class*="label"]');
          const tabText = labelEl ? labelEl.textContent.trim().toLowerCase() : tab.textContent.trim().toLowerCase();
          
          // Match by label text
          if (searchText && (tabText.includes(searchText) || searchText.includes(tabText))) {
            element = tab;
            matchMethod = 'tab-label-match';
            break;
          }
        }
      }
      
      // 1. Try by aria-label (skip for tabs and close buttons, already handled)
      if (!isTabClick && !isCloseButton && info.ariaLabel && !element) {
        try {
          // Exclude close buttons
          const candidates = targetDoc.querySelectorAll('[aria-label="' + info.ariaLabel.replace(/"/g, '\\\\"') + '"]');
          for (const c of candidates) {
            const label = (c.getAttribute('aria-label') || '').toLowerCase();
            if (!label.includes('close') && !label.includes('delete') && !label.includes('remove')) {
              element = c;
              matchMethod = 'aria-label';
              break;
            }
          }
        } catch(e) {}
      }
      
      // 2. Try by title
      if (info.title && !element) {
        try {
          element = targetDoc.querySelector('[title="' + info.title.replace(/"/g, '\\\\"') + '"]');
          if (element) matchMethod = 'title';
        } catch(e) {}
      }
      
      // 3. Try by text content - search all clickable elements
      if (info.text && info.text.trim() && !element) {
        const searchText = info.text.trim();
        const allElements = targetDoc.querySelectorAll('button, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], a, [tabindex="0"], [class*="button"], [class*="btn"]');
        for (const el of allElements) {
          // Skip close buttons unless explicitly looking for one
          if (!isCloseButton) {
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            if (ariaLabel.includes('close') || ariaLabel.includes('delete')) continue;
            if (el.classList.contains('kiro-tabs-item-close')) continue;
          }
          
          const elText = (el.textContent || '').trim();
          if (elText === searchText || (elText.length > 0 && searchText.includes(elText)) || (searchText.length > 0 && elText.includes(searchText))) {
            element = el;
            matchMethod = 'text-content';
            break;
          }
        }
      }
      
      // 4. Try by partial aria-label match
      if (info.ariaLabel && !element && !isCloseButton) {
        const allWithAria = targetDoc.querySelectorAll('[aria-label]');
        for (const el of allWithAria) {
          const label = el.getAttribute('aria-label') || '';
          // Skip close buttons
          if (label.toLowerCase().includes('close') || label.toLowerCase().includes('delete')) continue;
          
          if (label.toLowerCase().includes(info.ariaLabel.toLowerCase()) || info.ariaLabel.toLowerCase().includes(label.toLowerCase())) {
            element = el;
            matchMethod = 'aria-label-partial';
            break;
          }
        }
      }
      
      // 5. Try by role
      if (info.role && !element) {
        const candidates = targetDoc.querySelectorAll('[role="' + info.role + '"]');
        if (info.text) {
          for (const c of candidates) {
            if ((c.textContent || '').includes(info.text.substring(0, 15))) {
              element = c;
              matchMethod = 'role+text';
              break;
            }
          }
        }
      }
      
      if (!element) {
        return { found: false, error: 'Element not found' };
      }
      
      // Scroll element into view first
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      
      // Get element's bounding rect for coordinate-based clicking
      const rect = element.getBoundingClientRect();
      
      // For tabs, click on the LEFT side (on the label area) to avoid close button
      let x, y;
      if (isTabClick && !isCloseButton) {
        // Find the label element and click on it
        const labelEl = element.querySelector('.kiro-tabs-item-label, [class*="label"]');
        if (labelEl) {
          const labelRect = labelEl.getBoundingClientRect();
          x = labelRect.left + labelRect.width / 2;
          y = labelRect.top + labelRect.height / 2;
        } else {
          // Fallback: click 30% from left edge
          x = rect.left + rect.width * 0.3;
          y = rect.top + rect.height / 2;
        }
      } else {
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }
      
      return { 
        found: true, 
        matchMethod,
        x: Math.round(x),
        y: Math.round(y),
        tag: element.tagName,
        isTab: isTabClick,
        isCloseButton: isCloseButton
      };
    })()
  `;
  
  try {
    // Step 1: Find element and get coordinates
    const findResult = await cdp.call('Runtime.evaluate', {
      expression: findScript,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    
    const elementInfo = findResult.result?.value;
    if (!elementInfo || !elementInfo.found) {
      console.log('[Click] Element not found:', clickInfo.ariaLabel || clickInfo.text);
      return { success: false, error: 'Element not found' };
    }
    
    console.log('[Click] Found element at', elementInfo.x, elementInfo.y, 'via', elementInfo.matchMethod);
    
    // Step 2: Use CDP Input.dispatchMouseEvent for native click
    // This works better with React/VS Code components
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: elementInfo.x,
      y: elementInfo.y,
      button: 'left',
      clickCount: 1
    });
    
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: elementInfo.x,
      y: elementInfo.y,
      button: 'left',
      clickCount: 1
    });
    
    return { success: true, matchMethod: elementInfo.matchMethod, x: elementInfo.x, y: elementInfo.y };
    
  } catch (err) {
    console.error('[Click] CDP error:', err.message);
    return { success: false, error: err.message };
  }
}

// Create HTTP server
const httpServer = createServer(app);

// =============================================================================
// WebSocket Server (Task 7)
// =============================================================================

const wss = new WebSocketServer({ server: httpServer });

// 7.1 WebSocketServer attached to HTTP server (done above)
// 7.2 Send cascade list on client connect
// 7.3 Broadcast snapshot updates when content changes (handled by broadcastSnapshotUpdate)

wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress || 'unknown';
  console.log(`[WebSocket] Client connected from ${clientIP}`);
  
  // 7.2 Send current cascade list immediately on connect
  const cascadeList = Array.from(cascades.values()).map(c => ({
    id: c.id,
    title: c.metadata?.chatTitle || c.metadata?.windowTitle || 'Unknown',
    window: c.metadata?.windowTitle || 'Unknown',
    active: c.metadata?.isActive || false
  }));
  
  ws.send(JSON.stringify({
    type: 'cascade_list',
    cascades: cascadeList
  }));
  
  // Handle client disconnect
  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected from ${clientIP}`);
  });
  
  // Handle errors
  ws.on('error', (err) => {
    console.error(`[WebSocket] Error from ${clientIP}:`, err.message);
  });
});

// Start server
httpServer.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('🌉 Kiro Mobile Bridge');
  console.log('─────────────────────');
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://${localIP}:${PORT}`);
  console.log('');
  console.log('Open the Network URL on your phone to monitor Kiro.');
  console.log('');
  console.log('');
  
  // 3.5 Run discovery on startup and every 10 seconds
  discoverTargets();
  setInterval(discoverTargets, 10000);
  
  // 4.5 Run snapshot polling every 1 second for faster updates
  setInterval(pollSnapshots, 1000);
});

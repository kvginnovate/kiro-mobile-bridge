/**
 * Snapshot capture service - captures DOM snapshots from Kiro via CDP
 */
import { getLanguageFromExtension } from '../utils/constants.js';

/**
 * Capture chat metadata (title, active state)
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<{chatTitle: string, isActive: boolean}>}
 */
export async function captureMetadata(cdp) {
  if (!cdp.rootContextId) return { chatTitle: '', isActive: false };
  
  const script = `(function() {
    let chatTitle = '';
    let isActive = false;
    
    const titleSelectors = ['.chat-title', '.conversation-title', '[data-testid="chat-title"]', '.chat-header h1', '.chat-header h2'];
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) { chatTitle = el.textContent.trim(); break; }
    }
    
    const activeIndicators = ['.typing-indicator', '.loading-indicator', '[data-loading="true"]'];
    for (const selector of activeIndicators) {
      if (document.querySelector(selector)) { isActive = true; break; }
    }
    isActive = isActive || document.hasFocus();
    
    return { chatTitle, isActive };
  })()`;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    return result.result?.value || { chatTitle: '', isActive: false };
  } catch (err) {
    console.error('[Snapshot] Failed to capture metadata:', err.message);
    return { chatTitle: '', isActive: false };
  }
}

/**
 * Capture CSS styles from the page (run once per connection)
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<string>} - Combined CSS string
 */
export async function captureCSS(cdp) {
  if (!cdp.rootContextId) return '';
  
  const script = `(function() {
    let css = '';
    let targetDoc = document;
    const activeFrame = document.getElementById('active-frame');
    if (activeFrame && activeFrame.contentDocument) targetDoc = activeFrame.contentDocument;
    
    const rootStyles = window.getComputedStyle(targetDoc.documentElement);
    const allProps = [];
    for (let i = 0; i < rootStyles.length; i++) allProps.push(rootStyles[i]);
    
    // Safely iterate stylesheets with null check
    const styleSheets = targetDoc.styleSheets || [];
    for (const sheet of styleSheets) {
      try {
        if (sheet.cssRules) {
          for (const rule of sheet.cssRules) {
            if (rule.style) {
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                if (prop.startsWith('--') && !allProps.includes(prop)) allProps.push(prop);
              }
            }
          }
        }
      } catch (e) {
        // CORS restriction on external stylesheets, skip
      }
    }
    
    let cssVars = ':root {\\n';
    for (const prop of allProps) {
      if (prop.startsWith('--')) {
        const value = rootStyles.getPropertyValue(prop).trim();
        if (value) cssVars += '  ' + prop + ': ' + value + ';\\n';
      }
    }
    cssVars += '}\\n\\n';
    css += cssVars;
    
    for (const sheet of styleSheets) {
      try {
        if (sheet.cssRules) {
          for (const rule of sheet.cssRules) css += rule.cssText + '\\n';
        }
      } catch (e) {
        // CORS restriction, skip
      }
    }
    
    const styleTags = targetDoc.querySelectorAll('style');
    for (const tag of styleTags) css += tag.textContent + '\\n';
    
    return css;
  })()`;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    return result.result?.value || '';
  } catch (err) {
    console.error('[Snapshot] Failed to capture CSS:', err.message);
    return '';
  }
}


/**
 * Capture HTML snapshot of the chat interface
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<{html: string, bodyBg: string, bodyColor: string} | null>}
 */
export async function captureSnapshot(cdp) {
  if (!cdp.rootContextId) {
    console.log('[Snapshot] No rootContextId available');
    return null;
  }
  
  const script = `(function() {
    let targetDoc = document;
    let targetBody = document.body;
    
    const activeFrame = document.getElementById('active-frame');
    if (activeFrame && activeFrame.contentDocument) {
      targetDoc = activeFrame.contentDocument;
      targetBody = targetDoc.body;
    }
    
    if (!targetBody) return { html: '<div style="padding:20px;color:#888;">No content found</div>', bodyBg: '', bodyColor: '' };
    
    const bodyStyles = window.getComputedStyle(targetBody);
    const bodyBg = bodyStyles.backgroundColor || '';
    const bodyColor = bodyStyles.color || '';
    
    const scrollContainers = targetDoc.querySelectorAll('[class*="scroll"], [style*="overflow"]');
    
    for (const container of scrollContainers) {
      if (container.scrollHeight > container.clientHeight) {
        const isHistoryPanel = container.matches('[class*="history"], [class*="History"], [class*="session-list"], [class*="SessionList"]') ||
          container.closest('[class*="history"], [class*="History"], [class*="session-list"], [class*="SessionList"]');
        
        if (isHistoryPanel) {
          container.scrollTop = 0;
        } else {
          container.scrollTop = container.scrollHeight;
        }
      }
    }
    
    const clone = targetBody.cloneNode(true);
    
    // Capture any portal/overlay content that might be outside the body
    // Radix UI and similar libraries render dropdowns in portals at document root
    const portals = targetDoc.querySelectorAll('[data-radix-portal], [data-radix-popper-content-wrapper], [class*="portal"], [class*="Portal"]');
    portals.forEach(portal => {
      try {
        const portalClone = portal.cloneNode(true);
        clone.appendChild(portalClone);
      } catch(e) {
        // Clone failed, skip
      }
    });
    
    // Also check for any floating/overlay elements at document level
    const floatingSelectors = [
      'body > [role="listbox"]', 
      'body > [role="menu"]', 
      'body > [data-state="open"]', 
      'body > [class*="dropdown"]',
      'body > div[style*="position: absolute"]',
      'body > div[style*="position: fixed"]'
    ];
    
    floatingSelectors.forEach(sel => {
      try {
        targetDoc.querySelectorAll(sel).forEach(el => {
          const elClone = el.cloneNode(true);
          clone.appendChild(elClone);
        });
      } catch(e) {
        // Selector failed, skip
      }
    });
    
    // Remove ONLY tooltips from clone - preserve everything else
    try {
      clone.querySelectorAll('[role="tooltip"]').forEach(el => el.remove());
    } catch(e) {
      // Removal failed, continue
    }
    
    // Fix SVG currentColor
    clone.querySelectorAll('svg').forEach(svg => {
      try {
        const computedColor = '#cccccc';
        svg.querySelectorAll('[fill="currentColor"]').forEach(el => el.setAttribute('fill', computedColor));
        svg.querySelectorAll('[stroke="currentColor"]').forEach(el => el.setAttribute('stroke', computedColor));
      } catch(e) {
        // SVG fix failed, continue
      }
    });
    
    // Remove placeholder text
    try {
      clone.querySelectorAll('[contenteditable="true"], [data-lexical-editor="true"]').forEach(editable => {
        const parent = editable.parentElement;
        if (parent) {
          Array.from(parent.children).forEach(sibling => {
            if (sibling === editable) return;
            const text = (sibling.textContent || '').toLowerCase();
            if (text.includes('ask') || text.includes('question') || text.includes('task') || text.includes('describe')) {
              sibling.remove();
            }
          });
        }
      });
      
      clone.querySelectorAll('[class*="placeholder"], [class*="Placeholder"], [data-placeholder]').forEach(el => {
        if (!el.matches('[contenteditable], [data-lexical-editor], textarea, input')) {
          if (!el.querySelector('[contenteditable], [data-lexical-editor], textarea, input')) el.remove();
        }
      });
    } catch(e) {
      // Placeholder removal failed, continue
    }
    
    return { html: clone.outerHTML, bodyBg, bodyColor };
  })()`;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    
    return result.result?.value || null;
  } catch (err) {
    console.error('[Snapshot] Failed to capture HTML:', err.message);
    return null;
  }
}

/**
 * Capture Editor panel snapshot (currently open file)
 * @param {CDPConnection} cdp - CDP connection
 * @returns {Promise<{fileName: string, language: string, content: string, lineCount: number, hasContent: boolean} | null>}
 */
export async function captureEditor(cdp) {
  if (!cdp.rootContextId) return null;
  
  const script = `(function() {
    let targetDoc = document;
    const activeFrame = document.getElementById('active-frame');
    if (activeFrame && activeFrame.contentDocument) targetDoc = activeFrame.contentDocument;
    
    const result = { html: '', fileName: '', language: '', content: '', lineCount: 0, hasContent: false };
    
    // Get active tab / file name
    const tabSelectors = ['.tab.active .label-name', '.tab.active', '[role="tab"][aria-selected="true"]'];
    for (const selector of tabSelectors) {
      try {
        const tab = targetDoc.querySelector(selector);
        if (tab && tab.textContent) {
          result.fileName = tab.textContent.trim().split('\\n')[0].trim();
          if (result.fileName) break;
        }
      } catch(e) {
        // Selector failed, continue
      }
    }
    
    // Try Monaco API
    try {
      const monacoEditors = targetDoc.querySelectorAll('.monaco-editor');
      for (const editorEl of monacoEditors) {
        const editorInstance = editorEl.__vscode_editor__ || editorEl._editor ||
          (window.monaco && window.monaco.editor && window.monaco.editor.getEditors && window.monaco.editor.getEditors()[0]);
        if (editorInstance && editorInstance.getModel) {
          const model = editorInstance.getModel();
          if (model) {
            result.content = model.getValue();
            result.lineCount = model.getLineCount();
            result.language = model.getLanguageId ? model.getLanguageId() : '';
            result.hasContent = true;
            break;
          }
        }
      }
    } catch(e) {
      // Monaco API not available, continue
    }
    
    // Fallback: Extract from view-lines
    if (!result.content) {
      const viewLines = targetDoc.querySelector('.monaco-editor .view-lines');
      if (viewLines) {
        const lines = viewLines.querySelectorAll('.view-line');
        if (lines.length > 0) {
          let codeContent = '';
          let minLineNum = Infinity, maxLineNum = 0;
          const lineMap = new Map();
          
          lines.forEach(line => {
            const top = parseFloat(line.style.top) || 0;
            const lineNum = Math.round(top / 19) + 1;
            lineMap.set(lineNum, line.textContent || '');
            minLineNum = Math.min(minLineNum, lineNum);
            maxLineNum = Math.max(maxLineNum, lineNum);
          });
          
          for (let i = minLineNum; i <= Math.min(maxLineNum, minLineNum + 500); i++) {
            codeContent += (lineMap.get(i) || '') + '\\n';
          }
          
          result.content = codeContent;
          result.lineCount = maxLineNum;
          result.startLine = minLineNum;
          result.hasContent = codeContent.trim().length > 0;
          if (minLineNum > 1) {
            result.isPartial = true;
            result.note = 'Showing lines ' + minLineNum + '-' + maxLineNum + '. Scroll in Kiro to see other parts.';
          }
        }
      }
    }
    
    // Detect language from filename
    if (!result.language && result.fileName) {
      const ext = result.fileName.split('.').pop()?.toLowerCase();
      const extMap = {
        'ts': 'typescript', 'tsx': 'typescript', 'js': 'javascript', 'jsx': 'javascript',
        'py': 'python', 'java': 'java', 'html': 'html', 'css': 'css', 'json': 'json',
        'md': 'markdown', 'yaml': 'yaml', 'yml': 'yaml', 'go': 'go', 'rs': 'rust',
        'c': 'c', 'cpp': 'cpp', 'h': 'c', 'cs': 'csharp', 'rb': 'ruby', 'php': 'php',
        'sql': 'sql', 'sh': 'bash', 'vue': 'vue', 'svelte': 'svelte'
      };
      result.language = extMap[ext] || ext || '';
    }
    
    return result;
  })()`;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    return result.result?.value || null;
  } catch (err) {
    console.error('[Editor] Failed to capture:', err.message);
    return null;
  }
}

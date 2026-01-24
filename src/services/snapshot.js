/**
 * Snapshot capture service - captures DOM snapshots from Kiro via CDP
 */

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
    
    for (const sheet of targetDoc.styleSheets) {
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
      } catch (e) {}
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
    
    for (const sheet of targetDoc.styleSheets) {
      try {
        if (sheet.cssRules) {
          for (const rule of sheet.cssRules) css += rule.cssText + '\\n';
        }
      } catch (e) {}
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
        // Only check class names for history detection - NOT date patterns
        const isHistoryPanel = container.matches('[class*="history"], [class*="History"], [class*="session-list"], [class*="SessionList"]') ||
          container.closest('[class*="history"], [class*="History"], [class*="session-list"], [class*="SessionList"]');
        
        if (isHistoryPanel) {
          container.scrollTop = 0; // Scroll to TOP for history panels
        } else {
          container.scrollTop = container.scrollHeight; // Scroll to BOTTOM for chat messages
        }
      }
    }
    
    const clone = targetBody.cloneNode(true);
    
    // Remove tooltips, popovers, overlays from clone
    const elementsToRemove = [
      '[role="tooltip"]', '[data-tooltip]', '[class*="tooltip"]:not(button)', '[class*="Tooltip"]:not(button)',
      '[class*="popover"]:not(button)', '[class*="Popover"]:not(button)', '[class*="dropdown-menu"]',
      '[class*="dropdownMenu"]', '[class*="modal"]', '[class*="Modal"]',
      '[style*="position: fixed"]:not(button):not([class*="input"]):not([class*="chat"])'
    ];
    
    elementsToRemove.forEach(selector => {
      try {
        clone.querySelectorAll(selector).forEach(el => {
          const isTooltip = el.matches('[role="tooltip"], [class*="tooltip"], [class*="Tooltip"]');
          const isImportantUI = el.matches('[class*="model"], [class*="context"], [class*="input"], button, [role="button"]');
          if (isTooltip || !isImportantUI) el.remove();
        });
      } catch(e) {}
    });
    
    // Fix SVG currentColor
    clone.querySelectorAll('svg').forEach(svg => {
      try {
        const computedColor = '#cccccc';
        svg.querySelectorAll('[fill="currentColor"]').forEach(el => el.setAttribute('fill', computedColor));
        svg.querySelectorAll('[stroke="currentColor"]').forEach(el => el.setAttribute('stroke', computedColor));
      } catch(e) {}
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
    } catch(e) {}
    
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
      } catch(e) {}
    }
    
    // Try Monaco API
    try {
      const monacoEditors = targetDoc.querySelectorAll('.monaco-editor');
      for (const editorEl of monacoEditors) {
        const editorInstance = editorEl.__vscode_editor__ || editorEl._editor ||
          (window.monaco && window.monaco.editor.getEditors && window.monaco.editor.getEditors()[0]);
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
    } catch(e) {}
    
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
        'md': 'markdown', 'yaml': 'yaml', 'yml': 'yaml', 'go': 'go', 'rs': 'rust'
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

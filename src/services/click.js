/**
 * Click service - handles UI element clicks via CDP
 */

/**
 * Click an element in the Kiro UI via CDP
 * @param {CDPConnection} cdp - CDP connection
 * @param {object} clickInfo - Element identification info
 * @returns {Promise<{success: boolean, matchMethod?: string, error?: string}>}
 */
export async function clickElement(cdp, clickInfo) {
  const script = `(function() {
    let targetDoc = document;
    const activeFrame = document.getElementById('active-frame');
    if (activeFrame && activeFrame.contentDocument) targetDoc = activeFrame.contentDocument;
    
    const info = ${JSON.stringify(clickInfo)};
    let element = null;
    let matchMethod = '';
    const isTabClick = info.isTab || info.role === 'tab';
    const isCloseButton = info.isCloseButton || (info.ariaLabel && info.ariaLabel.toLowerCase() === 'close');
    const isToggle = info.isToggle || info.role === 'switch';
    
    // Handle send button
    if (info.isSendButton && !element) {
      const sendSelectors = ['button[data-variant="submit"]', 'svg.lucide-arrow-right', 'button[type="submit"]', 'button[aria-label*="send" i]'];
      for (const sel of sendSelectors) {
        try {
          const el = targetDoc.querySelector(sel);
          if (el) {
            element = el.closest('button') || el;
            if (element && !element.disabled) { matchMethod = 'send-button'; break; }
          }
        } catch(e) {}
      }
    }
    
    // Handle toggle/switch
    if (isToggle && !element) {
      if (info.toggleId) {
        element = targetDoc.getElementById(info.toggleId);
        if (element) matchMethod = 'toggle-id';
      }
      if (!element && info.text) {
        const toggles = targetDoc.querySelectorAll('.kiro-toggle-switch, [role="switch"]');
        for (const t of toggles) {
          const label = t.querySelector('label');
          if (label && label.textContent.trim().toLowerCase().includes(info.text.toLowerCase())) {
            element = t.querySelector('input') || t;
            matchMethod = 'toggle-label';
            break;
          }
        }
      }
    }
    
    // Handle close button
    if (isCloseButton && !element) {
      const closeButtons = targetDoc.querySelectorAll('[aria-label="close"], .kiro-tabs-item-close, [class*="close"]');
      if (info.parentTabLabel) {
        const searchLabel = info.parentTabLabel.trim().toLowerCase();
        for (const btn of closeButtons) {
          const parentTab = btn.closest('[role="tab"]');
          if (parentTab) {
            const labelEl = parentTab.querySelector('.kiro-tabs-item-label, [class*="label"]');
            const tabLabel = labelEl ? labelEl.textContent.trim().toLowerCase() : '';
            if (tabLabel.includes(searchLabel) || searchLabel.includes(tabLabel)) {
              element = btn;
              matchMethod = 'close-button-by-tab';
              break;
            }
          }
        }
      }
      if (!element && closeButtons.length > 0) {
        for (const btn of closeButtons) {
          const parentTab = btn.closest('[role="tab"]');
          if (parentTab && parentTab.getAttribute('aria-selected') === 'true') {
            element = btn;
            matchMethod = 'close-button-selected';
            break;
          }
        }
      }
    }
    
    // Handle tab click
    if (isTabClick && !element) {
      const allTabs = targetDoc.querySelectorAll('[role="tab"]');
      const searchText = (info.tabLabel || info.text || '').trim().toLowerCase();
      for (const tab of allTabs) {
        const labelEl = tab.querySelector('.kiro-tabs-item-label, [class*="label"]');
        const tabText = labelEl ? labelEl.textContent.trim().toLowerCase() : tab.textContent.trim().toLowerCase();
        if (searchText && (tabText.includes(searchText) || searchText.includes(tabText))) {
          element = tab;
          matchMethod = 'tab-label';
          break;
        }
      }
    }
    
    // Handle file link
    if (info.isFileLink && info.filePath && !element) {
      const fileName = info.filePath.split('/').pop().split('\\\\').pop();
      const fileSelectors = ['a[href*="' + fileName + '"]', '[data-path*="' + fileName + '"]', 'code', 'span', '[class*="file"]'];
      for (const selector of fileSelectors) {
        const candidates = targetDoc.querySelectorAll(selector);
        for (const el of candidates) {
          const text = (el.textContent || '').trim();
          if (text.includes(info.filePath) || text.includes(fileName)) {
            element = el;
            matchMethod = 'file-link';
            break;
          }
        }
        if (element) break;
      }
    }
    
    // Try by aria-label
    if (info.ariaLabel && !element && !isCloseButton) {
      try {
        const candidates = targetDoc.querySelectorAll('[aria-label="' + info.ariaLabel.replace(/"/g, '\\\\"') + '"]');
        for (const c of candidates) {
          const label = (c.getAttribute('aria-label') || '').toLowerCase();
          if (!label.includes('close')) { element = c; matchMethod = 'aria-label'; break; }
        }
      } catch(e) {}
    }
    
    // Handle history/session list items
    if (info.isHistoryItem && !element) {
      const searchText = (info.text || '').trim().toLowerCase();
      
      // Strategy 1: Find all items that look like history entries (contain dates)
      const datePattern = /\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\d{1,2}:\\d{2}:\\d{2}/;
      const allDivs = targetDoc.querySelectorAll('div, li, article');
      const historyItems = [];
      
      for (const item of allDivs) {
        if (item.children.length > 15) continue; // Skip large containers
        const text = item.textContent || '';
        if (datePattern.test(text) && text.length > 20 && text.length < 500) {
          historyItems.push(item);
        }
      }
      
      // Find the one matching our search text
      for (const item of historyItems) {
        const itemText = (item.textContent || '').trim().toLowerCase();
        if (searchText && (itemText.includes(searchText) || searchText.includes(itemText.substring(0, 50)))) {
          element = item;
          matchMethod = 'history-item-date';
          break;
        }
      }
      
      // Strategy 2: If not found by text, try standard selectors
      if (!element) {
        const historySelectors = [
          '[role="listitem"]',
          '[role="option"]',
          '[class*="history"] > *',
          '[class*="session"] > *',
          '[class*="conversation"] > *',
          '[class*="list-item"]'
        ];
        
        for (const selector of historySelectors) {
          try {
            const items = targetDoc.querySelectorAll(selector);
            for (const item of items) {
              const itemText = (item.textContent || '').trim().toLowerCase();
              if (searchText && (itemText.includes(searchText) || searchText.includes(itemText.substring(0, 50)))) {
                element = item;
                matchMethod = 'history-item-selector';
                break;
              }
            }
            if (element) break;
          } catch(e) {}
        }
      }
      
      // Strategy 3: Find ANY element with matching text that has cursor:pointer
      if (!element && searchText) {
        const allElements = targetDoc.querySelectorAll('*');
        for (const item of allElements) {
          if (item.children.length > 10) continue;
          const itemText = (item.textContent || '').trim().toLowerCase();
          const firstLine = itemText.split('\\n')[0];
          if (firstLine.includes(searchText) || searchText.includes(firstLine.substring(0, 30))) {
            const style = window.getComputedStyle(item);
            if (style.cursor === 'pointer') {
              element = item;
              matchMethod = 'history-item-pointer';
              break;
            }
          }
        }
      }
    }
    
    // Try by text content
    if (info.text && info.text.trim() && !element) {
      const searchText = info.text.trim();
      const allElements = targetDoc.querySelectorAll('button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="listitem"], a, [tabindex="0"], [class*="cursor-pointer"]');
      for (const el of allElements) {
        if (!isCloseButton) {
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
          if (ariaLabel.includes('close')) continue;
        }
        const elText = (el.textContent || '').trim();
        if (elText === searchText || elText.includes(searchText) || (elText.length >= 10 && searchText.includes(elText))) {
          element = el;
          matchMethod = 'text-content';
          break;
        }
      }
    }
    
    if (!element) return { found: false, error: 'Element not found' };
    
    // For history items, click the item itself - NOT child buttons (which might be delete buttons!)
    let clickTarget = element;
    
    // DO NOT click child buttons for history items - they are likely delete/close buttons
    // Just click the main item element directly
    
    try {
      // Try standard click first
      clickTarget.click();
      return { found: true, clicked: true, matchMethod };
    } catch (e) {
      try {
        // Try full mouse event sequence
        const rect = clickTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const mouseOpts = { 
          bubbles: true, 
          cancelable: true, 
          view: window,
          clientX: centerX,
          clientY: centerY
        };
        
        clickTarget.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
        clickTarget.dispatchEvent(new MouseEvent('click', mouseOpts));
        
        return { found: true, clicked: true, matchMethod: matchMethod + '-dispatch' };
      } catch (e2) {
        return { found: true, clicked: false, error: 'Click failed: ' + e2.message };
      }
    }
  })()`;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    
    const elementInfo = result.result?.value;
    if (!elementInfo?.found) {
      console.log('[Click] Element not found:', clickInfo.ariaLabel || clickInfo.text);
      return { success: false, error: 'Element not found' };
    }
    
    if (elementInfo.clicked) {
      console.log('[Click] Clicked via', elementInfo.matchMethod);
      return { success: true, matchMethod: elementInfo.matchMethod };
    }
    return { success: false, error: elementInfo.error || 'Click failed' };
  } catch (err) {
    console.error('[Click] CDP error:', err.message);
    return { success: false, error: err.message };
  }
}

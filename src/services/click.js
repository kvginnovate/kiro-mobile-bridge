/**
 * Click service - handles UI element clicks via CDP
 */
import { MODEL_NAMES } from '../utils/constants.js';

/**
 * Build the click script for CDP evaluation
 * This is separated for maintainability and testing
 * @param {object} clickInfo - Element identification info (already sanitized)
 * @returns {string} - JavaScript expression
 */
function buildClickScript(clickInfo) {
  // Escape the clickInfo for safe inclusion in the script
  const safeClickInfo = JSON.stringify(clickInfo);
  const modelNamesJson = JSON.stringify(MODEL_NAMES);
  
  return `(function() {
    let targetDoc = document;
    const activeFrame = document.getElementById('active-frame');
    if (activeFrame && activeFrame.contentDocument) targetDoc = activeFrame.contentDocument;
    
    const info = ${safeClickInfo};
    const modelNames = ${modelNamesJson};
    let element = null;
    let matchMethod = '';
    
    // Helper functions
    const isVisible = (el) => el && el.offsetParent !== null;
    const findModelName = (text) => {
      const lowerText = text.toLowerCase();
      for (const m of modelNames) {
        if (lowerText.includes(m)) return m;
      }
      return null;
    };
    
    // Determine element type
    const isTabClick = info.isTab || info.role === 'tab';
    const isCloseButton = info.isCloseButton || (info.ariaLabel && info.ariaLabel.toLowerCase() === 'close');
    const isToggle = info.isToggle || info.role === 'switch';
    const isModelSelector = info.isModelSelector;
    const isModelOption = info.isModelOption;
    
    // =========================================================================
    // Model Selector Button Click
    // =========================================================================
    if (isModelSelector && !element) {
      // Strategy 1: Find Kiro's specific dropdown trigger
      const kiroDropdownTrigger = targetDoc.querySelector('button.kiro-dropdown-trigger[aria-haspopup="true"]');
      if (kiroDropdownTrigger && isVisible(kiroDropdownTrigger)) {
        const triggerText = (kiroDropdownTrigger.textContent || '').toLowerCase();
        if (modelNames.some(m => triggerText.includes(m))) {
          element = kiroDropdownTrigger;
          matchMethod = 'kiro-dropdown-trigger';
        }
      }
      
      // Strategy 2: Find by aria-haspopup with model text
      if (!element) {
        const hasPopupButtons = targetDoc.querySelectorAll('button[aria-haspopup="true"], button[aria-haspopup="listbox"], button[aria-haspopup="menu"]');
        for (const btn of hasPopupButtons) {
          if (!isVisible(btn)) continue;
          const btnText = (btn.textContent || '').toLowerCase();
          if (modelNames.some(m => btnText.includes(m))) {
            element = btn;
            matchMethod = 'aria-haspopup-model';
            break;
          }
        }
      }
      
      // Strategy 3: Find by class patterns
      if (!element) {
        const modelSelectors = [
          '.kiro-dropdown-trigger',
          '[class*="model-selector"]', '[class*="modelSelector"]',
          '[class*="model-dropdown"]', '[class*="modelDropdown"]',
          'button[class*="dropdown-trigger"]'
        ];
        
        for (const sel of modelSelectors) {
          try {
            const candidates = targetDoc.querySelectorAll(sel);
            for (const c of candidates) {
              if (isVisible(c)) {
                element = c;
                matchMethod = 'model-selector-class';
                break;
              }
            }
            if (element) break;
          } catch(e) {}
        }
      }
    }
    
    // =========================================================================
    // Model Option Selection (from dropdown menu)
    // =========================================================================
    if (isModelOption && !element) {
      const searchText = (info.text || '').trim().toLowerCase();
      const searchModelName = findModelName(searchText);
      
      // Check if dropdown is currently open
      const openDropdown = targetDoc.querySelector('.kiro-dropdown-menu, [class*="dropdown-menu"][class*="open"], [role="listbox"], [role="menu"]');
      const isDropdownOpen = openDropdown && isVisible(openDropdown);
      
      // If dropdown is NOT open, we need to open it first
      if (!isDropdownOpen) {
        const dropdownTrigger = targetDoc.querySelector('.kiro-dropdown-trigger[aria-haspopup="true"], button[aria-haspopup="true"], button[aria-haspopup="listbox"]');
        if (dropdownTrigger && isVisible(dropdownTrigger)) {
          const triggerText = (dropdownTrigger.textContent || '').toLowerCase();
          if (modelNames.some(m => triggerText.includes(m))) {
            dropdownTrigger.click();
            return { found: true, clicked: true, needsRetry: true, matchMethod: 'dropdown-opened-for-option' };
          }
        }
      }
      
      // Strategy 1: Find Kiro's specific dropdown items
      const kiroDropdownItems = targetDoc.querySelectorAll('.kiro-dropdown-item, .kiro-dropdown-menu > div');
      for (const item of kiroDropdownItems) {
        if (!isVisible(item)) continue;
        const itemText = (item.textContent || '').trim().toLowerCase();
        const itemModelName = findModelName(itemText);
        
        if (searchModelName && itemModelName && searchModelName === itemModelName) {
          const searchVersion = searchText.match(/\\d+\\.?\\d*/)?.[0];
          const itemVersion = itemText.match(/\\d+\\.?\\d*/)?.[0];
          
          if (!searchVersion || !itemVersion || searchVersion === itemVersion) {
            element = item;
            matchMethod = 'kiro-dropdown-item';
            break;
          }
        }
      }
      
      // Strategy 2: Find by role selectors
      if (!element) {
        const optionSelectors = ['[role="option"]', '[role="menuitem"]', '[class*="dropdown-item"]', '[class*="menu-item"]'];
        
        for (const sel of optionSelectors) {
          try {
            const options = targetDoc.querySelectorAll(sel);
            for (const opt of options) {
              if (!isVisible(opt)) continue;
              const optText = (opt.textContent || '').trim().toLowerCase();
              if (searchText && (optText.includes(searchText) || searchText.includes(optText.substring(0, 20)))) {
                element = opt;
                matchMethod = 'model-option-role';
                break;
              }
            }
            if (element) break;
          } catch(e) {}
        }
      }
      
      // Strategy 3: Find any clickable element in dropdown with matching model name
      if (!element && searchText && searchModelName) {
        const dropdownMenu = targetDoc.querySelector('.kiro-dropdown-menu, [class*="dropdown-menu"], [role="listbox"], [role="menu"]');
        if (dropdownMenu) {
          const allItems = dropdownMenu.querySelectorAll('*');
          for (const item of allItems) {
            if (item.children.length > 5) continue;
            if (!isVisible(item)) continue;
            const itemText = (item.textContent || '').trim().toLowerCase();
            const itemModelName = findModelName(itemText);
            
            if (itemModelName && searchModelName === itemModelName) {
              element = item;
              matchMethod = 'dropdown-menu-item';
              break;
            }
          }
        }
      }
    }
    
    // =========================================================================
    // Send Button
    // =========================================================================
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
    
    // =========================================================================
    // Toggle/Switch
    // =========================================================================
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
    
    // =========================================================================
    // Notification Banner Buttons
    // =========================================================================
    if (info.isNotificationButton && !element) {
      const searchText = (info.text || '').trim().toLowerCase();
      const searchAriaLabel = (info.ariaLabel || '').trim().toLowerCase();
      
      const snackbarButtons = targetDoc.querySelectorAll('.kiro-snackbar button, .kiro-snackbar-actions button, .kiro-snackbar-header button');
      
      // Strategy 1: Find by text
      for (const btn of snackbarButtons) {
        if (!isVisible(btn)) continue;
        const btnText = (btn.textContent || '').trim().toLowerCase();
        if (searchText && btnText && (btnText.includes(searchText) || searchText.includes(btnText))) {
          element = btn;
          matchMethod = 'snackbar-button-text';
          break;
        }
      }
      
      // Strategy 2: Find X/close/dismiss icon button
      if (!element && (searchText === 'close' || searchText === 'dismiss' || searchText === 'x' || 
                       searchText === 'icon-button' || searchText === '' || !searchText ||
                       searchAriaLabel.includes('close') || searchAriaLabel.includes('dismiss'))) {
        for (const btn of snackbarButtons) {
          if (!isVisible(btn)) continue;
          const btnAriaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          const isExpandBtn = btnAriaLabel.includes('expand') || btn.classList.contains('kiro-snackbar-expand');
          
          if (isExpandBtn) continue;
          
          if (btnAriaLabel.includes('close') || btnAriaLabel.includes('dismiss') ||
              btn.querySelector('.codicon-close, .codicon-x, [class*="close"]')) {
            element = btn;
            matchMethod = 'snackbar-dismiss-button';
            break;
          }
          
          const isIconBtn = btn.classList.contains('kiro-icon-button');
          const btnText = (btn.textContent || '').trim();
          if (isIconBtn && !btnText && !isExpandBtn) {
            element = btn;
            matchMethod = 'snackbar-icon-dismiss';
            break;
          }
        }
      }
      
      // Strategy 3: Find by aria-label
      if (!element && searchAriaLabel && !searchAriaLabel.includes('expand')) {
        for (const btn of snackbarButtons) {
          if (!isVisible(btn)) continue;
          const btnAriaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (btnAriaLabel.includes('expand')) continue;
          if (btnAriaLabel && (btnAriaLabel.includes(searchAriaLabel) || searchAriaLabel.includes(btnAriaLabel))) {
            element = btn;
            matchMethod = 'snackbar-button-aria';
            break;
          }
        }
      }
      
      // Strategy 4: Find in agent-outcome notifications
      if (!element) {
        const outcomeButtons = targetDoc.querySelectorAll('.agent-outcome button, .agent-outcome-notification button, [class*="outcome"] button');
        for (const btn of outcomeButtons) {
          if (!isVisible(btn)) continue;
          const btnText = (btn.textContent || '').trim().toLowerCase();
          if (searchText && (btnText.includes(searchText) || searchText.includes(btnText))) {
            element = btn;
            matchMethod = 'outcome-button';
            break;
          }
        }
      }
      
      // Strategy 5: Find expand/collapse arrow (only if explicitly requested)
      if (!element && (searchText.includes('expand') || searchAriaLabel.includes('expand'))) {
        const expandArrow = targetDoc.querySelector('.kiro-snackbar [class*="expand"], .kiro-snackbar [class*="arrow"], .kiro-snackbar [class*="chevron"], .kiro-snackbar button[aria-label*="expand" i]');
        if (expandArrow && isVisible(expandArrow)) {
          element = expandArrow;
          matchMethod = 'snackbar-expand';
        }
      }
    }
    
    // =========================================================================
    // Close Button
    // =========================================================================
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
    
    // =========================================================================
    // Tab Click
    // =========================================================================
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
    
    // =========================================================================
    // File Link
    // =========================================================================
    if (info.isFileLink && info.filePath && !element) {
      const fileName = info.filePath.split('/').pop().split('\\\\').pop();
      const fileSelectors = ['a[href*="' + fileName + '"]', '[data-path*="' + fileName + '"]', 'code', 'span', '[class*="file"]'];
      for (const selector of fileSelectors) {
        try {
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
        } catch(e) {}
      }
    }
    
    // =========================================================================
    // Aria Label Match
    // =========================================================================
    if (info.ariaLabel && !element && !isCloseButton) {
      try {
        const escapedLabel = info.ariaLabel.replace(/"/g, '\\\\"');
        const candidates = targetDoc.querySelectorAll('[aria-label="' + escapedLabel + '"]');
        for (const c of candidates) {
          const label = (c.getAttribute('aria-label') || '').toLowerCase();
          if (!label.includes('close')) { element = c; matchMethod = 'aria-label'; break; }
        }
      } catch(e) {}
    }
    
    // =========================================================================
    // History/Session List Items
    // =========================================================================
    if (info.isHistoryItem && !element) {
      const searchText = (info.text || '').trim().toLowerCase();
      const datePattern = /\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\d{1,2}:\\d{2}:\\d{2}/;
      const allDivs = targetDoc.querySelectorAll('div, li, article');
      const historyItems = [];
      
      for (const item of allDivs) {
        if (item.children.length > 15) continue;
        const text = item.textContent || '';
        if (datePattern.test(text) && text.length > 20 && text.length < 500) {
          historyItems.push(item);
        }
      }
      
      for (const item of historyItems) {
        const itemText = (item.textContent || '').trim().toLowerCase();
        if (searchText && (itemText.includes(searchText) || searchText.includes(itemText.substring(0, 50)))) {
          element = item;
          matchMethod = 'history-item-date';
          break;
        }
      }
      
      if (!element) {
        const historySelectors = ['[role="listitem"]', '[role="option"]', '[class*="history"] > *', '[class*="session"] > *'];
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
    }
    
    // =========================================================================
    // Text Content Match (fallback)
    // =========================================================================
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
    
    // =========================================================================
    // Execute Click
    // =========================================================================
    if (!element) return { found: false, error: 'Element not found' };
    
    const elementInfo = {
      tag: element.tagName,
      className: element.className?.substring?.(0, 100) || '',
      role: element.getAttribute('role'),
      ariaHaspopup: element.getAttribute('aria-haspopup'),
      ariaExpanded: element.getAttribute('aria-expanded'),
      dataState: element.getAttribute('data-state'),
      textContent: (element.textContent || '').substring(0, 50)
    };
    
    try {
      element.click();
      return { found: true, clicked: true, matchMethod, elementInfo };
    } catch (e) {
      try {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const mouseOpts = { 
          bubbles: true, 
          cancelable: true, 
          view: window,
          clientX: centerX,
          clientY: centerY
        };
        
        element.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
        element.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
        element.dispatchEvent(new MouseEvent('click', mouseOpts));
        
        return { found: true, clicked: true, matchMethod: matchMethod + '-dispatch', elementInfo };
      } catch (e2) {
        return { found: true, clicked: false, error: 'Click failed: ' + e2.message };
      }
    }
  })()`;
}

/**
 * Click an element in the Kiro UI via CDP
 * @param {CDPConnection} cdp - CDP connection
 * @param {object} clickInfo - Element identification info (should be sanitized)
 * @returns {Promise<{success: boolean, matchMethod?: string, error?: string}>}
 */
export async function clickElement(cdp, clickInfo) {
  const script = buildClickScript(clickInfo);
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    
    const elementInfo = result.result?.value;
    
    if (!elementInfo?.found) {
      console.log('[Click] Element not found:', clickInfo.ariaLabel || clickInfo.text || 'unknown');
      return { success: false, error: 'Element not found' };
    }
    
    if (elementInfo.clicked) {
      return { 
        success: true, 
        matchMethod: elementInfo.matchMethod,
        needsRetry: elementInfo.needsRetry 
      };
    }
    return { success: false, error: elementInfo.error || 'Click failed' };
  } catch (err) {
    console.error('[Click] CDP error:', err.message);
    return { success: false, error: err.message };
  }
}

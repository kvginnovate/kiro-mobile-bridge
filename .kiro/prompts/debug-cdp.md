---
description: Debug CDP connection and DOM capture issues
---

# Debug CDP Issues

## Context
This project uses Chrome DevTools Protocol (CDP) to capture DOM snapshots from Kiro IDE webviews. Common issues include:
- Execution context ID mismatches
- Nested iframe access (VS Code webview pattern)
- xterm.js canvas rendering (terminal capture)
- Element selectors not finding content

## Diagnostic Steps

### 1. Check CDP Connection Status
```bash
# Test if Kiro is running with CDP enabled
curl -s http://127.0.0.1:9000/json/list | jq '.[].title'
```

### 2. Analyze Current Issue
Describe the symptom you're seeing:
- No content captured?
- Wrong content captured?
- Stale/outdated content?
- Connection errors?

### 3. Debug Approach

**For "No content" issues:**
1. Check if `rootContextId` is set (context may have been destroyed)
2. Verify the target document - VS Code uses nested `#active-frame` iframe
3. Test selectors in browser DevTools first

**For "Wrong content" issues:**
1. Log the `debug` object returned by capture functions
2. Check which selector matched via `debug.foundElement`
3. Verify you're targeting the correct CDP target (webview vs main window)

**For "Stale content" issues:**
1. Check hash comparison logic in `pollSnapshots()`
2. Verify WebSocket broadcast is triggering
3. Check client-side debounce timer

### 4. Key Code Patterns

**Safe CDP evaluation (IIFE pattern):**
```javascript
const script = `
  (function() {
    // Always wrap in IIFE for null safety
    const el = document.querySelector('.target');
    if (!el) return { error: 'not found' };
    return { html: el.outerHTML };
  })()
`;
```

**Nested iframe access:**
```javascript
let targetDoc = document;
const activeFrame = document.getElementById('active-frame');
if (activeFrame && activeFrame.contentDocument) {
  targetDoc = activeFrame.contentDocument;
}
```

**Clone before modify (prevents Kiro crashes):**
```javascript
const clone = element.cloneNode(true);
// Modify clone, never the original
clone.querySelectorAll('[role="tooltip"]').forEach(el => el.remove());
```

## Output
After debugging, document:
1. Root cause identified
2. Fix applied or proposed
3. Test to verify fix

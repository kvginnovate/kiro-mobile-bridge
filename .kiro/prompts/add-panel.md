---
description: Add new panel capture (sidebar, editor patterns)
---

# Add Panel Capture

## Context
Kiro Mobile Bridge captures multiple panels from Kiro IDE via CDP:
- **Chat**: Kiro Agent webview (works well)
- **Sidebar**: File explorer (partial)
- **Editor**: Monaco editor (uses view-lines, limited by virtual scrolling)

## Panel: $ARGUMENTS

## Implementation Pattern

### 1. Create Capture Function
Follow the existing pattern in `server.js`:

```javascript
async function captureNewPanel(cdp) {
  if (!cdp.rootContextId) return null;
  
  const script = `
    (function() {
      let targetDoc = document;
      const activeFrame = document.getElementById('active-frame');
      if (activeFrame && activeFrame.contentDocument) {
        targetDoc = activeFrame.contentDocument;
      }
      
      // Panel-specific selectors
      const selectors = [/* ... */];
      
      // Find and extract content
      // ...
      
      return { html, hasContent: true };
    })()
  `;
  
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: script,
      contextId: cdp.rootContextId,
      returnByValue: true
    });
    return result.result?.value || null;
  } catch (err) {
    console.error('[NewPanel] Failed:', err.message);
    return null;
  }
}
```

### 2. Add to Poll Loop
In `pollSnapshots()`, add hash-based change detection:

```javascript
const newPanel = await captureNewPanel(cdp);
if (newPanel && newPanel.hasContent) {
  const hash = computeHash(newPanel.html);
  if (hash !== cascade.newPanelHash) {
    cascade.newPanel = newPanel;
    cascade.newPanelHash = hash;
    broadcastSnapshotUpdate(cascadeId, 'newpanel');
  }
}
```

### 3. Add REST Endpoint
```javascript
app.get('/newpanel/:id', (req, res) => {
  const cascade = cascades.get(req.params.id);
  if (!cascade?.newPanel?.hasContent) {
    return res.status(404).json({ error: 'No content' });
  }
  res.json(cascade.newPanel);
});
```

### 4. Add Client Tab
In `public/index.html`:
- Add nav tab with appropriate icon
- Add panel container
- Add fetch function
- Handle WebSocket updates for new panel type

## Known Challenges

**Monaco (Editor):**
- Virtual scrolling - only visible lines in DOM
- Use `/readFile` endpoint to read directly from filesystem
- Line numbers from `.margin-view-overlays`

**VS Code Panels:**
- Main window vs webview have different CDP targets
- Use `mainWindowCDP` for sidebar/editor
- Use cascade's `cdp` for chat (Kiro Agent webview)

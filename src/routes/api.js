/**
 * API Routes - REST endpoints for mobile client
 */
import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { injectMessage } from '../services/message.js';
import { clickElement } from '../services/click.js';

/**
 * Create API router
 * @param {Map} cascades - Cascade connections map
 * @param {object} mainWindowCDP - Main window CDP connection
 * @returns {Router} - Express router
 */
export function createApiRouter(cascades, mainWindowCDP) {
  const router = Router();
  
  // GET /snapshot/:id - Get HTML snapshot for a cascade
  router.get('/snapshot/:id', (req, res) => {
    const cascade = cascades.get(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    if (!cascade.snapshot) return res.status(404).json({ error: 'No snapshot available' });
    res.json(cascade.snapshot);
  });
  
  // GET /styles/:id - Get CSS for a cascade
  router.get('/styles/:id', (req, res) => {
    const cascade = cascades.get(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    if (!cascade.css) return res.status(404).json({ error: 'No styles available' });
    res.type('text/css').send(cascade.css);
  });
  
  // GET /editor/:id - Get editor snapshot
  router.get('/editor/:id', (req, res) => {
    const cascade = cascades.get(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    if (!cascade.editor?.hasContent) return res.status(404).json({ error: 'No editor content available' });
    res.json(cascade.editor);
  });
  
  // POST /send/:id - Send message to chat
  router.post('/send/:id', async (req, res) => {
    const cascade = cascades.get(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!cascade.cdp) return res.status(503).json({ error: 'CDP connection not available' });
    
    console.log(`[Send] Message to ${req.params.id}: ${message.substring(0, 50)}...`);
    const result = await injectMessage(cascade.cdp, message);
    
    if (result.success) {
      res.json({ success: true, method: result.method });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  });
  
  // POST /click/:id - Click UI element
  router.post('/click/:id', async (req, res) => {
    const cascade = cascades.get(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    if (!cascade.cdp?.rootContextId) return res.status(503).json({ error: 'CDP not available' });
    
    const clickInfo = req.body;
    console.log(`[Click] ${clickInfo.text?.substring(0, 30) || clickInfo.ariaLabel || clickInfo.tag}`);
    
    try {
      const result = await clickElement(cascade.cdp, clickInfo);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  // POST /readFile/:id - Read file from filesystem
  router.post('/readFile/:id', async (req, res) => {
    const cascade = cascades.get(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });
    
    console.log(`[ReadFile] ${filePath}`);
    
    try {
      const fileName = path.basename(filePath);
      const possiblePaths = [
        filePath,
        path.join(process.cwd(), filePath),
        path.join(process.cwd(), 'src', filePath),
        path.join(process.cwd(), 'public', filePath)
      ];
      
      // Add workspace-relative paths
      if (!path.isAbsolute(filePath)) {
        const workspaceRoot = await getWorkspaceRoot(mainWindowCDP);
        if (workspaceRoot) {
          possiblePaths.unshift(path.join(workspaceRoot, filePath));
        }
      }
      
      let content = null;
      let foundPath = null;
      
      for (const tryPath of possiblePaths) {
        try {
          content = await fs.readFile(tryPath, 'utf-8');
          foundPath = tryPath;
          break;
        } catch (e) {}
      }
      
      // Recursive search fallback
      if (!content) {
        foundPath = await findFileRecursive(process.cwd(), fileName);
        if (foundPath) content = await fs.readFile(foundPath, 'utf-8');
      }
      
      if (!content) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const extMap = {
        'ts': 'typescript', 'tsx': 'typescript', 'js': 'javascript', 'jsx': 'javascript',
        'py': 'python', 'html': 'html', 'css': 'css', 'json': 'json', 'md': 'markdown'
      };
      
      res.json({
        content,
        fileName: path.basename(filePath),
        fullPath: foundPath,
        language: extMap[ext] || ext,
        lineCount: content.split('\n').length,
        hasContent: true
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // GET /files/:id - List workspace files
  router.get('/files/:id', async (req, res) => {
    const cascade = cascades.get(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    
    try {
      const workspaceRoot = await getWorkspaceRoot(mainWindowCDP) || process.cwd();
      const files = await collectWorkspaceFiles(workspaceRoot);
      
      console.log(`[Files] Found ${files.length} files in ${workspaceRoot}`);
      res.json({ files, workspaceRoot });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // GET /tasks/:id - List task files from .kiro/specs
  router.get('/tasks/:id', async (req, res) => {
    const cascade = cascades.get(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    
    try {
      const workspaceRoot = await getWorkspaceRoot(mainWindowCDP) || process.cwd();
      const kiroSpecsPath = path.join(workspaceRoot, '.kiro', 'specs');
      
      try {
        await fs.access(kiroSpecsPath);
      } catch (e) {
        return res.json({ tasks: [], workspaceRoot });
      }
      
      const tasks = [];
      const specDirs = await fs.readdir(kiroSpecsPath, { withFileTypes: true });
      
      for (const dir of specDirs) {
        if (!dir.isDirectory()) continue;
        const tasksFilePath = path.join(kiroSpecsPath, dir.name, 'tasks.md');
        try {
          const content = await fs.readFile(tasksFilePath, 'utf-8');
          tasks.push({ name: dir.name, path: `.kiro/specs/${dir.name}/tasks.md`, content });
        } catch (e) {}
      }
      
      tasks.sort((a, b) => a.name.localeCompare(b.name));
      console.log(`[Tasks] Found ${tasks.length} task files`);
      res.json({ tasks, workspaceRoot });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // POST /open-spec/:id - Open spec in Kiro
  router.post('/open-spec/:id', async (req, res) => {
    const cascade = cascades.get(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    
    const { specName } = req.body;
    if (!specName) return res.status(400).json({ error: 'specName is required' });
    
    const cdp = cascade.cdp;
    if (!cdp?.rootContextId) return res.status(503).json({ error: 'CDP not connected' });
    
    console.log(`[OpenSpec] Opening ${specName}`);
    
    // Try to click on spec in sidebar
    const script = `(function() {
      let targetDoc = document;
      const activeFrame = document.getElementById('active-frame');
      if (activeFrame && activeFrame.contentDocument) targetDoc = activeFrame.contentDocument;
      
      const specName = '${specName.replace(/'/g, "\\'")}';
      const allElements = targetDoc.querySelectorAll('*');
      
      for (const el of allElements) {
        const text = (el.textContent || '').trim();
        if (text === specName || text.includes(specName)) {
          if (el.offsetParent !== null && el.textContent.length < 100) {
            el.click();
            return { success: true, method: 'click-spec-name' };
          }
        }
      }
      return { success: false, error: 'Spec not found in UI' };
    })()`;
    
    try {
      const result = await cdp.call('Runtime.evaluate', {
        expression: script,
        contextId: cdp.rootContextId,
        returnByValue: true
      });
      res.json(result.result?.value || { success: false });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  return router;
}

// Helper: Get workspace root from VS Code window title
async function getWorkspaceRoot(mainWindowCDP) {
  if (!mainWindowCDP.connection?.rootContextId) return null;
  
  try {
    const result = await mainWindowCDP.connection.call('Runtime.evaluate', {
      expression: 'document.title',
      contextId: mainWindowCDP.connection.rootContextId,
      returnByValue: true
    });
    
    const title = result.result?.value || '';
    const parts = title.split(' - ');
    if (parts.length >= 2) {
      const folderName = parts[parts.length - 2].trim();
      const possibleRoots = [
        process.cwd(),
        path.join(process.env.HOME || process.env.USERPROFILE || '', folderName),
        path.join(process.env.HOME || process.env.USERPROFILE || '', 'projects', folderName),
        path.join(process.env.HOME || process.env.USERPROFILE || '', 'dev', folderName),
        path.join('C:', 'gab', folderName),
        path.join('C:', 'dev', folderName)
      ];
      
      for (const root of possibleRoots) {
        try {
          const stat = await fs.stat(root);
          if (stat.isDirectory()) {
            const hasKiro = await fs.access(path.join(root, '.kiro')).then(() => true).catch(() => false);
            const hasPackage = await fs.access(path.join(root, 'package.json')).then(() => true).catch(() => false);
            if (hasKiro || hasPackage) return root;
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
  return null;
}

// Helper: Find file recursively
async function findFileRecursive(dir, fileName, maxDepth = 4, depth = 0) {
  if (depth > maxDepth) return null;
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name === fileName) {
        return path.join(dir, entry.name);
      }
    }
    
    for (const entry of entries) {
      if (entry.isDirectory() && 
          (!entry.name.startsWith('.') || entry.name === '.kiro') &&
          entry.name !== 'node_modules' && entry.name !== 'dist') {
        const found = await findFileRecursive(path.join(dir, entry.name), fileName, maxDepth, depth + 1);
        if (found) return found;
      }
    }
  } catch (e) {}
  return null;
}

// Helper: Collect workspace files
async function collectWorkspaceFiles(workspaceRoot) {
  const codeExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs',
    '.html', '.css', '.scss', '.json', '.yaml', '.yml', '.md',
    '.sql', '.sh', '.c', '.cpp', '.h', '.cs', '.vue', '.svelte'
  ]);
  
  const extToLang = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.py': 'python', '.html': 'html', '.css': 'css', '.json': 'json', '.md': 'markdown'
  };
  
  const files = [];
  
  async function collect(dir, relativePath = '', depth = 0) {
    if (depth > 5) return;
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if ((entry.name.startsWith('.') && entry.name !== '.kiro' && entry.name !== '.github') ||
            entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
          continue;
        }
        
        const entryPath = path.join(dir, entry.name);
        const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (codeExtensions.has(ext)) {
            files.push({ name: entry.name, path: entryRelative, language: extToLang[ext] || ext.slice(1) });
          }
        } else if (entry.isDirectory()) {
          await collect(entryPath, entryRelative, depth + 1);
        }
      }
    } catch (e) {}
  }
  
  await collect(workspaceRoot);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

// Module-level singleton state
let webcontainerInstance = null;
let bootPromise = null;
let isInitialized = false;
let currentPreviewUrl = null;
let serverReadyCallbacks = [];

async function getWebContainerInstance() {
  if (webcontainerInstance) {
    return webcontainerInstance;
  }
  if (bootPromise) {
    return bootPromise;
  }
  bootPromise = WebContainer.boot();
  webcontainerInstance = await bootPromise;
  return webcontainerInstance;
}

function onServerReady(callback) {
  if (currentPreviewUrl) {
    callback(currentPreviewUrl);
  }
  serverReadyCallbacks.push(callback);
}

function notifyServerReady(url) {
  currentPreviewUrl = url;
  serverReadyCallbacks.forEach(cb => cb(url));
}

// Base Next.js template files
const getBaseFiles = (componentCode) => ({
  'package.json': {
    file: {
      contents: JSON.stringify({
        name: 'preview-app',
        version: '1.0.0',
        private: true,
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start'
        },
        dependencies: {
          next: '^14.0.0',
          react: '^18.2.0',
          'react-dom': '^18.2.0'
        }
      }, null, 2)
    }
  },
  'next.config.js': {
    file: {
      contents: `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}
module.exports = nextConfig`
    }
  },
  'app': {
    directory: {
      'layout.jsx': {
        file: {
          contents: `export const metadata = {
  title: 'Preview',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  )
}`
        }
      },
      'page.jsx': {
        file: {
          contents: componentCode || `export default function Home() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Preview Ready</h1>
      <p>Submit a request to generate a component</p>
    </div>
  )
}`
        }
      },
      'globals.css': {
        file: {
          contents: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; }`
        }
      }
    }
  }
});

// Extract React component code from markdown/text
function extractComponentCode(text) {
  if (!text) return null;

  // Look for code blocks with jsx/tsx/javascript/react
  const codeBlockRegex = /```(?:jsx?|tsx?|javascript|react)?\s*\n([\s\S]*?)```/gi;
  const matches = [...text.matchAll(codeBlockRegex)];

  if (matches.length > 0) {
    // Find the largest code block (likely the main component)
    let largestBlock = matches[0][1];
    for (const match of matches) {
      if (match[1].length > largestBlock.length) {
        largestBlock = match[1];
      }
    }
    return largestBlock.trim();
  }

  // If no code blocks, check if the text itself looks like React code
  if (text.includes('export default') || text.includes('function') && text.includes('return')) {
    return text;
  }

  return null;
}

// Convert component code to a valid page component
function wrapAsPageComponent(code) {
  if (!code) return null;

  // If it already has export default, use as is
  if (code.includes('export default')) {
    return code;
  }

  // Try to find the component name
  const funcMatch = code.match(/function\s+(\w+)/);
  const constMatch = code.match(/const\s+(\w+)\s*=/);
  const componentName = funcMatch?.[1] || constMatch?.[1] || 'Component';

  // Wrap in export default
  return `${code}\n\nexport default ${componentName};`;
}

export default function WebContainerPreview({ generatedCode, onStatusChange }) {
  const [status, setStatus] = useState(isInitialized ? 'ready' : 'idle');
  const [previewUrl, setPreviewUrl] = useState(currentPreviewUrl || '');
  const [error, setError] = useState(null);
  const terminalRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const fitAddonRef = useRef(null);

  const updateStatus = useCallback((newStatus, errorMsg = null) => {
    setStatus(newStatus);
    setError(errorMsg);
    onStatusChange?.(newStatus, errorMsg);
  }, [onStatusChange]);

  // Initialize terminal
  useEffect(() => {
    if (!terminalContainerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      convertEol: true,
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#eee',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalContainerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    if (isInitialized) {
      terminal.writeln('WebContainer already running.');
      if (currentPreviewUrl) {
        terminal.writeln(`Server running at ${currentPreviewUrl}`);
      }
    }

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

  // Subscribe to server ready events
  useEffect(() => {
    const handleServerReady = (url) => {
      setPreviewUrl(url);
      updateStatus('ready');
    };

    onServerReady(handleServerReady);

    return () => {
      const index = serverReadyCallbacks.indexOf(handleServerReady);
      if (index > -1) {
        serverReadyCallbacks.splice(index, 1);
      }
    };
  }, [updateStatus]);

  // Boot and initialize WebContainer (only once globally)
  useEffect(() => {
    if (isInitialized) return;

    async function initializeContainer() {
      try {
        updateStatus('booting');
        terminalRef.current?.writeln('Booting WebContainer...');

        const instance = await getWebContainerInstance();
        terminalRef.current?.writeln('WebContainer ready!');

        // Listen for server ready
        instance.on('server-ready', (port, url) => {
          terminalRef.current?.writeln(`Server ready at ${url}`);
          notifyServerReady(url);
        });

        // Mount initial files
        updateStatus('installing');
        terminalRef.current?.writeln('\nMounting files...');

        const files = getBaseFiles(null);
        await instance.mount(files);

        terminalRef.current?.writeln('Installing dependencies...');

        // Install dependencies
        const installProcess = await instance.spawn('npm', ['install']);

        installProcess.output.pipeTo(new WritableStream({
          write(data) {
            terminalRef.current?.write(data);
          }
        }));

        const installExitCode = await installProcess.exit;

        if (installExitCode !== 0) {
          throw new Error(`npm install failed with code ${installExitCode}`);
        }

        terminalRef.current?.writeln('\nStarting dev server...');
        updateStatus('starting');

        // Start dev server
        const devProcess = await instance.spawn('npm', ['run', 'dev']);

        devProcess.output.pipeTo(new WritableStream({
          write(data) {
            terminalRef.current?.write(data);
          }
        }));

        isInitialized = true;
      } catch (err) {
        console.error('Init error:', err);
        updateStatus('error', err.message);
        terminalRef.current?.writeln(`\nError: ${err.message}`);
      }
    }

    initializeContainer();
  }, [updateStatus]);

  // Update files when generated code changes
  useEffect(() => {
    if (!generatedCode || !webcontainerInstance) return;

    const code = extractComponentCode(generatedCode);
    if (code) {
      updatePageFile(code);
    }
  }, [generatedCode]);

  // Update just the page file (hot reload)
  const updatePageFile = useCallback(async (componentCode) => {
    if (!webcontainerInstance) return;

    try {
      const pageCode = wrapAsPageComponent(componentCode);
      if (pageCode) {
        terminalRef.current?.writeln('\nUpdating component...');
        await webcontainerInstance.fs.writeFile('/app/page.jsx', pageCode);
        terminalRef.current?.writeln('Component updated! Hot reloading...');
      }
    } catch (err) {
      console.error('Update error:', err);
      terminalRef.current?.writeln(`\nUpdate error: ${err.message}`);
    }
  }, []);

  const statusMessages = {
    idle: 'Initializing...',
    booting: 'Booting WebContainer...',
    installing: 'Installing dependencies...',
    starting: 'Starting dev server...',
    ready: 'Ready',
    error: error || 'Error occurred'
  };

  return (
    <div className="webcontainer-preview">
      <div className="preview-header">
        <span className={`status-indicator status-${status}`}></span>
        <span className="status-text">{statusMessages[status]}</span>
      </div>

      <div className="preview-content">
        <div className="iframe-container">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title="Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          ) : (
            <div className="preview-placeholder">
              <div className="loader"></div>
              <p>{status === 'error' ? error : 'Loading preview...'}</p>
            </div>
          )}
        </div>

        <div className="terminal-container" ref={terminalContainerRef}></div>
      </div>
    </div>
  );
}

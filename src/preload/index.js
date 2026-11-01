/**
 * src/preload/index.js
 * Hardened Preload Script with Strict Context Isolation
 *
 * Restricts IPC communication to explicit whitelisted channels.
 * Validates payloads and prevents arbitrary IPC execution.
 */

const { ipcRenderer, webFrame, contextBridge } = require('electron');

const VALID_STATUS_CHANNELS = Object.freeze([
  'updater:checking',
  'updater:available',
  'updater:not-available',
  'updater:progress',
  'updater:downloaded',
  'updater:waiting-for-safe-point',
  'updater:preparing-maintenance',
  'updater:draining-operations',
  'updater:stopping-services',
  'updater:installing',
  'updater:drain-timeout',
  'updater:error',
]);

const electronAPI = {
  isElectron: true,
  exportPdf: (payload) => {
    if (!payload || typeof payload !== 'object') {
      return Promise.reject(new Error('Invalid export-pdf payload'));
    }
    return ipcRenderer.invoke('export-pdf', {
      html: String(payload.html || ''),
      defaultFileName: payload.defaultFileName ? String(payload.defaultFileName) : undefined,
      dialogTitle: payload.dialogTitle ? String(payload.dialogTitle) : undefined,
      pageSize: payload.pageSize ? String(payload.pageSize) : 'A4',
      preferCSSPageSize: Boolean(payload.preferCSSPageSize),
      marginsType: Number(payload.marginsType) || 1,
      landscape: Boolean(payload.landscape),
    });
  },
  changeZoom: (delta) => {
    const num = Number(delta) || 0;
    const nextZoom = Math.min(2, Math.max(0.5, webFrame.getZoomFactor() + num));
    webFrame.setZoomFactor(nextZoom);
    try {
      window.localStorage.setItem('app-zoom', nextZoom.toString());
    } catch {}
    return nextZoom;
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater-check'),
    downloadUpdate: () => ipcRenderer.invoke('updater-download'),
    safeInstall: (options = {}) => ipcRenderer.invoke('updater-safe-install', options),
    quitAndInstall: () => ipcRenderer.invoke('updater-quit-install'),
    getStatus: () => ipcRenderer.invoke('updater-status'),
    onStatus: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const subs = VALID_STATUS_CHANNELS.map((ch) => {
        const handler = (_event, data) => {
          try {
            callback(ch, data);
          } catch (e) {
            console.error(`[Preload] Error in updater status callback for ${ch}:`, e);
          }
        };
        ipcRenderer.on(ch, handler);
        return () => ipcRenderer.removeListener(ch, handler);
      });
      return () => subs.forEach((unsub) => unsub());
    },
  },
};

// Securely expose API via contextBridge only
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  } catch (err) {
    console.error('[Preload] Failed to expose electronAPI via contextBridge:', err);
  }
} else {
  console.warn('[Preload] Warning: contextIsolation is disabled. Electron API exposure restricted.');
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    const savedZoom = window.localStorage.getItem('app-zoom');
    if (savedZoom) {
      webFrame.setZoomFactor(parseFloat(savedZoom));
    }
  } catch (e) {
    console.warn('localStorage not available yet:', e.message);
  }

  // Reveal zoom buttons and hide scrollbars for EXE
  document.documentElement.classList.add('is-exe');
  document.querySelectorAll('.exe-only').forEach((el) => {
    el.classList.remove('hidden');
    el.classList.add('flex');
  });
});

// Patch modal alert/confirm to trigger focus fix in Electron
webFrame.executeJavaScript(`
  const originalAlert = window.alert;
  window.alert = function(msg) {
    originalAlert(msg);
    window.postMessage({ type: 'fix-focus' }, '*');
  };

  const originalConfirm = window.confirm;
  window.confirm = function(msg) {
    const result = originalConfirm(msg);
    window.postMessage({ type: 'fix-focus' }, '*');
    return result;
  };

  const originalPrompt = window.prompt;
  window.prompt = function(msg, defaultText) {
    const result = originalPrompt(msg, defaultText);
    window.postMessage({ type: 'fix-focus' }, '*');
    return result;
  };
`);

// Handle messages from the renderer window
window.addEventListener('message', (event) => {
  if (event.source === window && event.data) {
    if (event.data.type === 'fix-focus') {
      ipcRenderer.send('fix-focus');
    } else if (event.data.type === 'zoom-in') {
      const newZoom = webFrame.getZoomFactor() + 0.1;
      webFrame.setZoomFactor(newZoom);
      try {
        window.localStorage.setItem('app-zoom', newZoom.toString());
      } catch {}
    } else if (event.data.type === 'zoom-out') {
      const newZoom = webFrame.getZoomFactor() - 0.1;
      webFrame.setZoomFactor(newZoom);
      try {
        window.localStorage.setItem('app-zoom', newZoom.toString());
      } catch {}
    }
  }
});

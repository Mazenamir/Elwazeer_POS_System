const { ipcRenderer, webFrame, contextBridge } = require('electron');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    exportPdf: (payload) => ipcRenderer.invoke('export-pdf', payload),
    changeZoom: (delta) => {
      const nextZoom = Math.min(2, Math.max(0.5, webFrame.getZoomFactor() + Number(delta || 0)));
      webFrame.setZoomFactor(nextZoom);
      try {
        window.localStorage.setItem('app-zoom', nextZoom.toString());
      } catch (e) {}
      return nextZoom;
    },
    isElectron: true,
    updater: {
      checkForUpdates: () => ipcRenderer.invoke('updater-check'),
      downloadUpdate: () => ipcRenderer.invoke('updater-download'),
      quitAndInstall: () => ipcRenderer.invoke('updater-quit-install'),
      getStatus: () => ipcRenderer.invoke('updater-status'),
      onStatus: (callback) => {
        const channels = [
          'updater:checking',
          'updater:available',
          'updater:not-available',
          'updater:progress',
          'updater:downloaded',
          'updater:error',
        ];
        const subs = channels.map((ch) => {
          const handler = (_event, data) => callback(ch, data);
          ipcRenderer.on(ch, handler);
          return () => ipcRenderer.removeListener(ch, handler);
        });
        return () => subs.forEach((unsub) => unsub());
      },
    },
  });
} catch (e) {
  // If contextBridge is not enabled or fails, fallback to window assignment
  window.electronAPI = {
    exportPdf: (payload) => ipcRenderer.invoke('export-pdf', payload),
    changeZoom: (delta) => {
      const nextZoom = Math.min(2, Math.max(0.5, webFrame.getZoomFactor() + Number(delta || 0)));
      webFrame.setZoomFactor(nextZoom);
      try {
        window.localStorage.setItem('app-zoom', nextZoom.toString());
      } catch (e) {}
      return nextZoom;
    },
    isElectron: true,
    updater: {
      checkForUpdates: () => ipcRenderer.invoke('updater-check'),
      downloadUpdate: () => ipcRenderer.invoke('updater-download'),
      quitAndInstall: () => ipcRenderer.invoke('updater-quit-install'),
      getStatus: () => ipcRenderer.invoke('updater-status'),
      onStatus: (callback) => {
        const channels = [
          'updater:checking',
          'updater:available',
          'updater:not-available',
          'updater:progress',
          'updater:downloaded',
          'updater:error',
        ];
        const subs = channels.map((ch) => {
          const handler = (_event, data) => callback(ch, data);
          ipcRenderer.on(ch, handler);
          return () => ipcRenderer.removeListener(ch, handler);
        });
        return () => subs.forEach((unsub) => unsub());
      },
    },
  };
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
      } catch (e) {}
    } else if (event.data.type === 'zoom-out') {
      const newZoom = webFrame.getZoomFactor() - 0.1;
      webFrame.setZoomFactor(newZoom);
      try {
        window.localStorage.setItem('app-zoom', newZoom.toString());
      } catch (e) {}
    }
  }
});

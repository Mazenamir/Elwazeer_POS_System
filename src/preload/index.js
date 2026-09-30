const { ipcRenderer, webFrame } = require('electron');

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

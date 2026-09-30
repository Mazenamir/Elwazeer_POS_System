const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

function createSystemTray(mainWindow, onQuit, iconPath) {
  const defaultIcon = iconPath || path.join(__dirname, '../renderer/logos/app-icon.png');
  const trayIcon = nativeImage.createFromPath(defaultIcon);
  const tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'فتح البرنامج',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'إغلاق السيرفر تماماً',
      click: () => {
        if (typeof onQuit === 'function') {
          onQuit();
        }
      },
    },
  ]);

  tray.setToolTip('Bebyoon Center Server');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

module.exports = {
  createSystemTray,
};

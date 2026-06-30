// Thru — Electron wrapper for Steam / desktop distribution.
// Starts the bundled Node server, then loads it in a frameless pixel-friendly window.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;
let serverProc = null;

function startServer() {
  serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720,
    minWidth: 960, minHeight: 540,
    backgroundColor: '#0d0a16',
    title: 'Thru',
    webPreferences: { contextIsolation: true },
  });
  // Give the server a moment to bind the port.
  const tryLoad = (n = 0) => {
    win.loadURL(`http://localhost:${PORT}`).catch(() => {
      if (n < 20) setTimeout(() => tryLoad(n + 1), 250);
    });
  };
  tryLoad();
}

app.whenReady().then(() => {
  startServer();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (serverProc) serverProc.kill();
  if (process.platform !== 'darwin') app.quit();
});

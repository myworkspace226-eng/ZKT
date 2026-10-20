/**
 * Electron Main Process for ZKT Biometric Desktop Workstation
 * This file allows running the application directly on Windows as a native desktop program.
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ZKT Biometric Cloud - محطة إدارة البصمة والحضور (مصانع الملابس)',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    backgroundColor: '#0F172A',
    autoHideMenuBar: true,
  });

  Menu.setApplicationMenu(null);

  // In production desktop build, load the local index.html file
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Native window maximize on launch for workstation feel
  mainWindow.maximize();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

const net = require('net');
const { exec } = require('child_process');

// IPC handler to test real device connectivity (TCP / Ping / UDP)
ipcMain.handle('zkt-ping-device', async (event, { ip, port = 4370, timeout = 2500 }) => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let isResolved = false;

    // First try a quick TCP socket connection to port 4370
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    const tryIcmp = () => {
      // Windows ping command: ping -n 1 -w timeout ip
      exec(`ping -n 1 -w ${timeout} ${ip}`, (err, stdout) => {
        if (!isResolved) {
          isResolved = true;
          const pingMs = Math.max(1, Date.now() - startTime);
          const out = stdout ? stdout.toString() : '';
          if (!err && (out.includes('TTL=') || out.includes('bytes=') || out.includes('Reply from') || out.includes('الرد من'))) {
            resolve({ success: true, pingMs, method: 'icmp' });
          } else {
            resolve({ 
              success: false, 
              error: 'انتهت مهلة الانتظار (Timeout) - لم يتم الرد من IP الماكينة على الشبكة' 
            });
          }
        }
      });
    };

    socket.on('connect', () => {
      const pingMs = Math.max(1, Date.now() - startTime);
      socket.destroy();
      if (!isResolved) {
        isResolved = true;
        resolve({ success: true, pingMs, method: 'tcp' });
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      tryIcmp();
    });

    socket.on('error', () => {
      socket.destroy();
      tryIcmp();
    });

    try {
      socket.connect(port, ip);
    } catch (e) {
      tryIcmp();
    }
  });
});

ipcMain.handle('zkt-check-network', async () => {
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    let hasActiveInterface = false;
    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name]) {
        if (!net.internal && net.family === 'IPv4') {
          hasActiveInterface = true;
          break;
        }
      }
    }
    return { online: hasActiveInterface };
  } catch (err) {
    return { online: true };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


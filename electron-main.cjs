/**
 * Electron Main Process for ZKT Biometric Desktop Workstation
 * Native Windows application controlling real ZKTeco biometric terminals
 * via port 4370 UDP/TCP binary protocol.
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const { exec } = require('child_process');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ZKT Biometric Cloud - محطة إدارة البصمة والحضور (مصانع الملابس)',
    icon: path.join(__dirname, 'build', 'icon.ico'),
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// -------------------------------------------------------------
// IPC Handlers for Real ZKTeco Hardware Communication
// -------------------------------------------------------------

/**
 * 1. Ping / Test Device Reachability
 * Accurately detects whether device port 4370 is open or ICMP responds.
 * Strictly avoids false positives caused by local gateway / host unreachable replies.
 */
ipcMain.handle('zkt-ping-device', async (event, { ip, port = 4370, timeout = 2500 }) => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let isResolved = false;

    const finish = (result) => {
      if (!isResolved) {
        isResolved = true;
        try { socket.destroy(); } catch {}
        resolve(result);
      }
    };

    // First attempt a real TCP socket connect to port 4370
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    const tryIcmp = () => {
      // Windows ping command: ping -n 1 -w timeout ip
      exec(`ping -n 1 -w ${timeout} ${ip}`, (err, stdout) => {
        if (isResolved) return;
        const out = stdout ? stdout.toString() : '';
        const pingMs = Math.max(1, Date.now() - startTime);

        // Strict Windows Ping output inspection:
        // 1. MUST contain TTL= to be a genuine Echo Reply from target
        // 2. MUST NOT contain unreachable/failure/loss
        const hasTTL = /TTL=\d+/i.test(out);
        const hasUnreachable = /unreachable|timed out|could not find|failure|تعذر|غير قابل|انتهت مهلة|فقدان/i.test(out);
        const has100Loss = /100%\s*(?:loss|فقدان)/i.test(out);

        if (!err && hasTTL && !hasUnreachable && !has100Loss) {
          // IP replies to ICMP, but port 4370 TCP was closed or UDP only
          finish({ 
            success: true, 
            pingMs, 
            method: 'icmp',
            warning: 'تم الرد على Ping، يرجى فحص منفذ 4370' 
          });
        } else {
          finish({ 
            success: false, 
            error: `تعذر الوصول إلى IP الماكينة (${ip}) - لا يوجد رد من الجهاز على الشبكة` 
          });
        }
      });
    };

    socket.on('connect', () => {
      const pingMs = Math.max(1, Date.now() - startTime);
      finish({ success: true, pingMs, method: 'tcp' });
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

/**
 * 2. Pull Real Attendance Logs from ZKTeco Device
 * Connects directly using binary protocol on port 4370 (TCP/UDP)
 */
ipcMain.handle('zkt-pull-logs', async (event, { ip, port = 4370, timeout = 5000 }) => {
  let zk = null;
  const startTime = Date.now();
  try {
    const Zkteco = require('zkteco-js');
    zk = new Zkteco(ip, port, timeout, 5000);
    
    // Connect socket (handles TCP with automatic UDP fallback)
    await zk.createSocket();

    // Query device info if available
    let info = null;
    try {
      info = await zk.getInfo();
    } catch (e) {
      console.warn('Could not retrieve device info:', e);
    }

    // Pull attendance records
    const attendances = await zk.getAttendances();
    
    try {
      await zk.disconnect();
    } catch {}

    const rawRecords = (attendances && attendances.data) ? attendances.data : [];
    const pingMs = Math.max(1, Date.now() - startTime);

    return {
      success: true,
      pingMs,
      records: rawRecords.map((r, idx) => ({
        id: idx + 1,
        sn: r.sn || idx + 1,
        userId: String(r.user_id || r.userId || ''),
        recordTime: r.record_time || new Date().toISOString(),
        type: r.type || 0,
        state: r.state || 0,
        ip: ip,
      })),
      deviceInfo: info || null,
      message: `تم سحب ${rawRecords.length} حركة بنجاح من الماكينة (${ip})`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    const errMsg = (err && err.message) ? err.message : `فشل الاتصال بالماكينة عبر المنفذ ${port}`;
    return {
      success: false,
      records: [],
      error: errMsg.includes('ECONNREFUSED')
        ? `تم رفض الاتصال من الماكينة ${ip}:${port} (تأكد من تشغيل الماكينة وفتح المنفذ 4370)`
        : errMsg.includes('ETIMEDOUT') || errMsg.includes('timeout')
        ? `انتهت مهلة الاتصال بالماكينة ${ip}:${port} (الجهاز غير متصل بنفس الشبكة المحلية)`
        : `خطأ اتصال: ${errMsg}`,
    };
  }
});

/**
 * 3. Pull Registered Users / Workers from Device
 */
ipcMain.handle('zkt-pull-users', async (event, { ip, port = 4370, timeout = 5000 }) => {
  let zk = null;
  try {
    const Zkteco = require('zkteco-js');
    zk = new Zkteco(ip, port, timeout, 5000);
    await zk.createSocket();

    const usersRes = await zk.getUsers();
    try {
      await zk.disconnect();
    } catch {}

    const rawUsers = (usersRes && usersRes.data) ? usersRes.data : [];
    return {
      success: true,
      users: rawUsers.map((u, idx) => ({
        uid: u.uid || idx + 1,
        userId: String(u.userId || u.user_id || u.uid),
        name: u.name || `عامل كود #${u.userId || u.uid}`,
        role: u.role || 0,
        cardno: u.cardno || 0,
      })),
      message: `تم سحب ${rawUsers.length} مستخدم من ذاكرة الماكينة (${ip})`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return {
      success: false,
      users: [],
      error: (err && err.message) ? err.message : `فشل قراءة قائمة العمال من الماكينة (${ip})`,
    };
  }
});

/**
 * 4. Upload Worker / User to Device
 */
ipcMain.handle('zkt-upload-user', async (event, { ip, port = 4370, timeout = 5000, user }) => {
  let zk = null;
  try {
    const Zkteco = require('zkteco-js');
    zk = new Zkteco(ip, port, timeout, 5000);
    await zk.createSocket();

    const uid = Number(user.code) || user.id || 1;
    const userId = String(user.code || user.id);
    const name = String(user.name || '').substring(0, 24);

    await zk.setUser(uid, userId, name, '', 0, 0);
    try {
      await zk.disconnect();
    } catch {}

    return {
      success: true,
      message: `تم رفع وتثبيت بيانات العامل (${name} - كود ${userId}) على الماكينة بنجاح`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return {
      success: false,
      error: (err && err.message) ? err.message : `فشل رفع بيانات العامل إلى الماكينة (${ip})`,
    };
  }
});

/**
 * 5. Synchronize Device Clock
 */
ipcMain.handle('zkt-sync-time', async (event, { ip, port = 4370, timeout = 5000 }) => {
  let zk = null;
  try {
    const Zkteco = require('zkteco-js');
    zk = new Zkteco(ip, port, timeout, 5000);
    await zk.createSocket();
    await zk.setTime(new Date());
    try {
      await zk.disconnect();
    } catch {}
    return {
      success: true,
      message: `تمت مزامنة وقت وتاريخ الماكينة (${ip}) بنجاح مع توقيت الكمبيوتر`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return {
      success: false,
      error: (err && err.message) ? err.message : `تعذر ضبط توقيت الماكينة (${ip})`,
    };
  }
});

/**
 * 6. Native Network Adapter Status
 */
ipcMain.handle('zkt-check-network', async () => {
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    let hasActiveInterface = false;
    const activeIps = [];

    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name]) {
        if (!net.internal && net.family === 'IPv4') {
          if (!net.address.startsWith('169.254.')) {
            hasActiveInterface = true;
            activeIps.push({ name, ip: net.address });
          }
        }
      }
    }
    return { online: hasActiveInterface, adapters: activeIps };
  } catch (err) {
    return { online: false, adapters: [] };
  }
});

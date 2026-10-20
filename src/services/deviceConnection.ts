export interface PingResult {
  success: boolean;
  pingMs?: number;
  message: string;
  isDesktopNative: boolean;
}

/**
 * Checks whether the app is currently running inside the installed Electron desktop environment.
 */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean((window as any).require && (window as any).require('electron'));
  } catch {
    return false;
  }
}

/**
 * Checks overall network connectivity (LAN / Internet)
 * Uses navigator.onLine and native OS network interface check in Electron desktop.
 */
export async function checkNetworkConnectivity(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  if (isDesktopApp()) {
    try {
      const electron = (window as any).require('electron');
      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('zkt-check-network');
        if (res && typeof res.online === 'boolean') {
          return res.online;
        }
      }
    } catch {
      // Fallback to navigator
    }
  }

  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Tests network reachability to a ZKTeco biometric device.
 * In the Electron desktop application, uses native OS TCP sockets & ICMP ping to verify real LAN connectivity.
 * In web preview mode, reports real state without simulation.
 */
export async function pingDeviceNetwork(ip: string, port: number = 4370): Promise<PingResult> {
  // If running inside the native Windows Desktop Electron app:
  if (isDesktopApp()) {
    try {
      const electron = (window as any).require('electron');
      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('zkt-ping-device', { ip, port, timeout: 2500 });
        if (res && res.success) {
          return {
            success: true,
            pingMs: res.pingMs || 5,
            message: `تم الاتصال بنجاح بـ ${ip}:${port} (${res.pingMs}ms)`,
            isDesktopNative: true,
          };
        } else {
          return {
            success: false,
            message: `تعذر الاتصال بـ ${ip}:${port} (${res?.error || 'لم يتم الرد من الماكينة'}).`,
            isDesktopNative: true,
          };
        }
      }
    } catch (err: any) {
      console.error('Desktop native ping error:', err);
      return {
        success: false,
        message: `تعذر الاتصال بـ ${ip}:${port}.`,
        isDesktopNative: true,
      };
    }
  }

  // When running inside a Web Browser (e.g. AI Studio preview):
  return {
    success: false,
    message: `تعذر الاتصال بـ ${ip}:${port} (يتطلب تشغيل تطبيق الديسكتوب للاتصال بالشبكة المحلية).`,
    isDesktopNative: false,
  };
}

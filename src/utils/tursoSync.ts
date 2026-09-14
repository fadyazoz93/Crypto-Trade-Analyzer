export interface TursoSignal {
  id?: number;
  symbol: string;
  decision: string;
  price: number;
  reason?: string;
  trade_setup?: any;
  sop_score?: number;
  created_at?: string;
}

export interface TursoConnectionStatus {
  connected: boolean;
  message: string;
  host?: string;
  totalSignalsLogged?: number;
  totalTradesLogged?: number;
  openTradesLogged?: number;
}

let isKnownOffline = false;
let lastCheckTime = 0;
const CHECK_COOLDOWN = 8000; // 8 seconds cooldown

async function safeFetchJson(url: string, options?: RequestInit, timeoutMs = 5000): Promise<any | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function checkTursoConnection(force = false): Promise<TursoConnectionStatus> {
  const now = Date.now();
  if (!force && isKnownOffline && now - lastCheckTime < CHECK_COOLDOWN) {
    return { connected: false, message: 'قاعدة بيانات Turso غير متصلة أو في وضع التهدئة' };
  }

  const data = await safeFetchJson('/api/turso', undefined, 4000);
  lastCheckTime = now;

  if (data && data.connected) {
    isKnownOffline = false;
    return {
      connected: true,
      message: data.message || 'متصل بقاعدة بيانات Turso Cloud',
      host: data.host,
      totalSignalsLogged: data.totalSignalsLogged,
      totalTradesLogged: data.totalTradesLogged,
      openTradesLogged: data.openTradesLogged,
    };
  } else {
    isKnownOffline = true;
    return {
      connected: false,
      message: data?.message || 'قاعدة بيانات Turso غير مهيأة أو تعذر الوصول إليها',
    };
  }
}

export async function testAndConfigureTurso(url: string, authToken: string): Promise<{ success: boolean; message: string; dbTime?: string }> {
  try {
    const res = await fetch('/api/turso?action=configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, authToken }),
    });
    const data = await res.json();
    if (data.success) {
      isKnownOffline = false;
      lastCheckTime = 0;
    }
    return data;
  } catch (err: any) {
    return { success: false, message: `تعذر الاتصال بالسيرفر: ${err.message}` };
  }
}

// ----------------------------------------------------
// 1. INDIVIDUAL TRADES PERSISTENCE (حفظ واسترجاع الصفقات)
// ----------------------------------------------------

export async function saveTradeToTurso(trade: any): Promise<boolean> {
  if (!trade || !trade.id) return false;
  try {
    const data = await safeFetchJson('/api/turso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_trade',
        trade,
      }),
    });
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

export async function getTradesFromTurso(status?: string): Promise<any[]> {
  try {
    const url = status ? `/api/turso?action=get_trades&status=${encodeURIComponent(status)}` : '/api/turso?action=get_trades';
    const data = await safeFetchJson(url);
    return data?.success && Array.isArray(data.trades) ? data.trades : [];
  } catch {
    return [];
  }
}

export async function deleteTradeFromTurso(id: string): Promise<boolean> {
  try {
    const data = await safeFetchJson('/api/turso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_trade',
        id,
      }),
    });
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

export async function clearTradesFromTurso(): Promise<boolean> {
  try {
    const data = await safeFetchJson('/api/turso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_trades' }),
    });
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// 2. SIGNALS PERSISTENCE (إشارات الصفقات الفنية)
// ----------------------------------------------------

export async function saveSignalToTurso(signal: TursoSignal): Promise<boolean> {
  if (isKnownOffline) return false;
  try {
    const data = await safeFetchJson('/api/turso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_signal',
        ...signal,
      }),
    });
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

export async function getSignalsFromTurso(): Promise<TursoSignal[]> {
  if (isKnownOffline) return [];
  try {
    const data = await safeFetchJson('/api/turso?action=get_signals');
    return data?.success && Array.isArray(data.data) ? data.data : [];
  } catch {
    return [];
  }
}

export async function clearSignalsFromTurso(): Promise<boolean> {
  if (isKnownOffline) return false;
  try {
    const data = await safeFetchJson('/api/turso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_signals' }),
    });
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// 3. FULL PORTFOLIO SYNC (سجل المحفظة الافتراضية والصفقات)
// ----------------------------------------------------

export async function savePortfolioToTurso(portfolio: any): Promise<boolean> {
  if (isKnownOffline) return false;
  try {
    const data = await safeFetchJson('/api/turso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_portfolio',
        portfolio,
      }),
    });
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

export async function getPortfolioFromTurso(): Promise<any | null> {
  if (isKnownOffline) return null;
  try {
    const data = await safeFetchJson('/api/turso?action=get_portfolio');
    return data?.success ? data.portfolio : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------
// 4. STRATEGY SETTINGS & CUSTOM SYMBOLS
// ----------------------------------------------------

export async function saveSettingsToTurso(settings: any): Promise<boolean> {
  if (isKnownOffline) return false;
  try {
    const data = await safeFetchJson('/api/turso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_settings',
        settings,
      }),
    });
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

export async function getSettingsFromTurso(): Promise<any | null> {
  if (isKnownOffline) return null;
  try {
    const data = await safeFetchJson('/api/turso?action=get_settings');
    return data?.success ? data.settings : null;
  } catch {
    return null;
  }
}

export async function saveCustomSymbolsToTurso(symbols: any[]): Promise<boolean> {
  if (isKnownOffline) return false;
  try {
    const data = await safeFetchJson('/api/turso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_custom_symbols',
        symbols,
      }),
    });
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

export async function getCustomSymbolsFromTurso(): Promise<any[]> {
  if (isKnownOffline) return [];
  try {
    const data = await safeFetchJson('/api/turso?action=get_custom_symbols');
    return data?.success && Array.isArray(data.symbols) ? data.symbols : [];
  } catch {
    return [];
  }
}

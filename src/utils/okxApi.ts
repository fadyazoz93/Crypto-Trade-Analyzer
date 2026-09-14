/**
 * OKX Market Data API Client
 * High-performance, multi-endpoint client for fetching real-time candlestick data,
 * 24hr tickers, orderbook spreads, and top volume rankings directly from OKX.
 */

import { CandleData, SymbolInfo } from '../types';

export const OKX_PUBLIC_ENDPOINTS = [
  'https://www.okx.com',
  'https://aws.okx.com',
  'https://okx.com',
];

/**
 * Convert standard symbol format (e.g. BTCUSDT or BTC) to OKX Instrument ID (e.g. BTC-USDT)
 */
export function toOkxInstId(symbol: string): string {
  if (!symbol) return 'BTC-USDT';
  const clean = symbol.trim().toUpperCase();

  if (clean.includes('-')) {
    return clean;
  }

  if (clean.endsWith('USDT')) {
    const base = clean.slice(0, clean.length - 4);
    return `${base}-USDT`;
  }

  if (clean.endsWith('USDC')) {
    const base = clean.slice(0, clean.length - 4);
    return `${base}-USDC`;
  }

  return `${clean}-USDT`;
}

/**
 * Convert OKX Instrument ID (e.g. BTC-USDT) to standard app symbol (e.g. BTCUSDT)
 */
export function fromOkxInstId(instId: string): string {
  if (!instId) return 'BTCUSDT';
  return instId.replace(/-/g, '').toUpperCase();
}

/**
 * Convert standard interval (e.g. 5m, 1h, 4h) to OKX bar parameter (e.g. 5m, 1H, 4H)
 */
export function toOkxBar(interval: string): string {
  const norm = interval.toLowerCase().trim();
  switch (norm) {
    case '1m': return '1m';
    case '3m': return '3m';
    case '5m': return '5m';
    case '15m': return '15m';
    case '30m': return '30m';
    case '1h': return '1H';
    case '2h': return '2H';
    case '4h': return '4H';
    case '6h': return '6H';
    case '12h': return '12H';
    case '1d': return '1D';
    case '1w': return '1W';
    default: return norm;
  }
}

export interface OkxResponse<T> {
  code: string;
  msg: string;
  data: T;
}

export interface OkxTickerRaw {
  instType: string;
  instId: string;
  last: string;
  lastSz?: string;
  askPx: string;
  askSz?: string;
  bidPx: string;
  bidSz?: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
  vol24h: string;
  ts: string;
  sodUtc0?: string;
  sodUtc8?: string;
}

export interface ParsedOkxTicker {
  symbol: string;
  instId: string;
  lastPrice: number;
  open24h: number;
  high24h: number;
  low24h: number;
  priceChangePercent: number;
  volume24h: number;
  quoteVolume24h: number;
  bidPrice: number;
  askPrice: number;
  timestamp: number;
}

/**
 * Fetch OKX API with mirror failover and backend proxy fallback
 */
export async function fetchOkxEndpoint<T = any>(
  endpoint: string,
  params: Record<string, string | number> = {},
  timeoutMs = 4500
): Promise<T | null> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    queryParams.append(k, String(v));
  });
  const queryString = queryParams.toString();
  const path = `/api/v5/${cleanEndpoint}${queryString ? `?${queryString}` : ''}`;

  // 1. Try public OKX direct mirrors
  for (const base of OKX_PUBLIC_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${base}${path}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        if (json && json.code === '0') {
          return json.data as T;
        }
      }
    } catch {
      // Continue to next mirror
    }
  }

  // 2. Try server-side proxy fallback (/api/okx)
  try {
    const proxyParams = new URLSearchParams({
      endpoint: cleanEndpoint,
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const origin = typeof window !== 'undefined' ? '' : 'http://127.0.0.1:3000';
    const res = await fetch(`${origin}/api/okx?${proxyParams.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      if (json && json.code === '0') {
        return json.data as T;
      }
    }
  } catch {
    // Silent fallback
  }

  return null;
}

/**
 * Fetch Candlesticks (K-Lines) directly from OKX
 * OKX returns newest candles first [0], so this function converts them to chronological order (oldest to newest).
 */
export async function fetchOkxCandles(
  symbol: string,
  interval: string,
  limit = 250
): Promise<{
  closes: number[];
  highs: number[];
  lows: number[];
  candles: CandleData[];
} | null> {
  const instId = toOkxInstId(symbol);
  const bar = toOkxBar(interval);

  // OKX accepts limit up to 300 per call for /market/candles
  const okxLimit = Math.min(300, Math.max(10, limit));

  const data = await fetchOkxEndpoint<string[][]>(
    'market/candles',
    {
      instId,
      bar,
      limit: okxLimit,
    },
    5000
  );

  if (!data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  // OKX format per candle array:
  // [0: timestamp, 1: open, 2: high, 3: low, 4: close, 5: vol, 6: volCcy, 7: volCcyQuote, 8: confirm]
  // Array is reverse chronological (index 0 is newest).
  // Reverse to make index 0 oldest and index [length-1] the latest candle.
  const rawCandles = [...data].reverse();

  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const candles: CandleData[] = [];

  for (const c of rawCandles) {
    const time = parseInt(c[0], 10);
    const open = parseFloat(c[1]);
    const high = parseFloat(c[2]);
    const low = parseFloat(c[3]);
    const close = parseFloat(c[4]);
    const volume = parseFloat(c[5]) || 0;

    if (!isNaN(close)) {
      closes.push(close);
      highs.push(high);
      lows.push(low);
      candles.push({ time, open, high, low, close, volume });
    }
  }

  if (closes.length === 0) return null;

  return { closes, highs, lows, candles };
}

/**
 * Fetch 24hr Ticker for a single instrument from OKX
 */
export async function fetchOkxTicker(symbol: string): Promise<ParsedOkxTicker | null> {
  const instId = toOkxInstId(symbol);
  const data = await fetchOkxEndpoint<OkxTickerRaw[]>(
    'market/ticker',
    { instId },
    3500
  );

  if (!data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const raw = data[0];
  const lastPrice = parseFloat(raw.last);
  const open24h = parseFloat(raw.open24h || raw.last);
  const high24h = parseFloat(raw.high24h || raw.last);
  const low24h = parseFloat(raw.low24h || raw.last);
  const quoteVolume24h = parseFloat(raw.volCcy24h || '0');
  const volume24h = parseFloat(raw.vol24h || '0');
  const bidPrice = parseFloat(raw.bidPx || raw.last);
  const askPrice = parseFloat(raw.askPx || raw.last);
  const timestamp = parseInt(raw.ts, 10) || Date.now();

  const priceChangePercent = open24h > 0 ? ((lastPrice - open24h) / open24h) * 100 : 0;

  return {
    symbol: fromOkxInstId(raw.instId),
    instId: raw.instId,
    lastPrice,
    open24h,
    high24h,
    low24h,
    priceChangePercent: Number(priceChangePercent.toFixed(2)),
    volume24h,
    quoteVolume24h,
    bidPrice,
    askPrice,
    timestamp,
  };
}

/**
 * Fetch top SPOT volume symbols directly from OKX
 */
export async function fetchOkxTopVolumeTickers(limit = 20): Promise<ParsedOkxTicker[]> {
  const data = await fetchOkxEndpoint<OkxTickerRaw[]>(
    'market/tickers',
    { instType: 'SPOT' },
    4500
  );

  if (!data || !Array.isArray(data)) {
    return [];
  }

  // Filter only USDT pairs and sort by 24h quote volume descending
  const usdtTickers = data
    .filter((item) => item.instId.endsWith('-USDT'))
    .map((raw) => {
      const lastPrice = parseFloat(raw.last);
      const open24h = parseFloat(raw.open24h || raw.last);
      const high24h = parseFloat(raw.high24h || raw.last);
      const low24h = parseFloat(raw.low24h || raw.last);
      const quoteVolume24h = parseFloat(raw.volCcy24h || '0');
      const volume24h = parseFloat(raw.vol24h || '0');
      const bidPrice = parseFloat(raw.bidPx || raw.last);
      const askPrice = parseFloat(raw.askPx || raw.last);
      const timestamp = parseInt(raw.ts, 10) || Date.now();
      const priceChangePercent = open24h > 0 ? ((lastPrice - open24h) / open24h) * 100 : 0;

      return {
        symbol: fromOkxInstId(raw.instId),
        instId: raw.instId,
        lastPrice,
        open24h,
        high24h,
        low24h,
        priceChangePercent: Number(priceChangePercent.toFixed(2)),
        volume24h,
        quoteVolume24h,
        bidPrice,
        askPrice,
        timestamp,
      };
    })
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);

  return usdtTickers.slice(0, limit);
}

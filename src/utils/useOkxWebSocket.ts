import { useState, useEffect, useRef, useCallback } from 'react';
import { toOkxInstId, fromOkxInstId, fetchOkxTicker, fetchOkxTopVolumeTickers } from './okxApi';

export interface WebSocketTickerData {
  symbol: string;
  price: number;
  priceChangePercent?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
}

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

const OKX_WS_ENDPOINTS = [
  'wss://ws.okx.com:8443/ws/v5/public',
  'wss://wsaws.okx.com:8443/ws/v5/public',
  'wss://wspap.okx.com:8443/ws/v5/public',
];

/**
 * Hook for live real-time OKX WebSocket single-symbol price stream
 */
export function useOkxSymbolWebSocket(symbol: string) {
  const [ticker, setTicker] = useState<WebSocketTickerData | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevSymbolRef = useRef<string>('');

  const cleanSymbol = symbol ? symbol.trim().toUpperCase() : '';

  const connect = useCallback(() => {
    if (!cleanSymbol) return;
    const instId = toOkxInstId(cleanSymbol);
    const appSymbol = fromOkxInstId(instId);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    setStatus('CONNECTING');

    let endpointIndex = 0;

    const startWs = () => {
      const url = OKX_WS_ENDPOINTS[endpointIndex % OKX_WS_ENDPOINTS.length];
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('CONNECTED');
          // Subscribe to OKX tickers channel
          const subscribeMsg = JSON.stringify({
            op: 'subscribe',
            args: [
              {
                channel: 'tickers',
                instId,
              },
            ],
          });
          ws.send(subscribeMsg);

          // Start OKX ping/pong keepalive every 20 seconds
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          try {
            if (event.data === 'pong') return;

            const msg = JSON.parse(event.data);
            if (msg.event === 'subscribe') {
              setStatus('CONNECTED');
              return;
            }

            if (msg.data && Array.isArray(msg.data) && msg.data.length > 0) {
              const item = msg.data[0];
              const lastPrice = parseFloat(item.last);
              const open24h = parseFloat(item.open24h || item.last);
              const high24h = parseFloat(item.high24h || item.last);
              const low24h = parseFloat(item.low24h || item.last);
              const volume24h = parseFloat(item.vol24h || '0');
              const changePercent = open24h > 0 ? ((lastPrice - open24h) / open24h) * 100 : 0;

              if (!isNaN(lastPrice)) {
                setTicker((prev) => {
                  if (
                    prev &&
                    prev.symbol === appSymbol &&
                    prev.price === lastPrice &&
                    prev.priceChangePercent === Number(changePercent.toFixed(2))
                  ) {
                    return prev;
                  }
                  return {
                    symbol: appSymbol,
                    price: lastPrice,
                    priceChangePercent: Number(changePercent.toFixed(2)),
                    high24h,
                    low24h,
                    volume24h,
                  };
                });
                setStatus('CONNECTED');
              }
            }
          } catch (e) {
            // Ignore format errors silently
          }
        };

        ws.onerror = () => {
          endpointIndex++;
          setStatus('RECONNECTING');
        };

        ws.onclose = () => {
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          if (wsRef.current === ws) {
            setStatus('RECONNECTING');
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, 3500);
          }
        };
      } catch (err) {
        setStatus('RECONNECTING');
      }
    };

    startWs();

    // Secondary fallback REST fetch every 4s to ensure continuous price updates
    const fetchFallback = async () => {
      try {
        const okxData = await fetchOkxTicker(cleanSymbol);
        if (okxData && okxData.lastPrice > 0) {
          setTicker((prev) => {
            if (
              prev &&
              prev.symbol === appSymbol &&
              prev.price === okxData.lastPrice &&
              prev.priceChangePercent === okxData.priceChangePercent
            ) {
              return prev;
            }
            return {
              symbol: appSymbol,
              price: okxData.lastPrice,
              priceChangePercent: okxData.priceChangePercent,
              high24h: okxData.high24h,
              low24h: okxData.low24h,
              volume24h: okxData.volume24h,
            };
          });
          setStatus('CONNECTED');
        }
      } catch {
        // Silent catch
      }
    };

    fetchFallback();
    if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    fallbackIntervalRef.current = setInterval(fetchFallback, 4000);

  }, [cleanSymbol]);

  useEffect(() => {
    if (!cleanSymbol) return;
    if (prevSymbolRef.current === cleanSymbol && wsRef.current) {
      return;
    }
    prevSymbolRef.current = cleanSymbol;
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cleanSymbol, connect]);

  return { ticker, status };
}

/**
 * Hook for multi-symbol live stream from OKX for Market Scanner & Heatmap
 */
export function useOkxAllTickersWebSocket(symbols: string[]) {
  const [tickersMap, setTickersMap] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevSymbolsKeyRef = useRef<string>('');

  const symbolsKey = Array.isArray(symbols)
    ? Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()))).sort().join(',')
    : '';

  const connect = useCallback(() => {
    if (!symbolsKey) return;

    const symbolList = symbolsKey.split(',').filter(Boolean);
    if (symbolList.length === 0) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    setStatus('CONNECTING');

    const instIds = symbolList.map((s) => ({
      channel: 'tickers',
      instId: toOkxInstId(s),
    }));

    let endpointIndex = 0;

    const startWs = () => {
      const url = OKX_WS_ENDPOINTS[endpointIndex % OKX_WS_ENDPOINTS.length];
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('CONNECTED');

          // Batch subscribe in groups of 20
          const chunkSize = 20;
          for (let i = 0; i < instIds.length; i += chunkSize) {
            const chunk = instIds.slice(i, i + chunkSize);
            ws.send(JSON.stringify({ op: 'subscribe', args: chunk }));
          }

          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          try {
            if (event.data === 'pong') return;
            const msg = JSON.parse(event.data);

            if (msg.data && Array.isArray(msg.data)) {
              const updates: Record<string, number> = {};
              msg.data.forEach((item: any) => {
                if (item.instId && item.last) {
                  const sym = fromOkxInstId(item.instId);
                  const price = parseFloat(item.last);
                  if (!isNaN(price)) {
                    updates[sym] = price;
                  }
                }
              });

              setTickersMap((prev) => {
                let changed = false;
                const next = { ...prev };
                Object.keys(updates).forEach((sym) => {
                  if (next[sym] !== updates[sym]) {
                    next[sym] = updates[sym];
                    changed = true;
                  }
                });
                return changed ? next : prev;
              });
              setStatus('CONNECTED');
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          endpointIndex++;
          setStatus('RECONNECTING');
        };

        ws.onclose = () => {
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          if (wsRef.current === ws) {
            setStatus('RECONNECTING');
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, 4000);
          }
        };
      } catch {
        setStatus('RECONNECTING');
      }
    };

    startWs();

    // Fallback REST fetch every 6s
    const fetchFallback = async () => {
      try {
        const list = await fetchOkxTopVolumeTickers(50);
        if (list && list.length > 0) {
          const updates: Record<string, number> = {};
          list.forEach((item) => {
            if (item.symbol && item.lastPrice > 0) {
              updates[item.symbol] = item.lastPrice;
            }
          });

          setTickersMap((prev) => {
            let changed = false;
            const next = { ...prev };
            Object.keys(updates).forEach((sym) => {
              if (next[sym] !== updates[sym]) {
                next[sym] = updates[sym];
                changed = true;
              }
            });
            return changed ? next : prev;
          });
          setStatus('CONNECTED');
        }
      } catch {
        // Silent catch
      }
    };

    fetchFallback();
    if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    fallbackIntervalRef.current = setInterval(fetchFallback, 6000);

  }, [symbolsKey]);

  useEffect(() => {
    if (!symbolsKey) return;
    if (prevSymbolsKeyRef.current === symbolsKey && wsRef.current) {
      return;
    }
    prevSymbolsKeyRef.current = symbolsKey;
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbolsKey, connect]);

  return { tickersMap, status };
}

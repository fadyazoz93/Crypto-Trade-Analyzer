import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SymbolInfo, AnalysisResult, SignalHistoryItem, TradingMode } from './types';
import { POPULAR_SYMBOLS, fetchTopVolumeSymbols, analyzeMarketData, reEvaluateWithLivePrice } from './utils/technicalAnalysis';
import { useOkxSymbolWebSocket } from './utils/useOkxWebSocket';
import { playSignalChime } from './utils/audioAlert';
import { getNotificationPermission, requestNotificationPermission, sendTradeNotification } from './utils/browserNotifications';
import { sendTelegramSignal } from './utils/telegramNotifications';
import { signalNotificationManager } from './utils/tradeSignalNotifier';
import { saveSignalToTurso, getSignalsFromTurso, clearSignalsFromTurso, checkTursoConnection, getSettingsFromTurso, getCustomSymbolsFromTurso, saveCustomSymbolsToTurso } from './utils/tursoSync';
import { fetchPaperPortfolioFromTurso, getPaperPortfolio, savePaperPortfolio } from './utils/paperTradingStore';
import { getStrategySettings, saveStrategySettings } from './utils/settingsStore';
import { Header } from './components/Header';
import { ControlPanel, ActiveTab } from './components/ControlPanel';
import { AnalysisResultCard } from './components/AnalysisResultCard';
import { MarketScanner } from './components/MarketScanner';
import { PositionCalculator } from './components/PositionCalculator';
import { SignalHistory } from './components/SignalHistory';
import { PaperTradingManager } from './components/PaperTradingManager';
import { BacktestingEngine } from './components/BacktestingEngine';
import { TrendHeatmap } from './components/TrendHeatmap';
import { StrategySettingsModal } from './components/StrategySettingsModal';

export default function App() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>(POPULAR_SYMBOLS);
  const [symbolsUpdating, setSymbolsUpdating] = useState<boolean>(false);
  const [symbolsLastUpdated, setSymbolsLastUpdated] = useState<string | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [tradingMode, setTradingMode] = useState<TradingMode>('INTRADAY');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    return getNotificationPermission() === 'granted';
  });
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;

  // Handle toggling browser notifications
  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
    } else {
      const granted = await requestNotificationPermission();
      if (granted) {
        setNotificationsEnabled(true);
        sendTradeNotification({
          symbol: 'Crypto Trade Analyzer',
          decision: 'BUY',
          price: 0,
          reason: 'تم تفعيل إشعارات المتصفح بنجاح! ستصلك تنبيهات سريعة فور وجود أي صفقة شراء أو بيع.',
        });
      } else {
        alert('يرجى السماح بالإشعارات من إعدادات المتصفح للتمكن من تلقي تنبيهات الصفقات.');
      }
    }
  };

  // Auto-fetch top volume symbols from OKX
  const refreshSymbols = useCallback(async () => {
    setSymbolsUpdating(true);
    try {
      const topSymbols = await fetchTopVolumeSymbols(15);
      setSymbols((prevSymbols) => {
        // Retain custom symbols added by user
        const customSymbols = prevSymbols.filter((s) => s.category === 'Custom');
        const customKeys = new Set(customSymbols.map((s) => s.symbol));
        const filteredTop = topSymbols.filter((s) => !customKeys.has(s.symbol));
        return [...customSymbols, ...filteredTop];
      });
      setSymbolsLastUpdated(new Date().toLocaleTimeString('ar-EG'));
    } catch (err) {
      console.error('Failed to update symbols list:', err);
    } finally {
      setSymbolsUpdating(false);
    }
  }, []);

  // Fetch top volume symbols automatically on mount and every 3 minutes
  useEffect(() => {
    refreshSymbols();
    const intervalId = setInterval(() => {
      refreshSymbols();
    }, 180000);
    return () => clearInterval(intervalId);
  }, [refreshSymbols]);

  // Automatic Turso Database Synchronization (Real-time Phone <-> Desktop when Turso is connected)
  useEffect(() => {
    let isMounted = true;
    let autoSyncInterval: any = null;

    const setupSync = async () => {
      try {
        const conn = await checkTursoConnection();
        if (!conn.connected || !isMounted) return;

        // Initial background hydration from Turso
        const remotePortfolio = await fetchPaperPortfolioFromTurso();
        if (remotePortfolio && isMounted) {
          window.dispatchEvent(new Event('paper-portfolio-updated'));
        }

        const remoteSettings = await getSettingsFromTurso();
        if (remoteSettings && isMounted) {
          saveStrategySettings(remoteSettings);
        }

        const remoteCustomSymbols = await getCustomSymbolsFromTurso();
        if (Array.isArray(remoteCustomSymbols) && remoteCustomSymbols.length > 0 && isMounted) {
          setSymbols((prev) => {
            const existingKeys = new Set(prev.map((s) => s.symbol));
            const newSymbolsToAdd = remoteCustomSymbols.filter((cs) => !existingKeys.has(cs.symbol));
            return [...newSymbolsToAdd, ...prev];
          });
        }

        // Periodic background 2-way sync (every 8 seconds) only when database is active
        autoSyncInterval = setInterval(async () => {
          if (!isMounted) return;
          try {
            const rPort = await fetchPaperPortfolioFromTurso();
            if (rPort && isMounted) {
              window.dispatchEvent(new Event('paper-portfolio-updated'));
            }

            const rSettings = await getSettingsFromTurso();
            if (rSettings && isMounted) {
              const currentLocal = getStrategySettings();
              if (JSON.stringify(rSettings) !== JSON.stringify(currentLocal)) {
                saveStrategySettings(rSettings);
              }
            }
          } catch {
            // Safe silent catch
          }
        }, 8000);
      } catch {
        // Safe silent catch
      }
    };

    setupSync();

    return () => {
      isMounted = false;
      if (autoSyncInterval) clearInterval(autoSyncInterval);
    };
  }, []);

  // OKX WebSocket Live Stream Hook
  const { ticker, status: wsStatus } = useOkxSymbolWebSocket(selectedSymbol);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('scanner');

  // Live auto-trade execution toast notification
  const [autoTradeToast, setAutoTradeToast] = useState<{
    id: string;
    symbol: string;
    decision: 'BUY' | 'SELL';
    price: number;
    source: string;
  } | null>(null);

  useEffect(() => {
    const handleTradeAutoExecuted = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.trade) return;
      setAutoTradeToast({
        id: `${detail.symbol}-${Date.now()}`,
        symbol: detail.symbol,
        decision: detail.decision || detail.trade.type,
        price: detail.trade.entryPrice,
        source: detail.triggerSource || 'AUTO',
      });
    };

    window.addEventListener('trade-auto-executed', handleTradeAutoExecuted);
    return () => {
      window.removeEventListener('trade-auto-executed', handleTradeAutoExecuted);
    };
  }, []);

  // History log
  const [history, setHistory] = useState<SignalHistoryItem[]>([]);

  // Synchronize remote signals from 24/7 background daemon and Turso Cloud DB
  const syncRemoteSignals = useCallback(async () => {
    try {
      const [daemonRes, tursoSignals] = await Promise.allSettled([
        fetch('/api/daemon/status').then((r) => (r.ok ? r.json() : null)),
        getSignalsFromTurso(),
      ]);

      const daemonData = daemonRes.status === 'fulfilled' ? daemonRes.value : null;
      const tursoData =
        tursoSignals.status === 'fulfilled' && Array.isArray(tursoSignals.value)
          ? tursoSignals.value
          : [];

      const newHistoryItems: SignalHistoryItem[] = [];

      // 1. Ingest daemon signals from 24/7 autonomous worker
      if (daemonData && Array.isArray(daemonData.lastSignals)) {
        daemonData.lastSignals.forEach((s: any) => {
          newHistoryItems.push({
            id: `daemon-${s.symbol}-${new Date(s.timestamp).getTime()}`,
            symbol: s.symbol,
            decision: s.decision,
            reason: s.reason || 'إشارة مؤكدة عبر فاحص السيرفر المستمر (24/7 Daemon)',
            indicators: {
              price: s.price,
              sopScore: s.sopScore,
            } as any,
            trade_setup: s.trade_setup,
            timestamp: s.timestamp,
            source: 'DAEMON',
            telegramSent: s.telegramSent,
            sopScore: s.sopScore,
          });
        });
      }

      // 2. Ingest Turso DB signals
      tursoData.forEach((s: any) => {
        newHistoryItems.push({
          id: `turso-${s.id || s.symbol + '-' + (s.created_at || Date.now())}`,
          symbol: s.symbol,
          decision: s.decision,
          reason: s.reason || 'إشارة مسجلة في قاعدة بيانات Turso السحابية',
          indicators: {
            price: s.price,
            sopScore: s.sop_score,
          } as any,
          trade_setup: s.trade_setup,
          timestamp: s.created_at || new Date().toISOString(),
          source: 'TURSO',
          sopScore: s.sop_score,
        });
      });

      if (newHistoryItems.length > 0) {
        setHistory((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const existingTimeSlots = new Set(
            prev.map((p) => `${p.symbol}-${p.decision}-${Math.floor(new Date(p.timestamp).getTime() / 60000)}`)
          );

          const toAdd: SignalHistoryItem[] = [];
          for (const item of newHistoryItems) {
            const timeSlotKey = `${item.symbol}-${item.decision}-${Math.floor(new Date(item.timestamp).getTime() / 60000)}`;
            if (!existingIds.has(item.id) && !existingTimeSlots.has(timeSlotKey)) {
              toAdd.push(item);
              existingIds.add(item.id);
              existingTimeSlots.add(timeSlotKey);
            }
          }

          if (toAdd.length === 0) return prev;

          const merged = [...toAdd, ...prev];
          merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          return merged.slice(0, 100);
        });
      }
    } catch {
      // Safe silent catch
    }
  }, []);

  // Poll daemon and cloud DB signals continuously
  useEffect(() => {
    syncRemoteSignals();
    const interval = setInterval(syncRemoteSignals, 8000);
    return () => clearInterval(interval);
  }, [syncRemoteSignals]);

  const handleClearHistory = async () => {
    setHistory([]);
    await clearSignalsFromTurso();
  };

  // Fetch initial candles history and full indicator buffers
  const fetchAnalysis = useCallback(async (symbolToFetch: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await analyzeMarketData(symbolToFetch, tradingMode);
      setResult(data);
      const timeStr = new Date().toLocaleTimeString('ar-EG');
      setLastUpdated(timeStr);

      // Play alert chime, browser notification & auto-execute trade if signal triggered
      if (data.decision !== 'NO_TRADE') {
        if (soundEnabledRef.current) {
          if (!signalNotificationManager.hasBeenNotified(data.symbol, data.decision, 'AUDIO')) {
            playSignalChime(data.decision);
            signalNotificationManager.markAsNotified(data.symbol, data.decision, 'AUDIO', data.trade_setup?.entry_price, data.trade_setup?.stop_loss);
          }
        }
        if (notificationsEnabledRef.current) {
          sendTradeNotification({
            symbol: data.symbol,
            decision: data.decision,
            price: data.indicators.price,
            entryPrice: data.trade_setup?.entry_price,
            stopLoss: data.trade_setup?.stop_loss,
            takeProfit1: data.trade_setup?.take_profit_1,
            takeProfit2: data.trade_setup?.take_profit_2,
            sopScore: data.indicators.sopScore,
            reason: data.reason,
          });
        }

        // Send instant notification to Telegram bot
        sendTelegramSignal({
          symbol: data.symbol,
          decision: data.decision,
          price: data.indicators.price,
          entryPrice: data.trade_setup?.entry_price,
          stopLoss: data.trade_setup?.stop_loss,
          takeProfit: data.trade_setup?.take_profit || data.trade_setup?.take_profit_1,
          takeProfit1: data.trade_setup?.take_profit || data.trade_setup?.take_profit_1,
          riskRewardRatio: data.trade_setup?.risk_reward_ratio,
          sopScore: data.indicators.sopScore,
          reason: data.reason,
          source: 'MANUAL_OR_CHART',
        }).catch(() => {});

        saveSignalToTurso({
          symbol: data.symbol,
          decision: data.decision,
          price: data.indicators.price,
          reason: data.reason,
          trade_setup: data.trade_setup,
          sop_score: data.indicators.sopScore,
        });
      }

      // Append to signal history
      setHistory((prev) => [
        {
          ...data,
          id: `${data.symbol}-${Date.now()}`,
        },
        ...prev.slice(0, 49),
      ]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'تعذر جلب البيانات وتحليلها من OKX.');
    } finally {
      setLoading(false);
    }
  }, [tradingMode]);

  // Handle adding custom USDT pair
  const handleAddCustomSymbol = (customSymbol: string) => {
    const newSym: SymbolInfo = {
      symbol: customSymbol,
      name: customSymbol.replace('USDT', ''),
      icon: '⚡',
      category: 'Custom',
    };
    setSymbols((prev) => {
      const updated = [newSym, ...prev];
      const customOnly = updated.filter((s) => s.category === 'Custom');
      saveCustomSymbolsToTurso(customOnly).catch(() => {});
      return updated;
    });
  };

  // Run initial analysis when symbol changes
  useEffect(() => {
    fetchAnalysis(selectedSymbol);
  }, [selectedSymbol, fetchAnalysis]);

  // Re-evaluate 4T conditions in memory when live WebSocket price tick arrives
  useEffect(() => {
    if (!ticker || !ticker.price || ticker.price <= 0) return;

    setResult((prevResult) => {
      if (!prevResult || prevResult.symbol !== ticker.symbol) return prevResult;
      if (prevResult.indicators.price === ticker.price) return prevResult;

      // Silently re-evaluate 4T strategy rules with new live tick price
      const updated = reEvaluateWithLivePrice(prevResult, ticker.price);

      // Sound, browser notification & auto-execution trigger if decision flipped to BUY or SELL
      if (prevResult.decision !== updated.decision && updated.decision !== 'NO_TRADE') {
        if (soundEnabledRef.current) {
          if (!signalNotificationManager.hasBeenNotified(updated.symbol, updated.decision, 'AUDIO')) {
            playSignalChime(updated.decision);
            signalNotificationManager.markAsNotified(updated.symbol, updated.decision, 'AUDIO', updated.trade_setup?.entry_price, updated.trade_setup?.stop_loss);
          }
        }
        if (notificationsEnabledRef.current) {
          sendTradeNotification({
            symbol: updated.symbol,
            decision: updated.decision,
            price: updated.indicators.price,
            entryPrice: updated.trade_setup?.entry_price,
            stopLoss: updated.trade_setup?.stop_loss,
            takeProfit1: updated.trade_setup?.take_profit_1,
            takeProfit2: updated.trade_setup?.take_profit_2,
            sopScore: updated.indicators.sopScore,
            reason: updated.reason,
          });
        }

        // Send instant notification to Telegram on live confirmation
        sendTelegramSignal({
          symbol: updated.symbol,
          decision: updated.decision,
          price: updated.indicators.price,
          entryPrice: updated.trade_setup?.entry_price,
          stopLoss: updated.trade_setup?.stop_loss,
          takeProfit: updated.trade_setup?.take_profit || updated.trade_setup?.take_profit_1,
          takeProfit1: updated.trade_setup?.take_profit || updated.trade_setup?.take_profit_1,
          riskRewardRatio: updated.trade_setup?.risk_reward_ratio,
          sopScore: updated.indicators.sopScore,
          reason: updated.reason,
          source: 'LIVE_TICK',
        }).catch(() => {});
      }

      return updated;
    });
  }, [ticker]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-2.5 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-6 font-sans selection:bg-emerald-500 selection:text-slate-950 relative overflow-x-hidden" dir="rtl">
      {/* Ambient background glows */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-10 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        
        {/* Header Component */}
        <Header
          lastUpdated={lastUpdated}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={handleToggleNotifications}
          activeSymbol={selectedSymbol}
          wsStatus={wsStatus}
          tradingMode={tradingMode}
          onToggleTradingMode={(mode) => {
            setTradingMode(mode);
            fetchAnalysis(selectedSymbol);
          }}
        />

        {/* Controls & Tab Selector */}
        <ControlPanel
          symbols={symbols}
          selectedSymbol={selectedSymbol}
          onSelectSymbol={(sym) => {
            setSelectedSymbol(sym);
            setActiveTab('single');
          }}
          onAddCustomSymbol={handleAddCustomSymbol}
          loading={loading}
          onFetchAnalysis={() => fetchAnalysis(selectedSymbol)}
          activeTab={activeTab}
          onChangeTab={(tab) => setActiveTab(tab)}
          wsStatus={wsStatus}
          onRefreshSymbols={refreshSymbols}
          symbolsUpdating={symbolsUpdating}
          symbolsLastUpdated={symbolsLastUpdated}
          onOpenSettings={() => setShowSettingsModal(true)}
        />

        {/* Auto Trade Execution Live Notification Banner */}
        {autoTradeToast && (
          <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border-2 border-emerald-500/80 p-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-white animate-bounce-short">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-lg ${
                autoTradeToast.decision === 'BUY' ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
              }`}>
                {autoTradeToast.decision === 'BUY' ? 'شراء' : 'بيع'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-emerald-300">
                    ⚡ تم التنفيذ التلقائي لصفقة ({autoTradeToast.symbol}) بنجاح!
                  </span>
                  <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-600 font-mono font-bold">
                    دخول فوري
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  سعر الدخول: <span className="font-mono font-bold text-white">${autoTradeToast.price}</span> | الحساب مؤمن بقاطع خسارة <span className="text-rose-400 font-bold">-8%</span> وقفل ربح يومي <span className="text-amber-400 font-bold">+15%</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab('paper');
                  setAutoTradeToast(null);
                }}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                عرض المحفظة 💼
              </button>
              <button
                onClick={() => setAutoTradeToast(null)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                إغلاق ✕
              </button>
            </div>
          </div>
        )}

        {/* Error Alert Box */}
        {error && (
          <div className="bg-rose-950/80 border border-rose-500/80 text-rose-200 p-4 rounded-xl text-sm font-medium flex items-center justify-between shadow-lg">
            <span>⚠️ {error}</span>
            <button
              onClick={() => fetchAnalysis(selectedSymbol)}
              className="px-3 py-1 bg-rose-500 text-white rounded-lg font-bold text-xs hover:bg-rose-600 transition cursor-pointer"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Active Tab View Rendering */}
        {activeTab === 'single' && (
          <>
            {result && !loading && (
              <AnalysisResultCard 
                result={result} 
                selectedSymbol={selectedSymbol} 
                onNavigateToPortfolio={() => setActiveTab('paper')}
              />
            )}

            {loading && (
              <div className="bg-slate-900/60 p-12 rounded-2xl border border-slate-800 text-center space-y-4">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-bold text-slate-300">
                  جاري جلب أحدث الشموع والمؤشرات (4H, 1H, 15M, 5M) من OKX لمجموعة {selectedSymbol}...
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'scanner' && (
          <MarketScanner
            symbols={symbols}
            tradingMode={tradingMode}
            onSelectSymbol={(sym) => {
              setSelectedSymbol(sym);
              setActiveTab('single');
            }}
            onNavigateToPortfolio={() => setActiveTab('paper')}
          />
        )}

        {activeTab === 'heatmap' && (
          <TrendHeatmap
            symbols={symbols}
            tradingMode={tradingMode}
            onSelectSymbol={(sym) => {
              setSelectedSymbol(sym);
              setActiveTab('single');
            }}
          />
        )}

        {activeTab === 'paper' && (
          <PaperTradingManager
            onSelectSymbol={(sym) => {
              setSelectedSymbol(sym);
              setActiveTab('single');
            }}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestingEngine
            symbols={symbols}
            selectedSymbol={selectedSymbol}
          />
        )}

        {activeTab === 'calculator' && (
          <PositionCalculator
            tradeSetup={result?.trade_setup}
            price={result?.indicators.price || 0}
          />
        )}

        {activeTab === 'history' && (
          <SignalHistory
            history={history}
            onClearHistory={handleClearHistory}
            onRefresh={syncRemoteSignals}
            onSelectSymbol={(sym) => {
              setSelectedSymbol(sym);
              setActiveTab('single');
            }}
          />
        )}

        {/* Strategy Settings Modal Drawer */}
        <StrategySettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onSaveSuccess={() => {
            if (selectedSymbol) fetchAnalysis(selectedSymbol);
          }}
        />

        {/* Session Signal History Quick Drawer Link */}
        {history.length > 0 && activeTab !== 'history' && (
          <div className="flex justify-between items-center bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs text-slate-400">
            <span>تم إجراء {history.length} فحص خلال هذه الجلسة</span>
            <button
              onClick={() => setActiveTab('history')}
              className="text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer"
            >
              عرض سجل الفحوصات الجارية ←
            </button>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-slate-500 text-xs pt-4 pb-6 border-t border-slate-900 space-y-1">
          <p>محلل الصفقات الذكي - محرك تحليل الأطر الزمنية المتزامن © {new Date().getFullYear()}</p>
          <p className="text-[11px] text-slate-600">
            تنبيه: التداول في العملات الرقمية ينطوي على مخاطرة عالية. التحليل الفني لغرض التعليم واتخاذ القرار الاستثماري المسؤول.
          </p>
        </footer>

      </div>
    </main>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { SymbolInfo, ScanItemResult, TradingMode, AnalysisResult } from '../types';
import { scanMultipleSymbols, reEvaluateWithLivePrice } from '../utils/technicalAnalysis';
import { sendTradeNotification } from '../utils/browserNotifications';
import { sendTelegramSignal } from '../utils/telegramNotifications';
import { useOkxAllTickersWebSocket } from '../utils/useOkxWebSocket';
import { 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus, 
  Filter, 
  Activity, 
  ChevronRight, 
  Zap, 
  Target, 
  ShieldAlert, 
  Compass, 
  Clock, 
  Gauge, 
  ShieldCheck, 
  Award,
  Copy,
  Check,
  Briefcase,
  Bot,
  Send,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { QuickTradeExecutionModal } from './QuickTradeExecutionModal';
import { MarketScannerCard } from './MarketScannerCard';

interface MarketScannerProps {
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: string) => void;
  tradingMode?: TradingMode;
  onNavigateToPortfolio?: () => void;
}

export const MarketScanner: React.FC<MarketScannerProps> = ({ 
  symbols, 
  onSelectSymbol, 
  tradingMode = 'INTRADAY',
  onNavigateToPortfolio 
}) => {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanItemResult[]>(() => {
    try {
      const saved = localStorage.getItem('quant_gann_scanner_cache_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.data) && parsed.data.length > 0 && Date.now() - parsed.timestamp < 10 * 60 * 1000) {
          return parsed.data;
        }
      }
    } catch {}
    return [];
  });
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'NO_TRADE'>('ALL');
  const [lastScanTime, setLastScanTime] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('quant_gann_scanner_cache_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.timeStr) return parsed.timeStr;
      }
    } catch {}
    return null;
  });
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);
  const [selectedExecutionResult, setSelectedExecutionResult] = useState<AnalysisResult | null>(null);
  const [daemonSignals, setDaemonSignals] = useState<Array<{
    symbol: string;
    decision: 'BUY' | 'SELL';
    price: number;
    sopScore: number;
    timestamp: string;
    reason: string;
    trade_setup?: any;
    telegramSent: boolean;
  }>>([]);

  // Poll 24/7 background daemon status and its dispatched signals
  useEffect(() => {
    let mounted = true;
    const fetchDaemonSignals = async () => {
      try {
        const res = await fetch('/api/daemon/status');
        if (res.ok && mounted) {
          const data = await res.json();
          if (Array.isArray(data.lastSignals)) {
            setDaemonSignals(data.lastSignals);
          }
        }
      } catch {}
    };

    fetchDaemonSignals();
    const interval = setInterval(fetchDaemonSignals, 6000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleCopyCardSignal = (e: React.MouseEvent, item: ScanItemResult) => {
    e.stopPropagation();
    const tradeSetup = item.analysis?.trade_setup;
    if (!tradeSetup) return;

    const actionText = item.decision === 'BUY' ? '🟢 شراء (BUY LONG)' : '🔴 بيع (SELL SHORT)';
    const matrix = item.analysis?.confluenceMatrix;
    const text = `⚡ **توصية تداول فورية - ماسح السوق** ⚡
الزوج: #${item.symbol}
القرار: ${actionText}
سعر الدخول: $${tradeSetup.entry_price}
وقف الخسارة: $${tradeSetup.stop_loss} (${tradeSetup.stopLossPercent}%)
الهدف الأول (TP1): $${tradeSetup.take_profit_1} (+${tradeSetup.tp1Percent}%)
الهدف الثاني (TP2): $${tradeSetup.take_profit_2} (+${tradeSetup.tp2Percent}%)
نسبة العائد: ${tradeSetup.risk_reward_ratio}
${matrix ? `درجة التوافق: ${matrix.totalScore}/100 (${matrix.grade})` : ''}
التوقيت: ${new Date().toLocaleTimeString('ar-EG')}`;

    navigator.clipboard.writeText(text);
    setCopiedSymbol(item.symbol);
    setTimeout(() => setCopiedSymbol(null), 2000);
  };

  // Connect to OKX WebSocket for all symbols ticker stream
  const symbolKeys = useMemo(() => symbols.map((s) => s.symbol), [symbols]);
  const { tickersMap, status: wsStatus } = useOkxAllTickersWebSocket(symbolKeys);
  const isWsLive = wsStatus === 'CONNECTED';

  const handleRunScan = async () => {
    setScanning(true);
    try {
      const scanData = await scanMultipleSymbols(symbols, tradingMode as TradingMode);
      setResults(scanData);
      const currentTimeStr = new Date().toLocaleTimeString('ar-EG');
      setLastScanTime(currentTimeStr);

      try {
        localStorage.setItem('quant_gann_scanner_cache_v2', JSON.stringify({
          data: scanData,
          timestamp: Date.now(),
          timeStr: currentTimeStr,
        }));
      } catch {}

      // Send browser notification and auto-execute for any valid trade setups found (4/5 and 5/5 supported)
      scanData.forEach((item) => {
        if (item.decision === 'BUY' || item.decision === 'SELL') {
          const sop = item.analysis?.confluenceMatrix?.sopScore 
            ?? item.analysis?.indicators.sopScore 
            ?? (item.analysis?.confluenceMatrix ? Math.round((item.analysis.confluenceMatrix.totalScore / 100) * 5) : 0);

          // Allow 4/5 and 5/5 trades
          if (sop < 4) return;

          sendTradeNotification({
            symbol: item.symbol,
            decision: item.decision,
            price: item.price,
            entryPrice: item.analysis?.trade_setup?.entry_price,
            stopLoss: item.analysis?.trade_setup?.stop_loss,
            takeProfit1: item.analysis?.trade_setup?.take_profit_1,
            takeProfit2: item.analysis?.trade_setup?.take_profit_2,
            takeProfit3: item.analysis?.trade_setup?.take_profit_3,
            takeProfit4: item.analysis?.trade_setup?.take_profit_4,
            sopScore: sop,
            reason: item.reason,
          });

          // Send to Telegram (4/5 and 5/5 supported in V41.00)
          if (item.analysis) {
            sendTelegramSignal({
              symbol: item.symbol,
              decision: item.decision,
              price: item.price,
              entryPrice: item.analysis.trade_setup?.entry_price,
              stopLoss: item.analysis.trade_setup?.stop_loss,
              takeProfit: item.analysis.trade_setup?.take_profit || item.analysis.trade_setup?.take_profit_4 || item.analysis.trade_setup?.take_profit_1,
              takeProfit1: item.analysis.trade_setup?.take_profit_1,
              takeProfit2: item.analysis.trade_setup?.take_profit_2,
              takeProfit3: item.analysis.trade_setup?.take_profit_3,
              takeProfit4: item.analysis.trade_setup?.take_profit_4,
              riskRewardRatio: item.analysis.trade_setup?.risk_reward_ratio,
              sopScore: sop,
              reason: item.reason,
              source: 'SCANNER',
            }).catch(() => {});
          }
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    handleRunScan();
  }, [symbols, tradingMode]);

  // Update table prices and re-evaluate strategy rules tick-by-tick in background
  useEffect(() => {
    if (!tickersMap || Object.keys(tickersMap).length === 0) return;

    setResults((prevResults) => {
      if (prevResults.length === 0) return prevResults;

      let changed = false;
      const updated = prevResults.map((item) => {
        const livePrice = tickersMap[item.symbol];
        if (livePrice && livePrice > 0 && livePrice !== item.price) {
          changed = true;
          if (item.analysis) {
            // Re-evaluate strategy conditions with new live WebSocket price
            const updatedAnalysis = reEvaluateWithLivePrice(item.analysis, livePrice);

            // Trigger notification and auto-execution if status flips to a new trade signal (4/5 and 5/5 supported)
            if (item.decision !== updatedAnalysis.decision && (updatedAnalysis.decision === 'BUY' || updatedAnalysis.decision === 'SELL')) {
              const liveSop = updatedAnalysis.confluenceMatrix?.sopScore 
                ?? updatedAnalysis.indicators.sopScore 
                ?? (updatedAnalysis.confluenceMatrix ? Math.round((updatedAnalysis.confluenceMatrix.totalScore / 100) * 5) : 0);

              if (liveSop >= 4) {
                sendTradeNotification({
                  symbol: item.symbol,
                  decision: updatedAnalysis.decision,
                  price: livePrice,
                  entryPrice: updatedAnalysis.trade_setup?.entry_price,
                  stopLoss: updatedAnalysis.trade_setup?.stop_loss,
                  takeProfit1: updatedAnalysis.trade_setup?.take_profit_1,
                  takeProfit2: updatedAnalysis.trade_setup?.take_profit_2,
                  takeProfit3: updatedAnalysis.trade_setup?.take_profit_3,
                  takeProfit4: updatedAnalysis.trade_setup?.take_profit_4,
                  sopScore: liveSop,
                  reason: updatedAnalysis.reason,
                });

                sendTelegramSignal({
                  symbol: item.symbol,
                  decision: updatedAnalysis.decision,
                  price: livePrice,
                  entryPrice: updatedAnalysis.trade_setup?.entry_price,
                  stopLoss: updatedAnalysis.trade_setup?.stop_loss,
                  takeProfit: updatedAnalysis.trade_setup?.take_profit || updatedAnalysis.trade_setup?.take_profit_4 || updatedAnalysis.trade_setup?.take_profit_1,
                  takeProfit1: updatedAnalysis.trade_setup?.take_profit_1,
                  takeProfit2: updatedAnalysis.trade_setup?.take_profit_2,
                  takeProfit3: updatedAnalysis.trade_setup?.take_profit_3,
                  takeProfit4: updatedAnalysis.trade_setup?.take_profit_4,
                  riskRewardRatio: updatedAnalysis.trade_setup?.risk_reward_ratio,
                  sopScore: liveSop,
                  reason: updatedAnalysis.reason,
                  source: 'SCANNER',
                }).catch(() => {});
              }
            }

            return {
              ...item,
              price: livePrice,
              decision: updatedAnalysis.decision,
              reason: updatedAnalysis.reason,
              rsi_5m: updatedAnalysis.indicators.rsi_5m,
              ema200_4h: updatedAnalysis.indicators.ema200_4h,
              timestamp: new Date().toLocaleTimeString('ar-EG'),
              analysis: updatedAnalysis,
            };
          }
          return {
            ...item,
            price: livePrice,
            timestamp: new Date().toLocaleTimeString('ar-EG'),
          };
        }
        return item;
      });

      return changed ? updated : prevResults;
    });
  }, [tickersMap]);

  const sanitizedResults = results.map((item) => {
    const sop = item.analysis?.confluenceMatrix?.sopScore 
      ?? item.analysis?.indicators.sopScore 
      ?? (item.analysis?.confluenceMatrix ? Math.round((item.analysis.confluenceMatrix.totalScore / 100) * 5) : 0);
    if ((item.decision === 'BUY' || item.decision === 'SELL') && sop < 4) {
      return {
        ...item,
        decision: 'NO_TRADE' as const,
        reason: `وضع الانتظار المؤسسي (اكتمال ${sop}/5 بوابات - المطلوب 4/5 أو 5/5 لتأكيد الصفقة V41.00).`,
      };
    }
    return item;
  });

  const filteredResults = sanitizedResults.filter((item) => {
    if (filter === 'ALL') return true;
    return item.decision === filter;
  });

  const buyCount = sanitizedResults.filter((r) => r.decision === 'BUY').length;
  const sellCount = sanitizedResults.filter((r) => r.decision === 'SELL').length;
  const noTradeCount = sanitizedResults.filter((r) => r.decision === 'NO_TRADE').length;

  const isScalp = tradingMode === 'SCALP';

  // Deduplicate daemon signals by symbol so each symbol only appears once with its latest state
  const uniqueDaemonSignals = useMemo(() => {
    const seen = new Set<string>();
    const list: typeof daemonSignals = [];
    for (const sig of daemonSignals) {
      if (!seen.has(sig.symbol)) {
        seen.add(sig.symbol);
        list.push(sig);
      }
    }
    return list;
  }, [daemonSignals]);

  return (
    <div className="bg-slate-900 p-3.5 sm:p-5 md:p-6 rounded-2xl border border-slate-800 space-y-4 sm:space-y-5 shadow-xl">
      {/* Header and Trigger */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 border-b border-slate-800 pb-3.5">
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-white flex items-center gap-2">
              <span>ماسح السوق ومصفوفة التوافق 🚀</span>
              <span className="text-[11px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
                {symbols.length} عملة
              </span>
            </h2>

            <span
              className={`inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold px-2.5 py-0.5 rounded-full transition-all ${
                isWsLive
                  ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/80 shadow-emerald-950/50'
                  : 'bg-amber-950/90 text-amber-300 border border-amber-600/80'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isWsLive ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isWsLive ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
              <span>{isWsLive ? '🔴 بث حي (WebSocket)' : 'جاري الاتصال...'}</span>
            </span>

            {/* Mode Indicator Badge in Scanner Header */}
            <span
              className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-sm ${
                isScalp
                  ? 'bg-amber-950/90 text-amber-300 border-amber-600/80'
                  : 'bg-teal-950/90 text-teal-300 border-teal-600/80'
              }`}
            >
              <span>{isScalp ? '⚡ مضاربة (1H/15M/5M/1M)' : '📊 تداول يومي (4H/1H/15M/5M)'}</span>
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
            {isScalp
              ? 'تقييم العملات وفق مصفوفة التوافق المؤسسية (100 نقطة) ومستويات مربع التسعة لجـان اللحظية'
              : 'تقييم العملات وفق مصفوفة التوافق المؤسسية (100 نقطة) والقمم والقيعان المحورية لـ 4H ومربع التسعة'}
          </p>
        </div>
      </div>

      {/* Filter and Stats Badges */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold overflow-x-auto w-full sm:w-auto scrollbar-none">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                filter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              الكل ({sanitizedResults.length})
            </button>
            <button
              onClick={() => setFilter('BUY')}
              className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                filter === 'BUY' ? 'bg-emerald-500 text-slate-950 font-extrabold' : 'text-emerald-400 hover:bg-emerald-950/40'
              }`}
            >
              شراء 🟢 ({buyCount})
            </button>
            <button
              onClick={() => setFilter('SELL')}
              className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                filter === 'SELL' ? 'bg-rose-500 text-white font-extrabold' : 'text-rose-400 hover:bg-rose-950/40'
              }`}
            >
              بيع 🔴 ({sellCount})
            </button>
            <button
              onClick={() => setFilter('NO_TRADE')}
              className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                filter === 'NO_TRADE' ? 'bg-slate-800 text-slate-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              انتظار ⚪ ({noTradeCount})
            </button>
          </div>

          <span className="hidden sm:inline-flex text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-950/70 text-indigo-300 border border-indigo-800/80 whitespace-nowrap">
            🎯 صفقات 4/5 و 5/5 | سلّم الأهداف الرباعي (مصفوفة جان ووايكوف V41.00)
          </span>
        </div>

        {lastScanTime && (
          <span className="text-[11px] sm:text-xs text-slate-400 font-mono">
            التحديث: <span className="text-emerald-400">{lastScanTime}</span>
          </span>
        )}
      </div>

      {/* 24/7 Background Scanner Daemon Signals Section */}
      {uniqueDaemonSignals.length > 0 && (
        <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 shadow-lg space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-400 animate-pulse" />
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>إشارات فاحص السيرفر المستمر (24/7 Daemon)</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                  <Send className="w-2.5 h-2.5" />
                  <span>تم الإرسال لتليجرام</span>
                </span>
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              آخر إشارات مكتشفة آلياً: {uniqueDaemonSignals.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {uniqueDaemonSignals.slice(0, 6).map((sig, idx) => {
              const isBuy = sig.decision === 'BUY';
              return (
                <div
                  key={`${sig.symbol}-${idx}-${sig.timestamp}`}
                  onClick={() => onSelectSymbol(sig.symbol)}
                  className="bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 p-3.5 rounded-xl transition cursor-pointer space-y-2 relative group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-black flex items-center gap-1 ${
                        isBuy ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
                      }`}>
                        {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {sig.decision}
                      </span>
                      <bdi dir="ltr" className="font-mono font-bold text-white text-sm">#{sig.symbol}</bdi>
                    </div>

                    <span className="text-xs font-mono font-bold text-emerald-300">
                      ${sig.price < 1 ? sig.price.toFixed(6) : sig.price.toFixed(2)}
                    </span>
                  </div>

                  {sig.trade_setup && (
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono bg-slate-950/80 p-2 rounded-lg border border-slate-800/80">
                      <div>
                        <span className="text-slate-400 block text-[9px]">الدخول</span>
                        <span className="text-white font-bold">${sig.trade_setup.entry_price}</span>
                      </div>
                      <div>
                        <span className="text-rose-400 block text-[9px]">وقف SL</span>
                        <span className="text-rose-300 font-bold">${sig.trade_setup.stop_loss}</span>
                      </div>
                      <div>
                        <span className="text-emerald-400 block text-[9px]">الهدف TP</span>
                        <span className="text-emerald-300 font-bold">${sig.trade_setup.take_profit_1 || sig.trade_setup.take_profit}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                      {new Date(sig.timestamp).toLocaleTimeString('ar-EG')}
                    </span>
                    <span className="text-emerald-400 font-bold group-hover:underline flex items-center gap-0.5">
                      عرض الشارت <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CARDS GRID VIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {filteredResults.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800">
            {scanning ? (
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                <span>جاري الفحص الشامل للأسواق والعملات عبر مصفوفة التوافق...</span>
              </div>
            ) : (
              'لا توجد عملات تطابق هذا التصفية حالياً.'
            )}
          </div>
        ) : (
            filteredResults.map((item) => (
              <MarketScannerCard
                key={item.symbol}
                item={item}
                onSelectSymbol={onSelectSymbol}
                onCopyCardSignal={handleCopyCardSignal}
                copiedSymbol={copiedSymbol}
                onOpenExecution={(analysis) => setSelectedExecutionResult(analysis)}
                isScalp={isScalp}
              />
            ))
          )}
        </div>

        {/* Quick Trade Execution Modal in Market Scanner */}
        {selectedExecutionResult && (
          <QuickTradeExecutionModal
            isOpen={!!selectedExecutionResult}
            onClose={() => setSelectedExecutionResult(null)}
            result={selectedExecutionResult}
            onNavigateToPortfolio={onNavigateToPortfolio}
          />
        )}
      </div>
    );
  };


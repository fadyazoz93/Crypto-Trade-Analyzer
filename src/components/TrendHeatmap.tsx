import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SymbolInfo, TradingMode, AnalysisResult } from '../types';
import { scanMultipleSymbols, reEvaluateWithLivePrice } from '../utils/technicalAnalysis';
import { useOkxAllTickersWebSocket } from '../utils/useOkxWebSocket';
import { LayoutGrid, RefreshCw, ArrowUpRight, ArrowDownRight, Minus, Zap, Activity, Layers, Flame } from 'lucide-react';

interface HeatmapRowData {
  symbol: string;
  name: string;
  price: number;
  prevPrice?: number;
  priceDirection?: 'UP' | 'DOWN' | 'FLAT';
  tf1: 'BULL' | 'BEAR' | 'NEUTRAL';
  tf2: 'BULL' | 'BEAR' | 'NEUTRAL';
  tf3: 'BULL' | 'BEAR' | 'NEUTRAL';
  tf4: 'BULL' | 'BEAR' | 'NEUTRAL';
  overallScore: number;
  confluenceGrade?: string;
  overallDir: 'BUY' | 'SELL' | 'NEUTRAL';
  analysis?: AnalysisResult;
}

interface TrendHeatmapProps {
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: string) => void;
  tradingMode?: TradingMode;
}

function computeRowDataFromAnalysis(
  symbol: string,
  name: string,
  price: number,
  analysis: AnalysisResult | undefined,
  mode: TradingMode,
  prevRow?: HeatmapRowData
): HeatmapRowData {
  let priceDirection: 'UP' | 'DOWN' | 'FLAT' = prevRow?.priceDirection || 'FLAT';
  if (prevRow && price !== prevRow.price) {
    priceDirection = price > prevRow.price ? 'UP' : 'DOWN';
  }

  if (!analysis) {
    return {
      symbol,
      name,
      price,
      prevPrice: prevRow?.price,
      priceDirection,
      tf1: 'NEUTRAL',
      tf2: 'NEUTRAL',
      tf3: 'NEUTRAL',
      tf4: 'NEUTRAL',
      overallScore: 0,
      overallDir: 'NEUTRAL',
    };
  }

  const isScalp = mode === 'SCALP';

  // Timeframe 1: Macro Trend (4H or 1H)
  const emaThreshold = isScalp
    ? (analysis.indicators.ema200_1h || analysis.indicators.ema200_4h)
    : analysis.indicators.ema200_4h;
  const tf1 = analysis.steps.step1_4h.passed
    ? (price > emaThreshold ? 'BULL' : 'BEAR')
    : 'NEUTRAL';

  // Timeframe 2: Momentum (1H or 15M MACD)
  const macdVal = isScalp
    ? (analysis.indicators.macd_hist_15m ?? analysis.indicators.macd_hist_1h)
    : analysis.indicators.macd_hist_1h;
  const tf2 = analysis.steps.step2_1h.passed
    ? (macdVal > 0 ? 'BULL' : 'BEAR')
    : 'NEUTRAL';

  // Timeframe 3: Pullback (15M or 5M RSI)
  const rsiVal = isScalp ? analysis.indicators.rsi_5m : analysis.indicators.rsi_15m;
  const tf3 = analysis.steps.step3_15m.passed
    ? (rsiVal <= 48 ? 'BULL' : 'BEAR')
    : 'NEUTRAL';

  // Timeframe 4: Immediate Trigger (5M or 1M)
  const tf4 = analysis.steps.step4_5m.passed
    ? (analysis.indicators.macd_5m_cross === 'BUY' ? 'BULL' : 'BEAR')
    : 'NEUTRAL';

  return {
    symbol,
    name,
    price,
    prevPrice: prevRow?.price,
    priceDirection,
    tf1,
    tf2,
    tf3,
    tf4,
    overallScore: analysis.confluenceMatrix ? analysis.confluenceMatrix.totalScore : (analysis.indicators.sopScore ? analysis.indicators.sopScore * 20 : 0),
    confluenceGrade: analysis.confluenceMatrix?.grade || (analysis.decision !== 'NO_TRADE' ? 'A+' : 'C'),
    overallDir: analysis.decision === 'BUY' ? 'BUY' : analysis.decision === 'SELL' ? 'SELL' : 'NEUTRAL',
    analysis,
  };
}

export const TrendHeatmap: React.FC<TrendHeatmapProps> = ({
  symbols,
  onSelectSymbol,
  tradingMode = 'INTRADAY',
}) => {
  const [heatmapData, setHeatmapData] = useState<HeatmapRowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');
  const [lastScan, setLastScan] = useState<string | null>(null);

  // Connect to OKX WebSocket tick-by-tick multi-symbol stream
  const symbolKeys = useMemo(() => symbols.map((s) => s.symbol), [symbols]);
  const { tickersMap, status: wsStatus } = useOkxAllTickersWebSocket(symbolKeys);
  const isWsLive = wsStatus === 'CONNECTED';

  const isScalp = tradingMode === 'SCALP';

  const fetchHeatmapData = async () => {
    setLoading(true);
    try {
      const scanned = await scanMultipleSymbols(symbols, tradingMode as TradingMode);

      setHeatmapData((prev) => {
        const prevMap = new Map<string, HeatmapRowData>(prev.map((p) => [p.symbol, p]));
        return scanned.map((item) => {
          const prevRow = prevMap.get(item.symbol);
          return computeRowDataFromAnalysis(
            item.symbol,
            item.name,
            item.price,
            item.analysis,
            tradingMode as TradingMode,
            prevRow
          );
        });
      });

      setLastScan(new Date().toLocaleTimeString('ar-EG'));
    } catch (err) {
      console.error('Heatmap scan error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial scan on mount or symbols / tradingMode change
  useEffect(() => {
    fetchHeatmapData();
  }, [symbols, tradingMode]);

  // Periodic Auto-Refresh scan every 15 seconds to fetch fresh full candle data from OKX
  useEffect(() => {
    const timer = setInterval(() => {
      fetchHeatmapData();
    }, 15000);
    return () => clearInterval(timer);
  }, [symbols, tradingMode]);

  // Live WebSocket Tick-by-Tick price update + Real-time Strategy re-evaluation
  useEffect(() => {
    if (!tickersMap || Object.keys(tickersMap).length === 0) return;

    setHeatmapData((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const livePrice = tickersMap[row.symbol.toUpperCase()];
        if (livePrice && livePrice !== row.price) {
          changed = true;
          // Re-evaluate strategy gates and SOP score with live tick price!
          const updatedAnalysis = row.analysis
            ? reEvaluateWithLivePrice(row.analysis, livePrice)
            : undefined;

          return computeRowDataFromAnalysis(
            row.symbol,
            row.name,
            livePrice,
            updatedAnalysis,
            tradingMode as TradingMode,
            row
          );
        }
        return row;
      });
      return changed ? next : prev;
    });
  }, [tickersMap, tradingMode]);

  const filteredRows = heatmapData.filter((r) => {
    if (filter === 'BULLISH') return r.overallDir === 'BUY' || (r.tf1 === 'BULL' && r.tf2 === 'BULL');
    if (filter === 'BEARISH') return r.overallDir === 'SELL' || (r.tf1 === 'BEAR' && r.tf2 === 'BEAR');
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-5 md:p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-950/80 border border-amber-500/80 rounded-2xl flex items-center justify-center text-amber-400 shrink-0">
            <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg md:text-xl font-black text-white flex items-center gap-2">
                الخريطة الحرارية المباشرة (Live Trend Heatmap)
              </h2>
              <span
                className={`text-[10px] sm:text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                  isScalp
                    ? 'bg-amber-950 text-amber-300 border-amber-600/80'
                    : 'bg-teal-950 text-teal-300 border-teal-600/80'
                }`}
              >
                {isScalp ? <Flame className="w-3 h-3 fill-amber-300 text-amber-200 animate-pulse" /> : <Layers className="w-3 h-3 text-cyan-400" />}
                <span>{isScalp ? 'وضع المضاربة (1H/15M/5M/1M)' : 'وضع اليومي (4H/1H/15M/5M)'}</span>
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
              <span>تحديث وحركة حية تلقائية متزامنة لحظة بلحظة عبر WebSocket.</span>
              <span className="text-emerald-400 font-mono text-[10px] sm:text-[11px] flex items-center gap-1 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                {isWsLive ? 'بث حي متصل (OKX Live)' : 'جاري الاتصال...'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${filter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
            >
              الكل
            </button>
            <button
              onClick={() => setFilter('BULLISH')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${filter === 'BULLISH' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'text-slate-400'}`}
            >
              صاعد 🟢
            </button>
            <button
              onClick={() => setFilter('BEARISH')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${filter === 'BEARISH' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'text-slate-400'}`}
            >
              هابط 🔴
            </button>
          </div>

          <button
            onClick={fetchHeatmapData}
            disabled={loading}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Heatmap Grid Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-3 sm:space-y-4 shadow-xl">
        <div className="flex justify-between items-center text-[11px] sm:text-xs text-slate-400 font-bold flex-wrap gap-2">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            تتحدث الألوان والاتجاهات تلقائياً مع حركة كل نقطة سعرية (Tick-by-Tick)
          </span>
          {lastScan && <span className="font-mono text-[10px] sm:text-[11px]">آخر مسح: {lastScan}</span>}
        </div>

        {loading && heatmapData.length === 0 ? (
          <div className="p-8 sm:p-12 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-slate-300">جاري مسح وحساب الخريطة الحرارية لجميع الأزواج...</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80 scrollbar-thin">
            <table className="w-full min-w-[700px] text-right text-xs md:text-sm">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3">الزوج</th>
                  <th className="p-3">السعر الحالي (لحظي)</th>
                  <th className="p-3 text-center">{isScalp ? 'اتجاه 1H' : 'اتجاه 4H'}</th>
                  <th className="p-3 text-center">{isScalp ? 'زخم 15M' : 'زخم 1H'}</th>
                  <th className="p-3 text-center">{isScalp ? 'تصحيح 5M' : 'تصحيح 15M'}</th>
                  <th className="p-3 text-center">{isScalp ? 'تفعيل 1M' : 'تفعيل 5M'}</th>
                  <th className="p-3 text-center">مصفوفة التوافق (Confluence)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRows.map((row) => {
                  const CellBadge = ({ state }: { state: 'BULL' | 'BEAR' | 'NEUTRAL' }) => {
                    if (state === 'BULL') {
                      return (
                        <span className="px-3 py-1 rounded-lg text-xs font-black bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 inline-flex items-center gap-1 shadow-sm">
                          <ArrowUpRight className="w-3.5 h-3.5" /> صاعد 🟢
                        </span>
                      );
                    }
                    if (state === 'BEAR') {
                      return (
                        <span className="px-3 py-1 rounded-lg text-xs font-black bg-rose-950/90 text-rose-300 border border-rose-700/80 inline-flex items-center gap-1 shadow-sm">
                          <ArrowDownRight className="w-3.5 h-3.5" /> هابط 🔴
                        </span>
                      );
                    }
                    return (
                      <span className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-950/70 text-amber-300 border border-amber-700/60 inline-flex items-center gap-1">
                        <Minus className="w-3.5 h-3.5" /> عرضي 🟡
                      </span>
                    );
                  };

                  const isUp = row.priceDirection === 'UP';
                  const isDown = row.priceDirection === 'DOWN';

                  return (
                    <tr
                      key={row.symbol}
                      onClick={() => onSelectSymbol(row.symbol)}
                      className="hover:bg-slate-800/60 transition cursor-pointer"
                    >
                      <td className="p-3 font-extrabold text-white flex items-center gap-2">
                        <span className="text-base">{row.symbol.replace('USDT', '')}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({row.symbol})</span>
                      </td>

                      <td className="p-3 font-mono font-black">
                        <span
                          className={`px-2 py-1 rounded transition-colors duration-300 ${
                            isUp
                              ? 'bg-emerald-950 text-emerald-300 font-extrabold border border-emerald-800'
                              : isDown
                              ? 'bg-rose-950 text-rose-300 font-extrabold border border-rose-800'
                              : 'text-slate-200'
                          }`}
                        >
                          ${row.price < 1 ? row.price.toFixed(6) : row.price.toFixed(2)}
                          {isUp && ' ⬆'}
                          {isDown && ' ⬇'}
                        </span>
                      </td>

                      <td className="p-3 text-center"><CellBadge state={row.tf1} /></td>
                      <td className="p-3 text-center"><CellBadge state={row.tf2} /></td>
                      <td className="p-3 text-center"><CellBadge state={row.tf3} /></td>
                      <td className="p-3 text-center"><CellBadge state={row.tf4} /></td>

                      <td className="p-3 text-center font-mono font-black">
                        <span
                          className={`px-3 py-1 rounded-lg border ${
                            row.overallScore >= 80
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-500 font-extrabold animate-pulse shadow-md shadow-emerald-950/80'
                              : row.overallScore >= 60
                              ? 'bg-cyan-950 text-cyan-300 border-cyan-600'
                              : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          {row.overallScore}/100 ({row.confluenceGrade})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

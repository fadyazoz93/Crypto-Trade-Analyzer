import React, { useState, useEffect, useMemo } from 'react';
import { 
  PaperPortfolio, 
  VirtualTrade, 
  getPaperPortfolio, 
  closeTradeManually, 
  resetPaperPortfolio, 
  openVirtualTrade, 
  updateTradeWithLiveTick, 
  fetchPaperPortfolioFromTurso, 
  checkCircuitBreakersStatus, 
  savePaperPortfolio,
  cancelPendingOrder,
  executePendingNowAtMarket
} from '../utils/paperTradingStore';
import { useOkxAllTickersWebSocket } from '../utils/useOkxWebSocket';
import { checkTursoConnection, savePortfolioToTurso, TursoConnectionStatus } from '../utils/tursoSync';
import { getStrategySettings } from '../utils/settingsStore';
import { calculateInstitutionalRiskSizing } from '../utils/institutionalRiskEngine';
import { OnChartHUD } from './OnChartHUD';
import { 
  Briefcase, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  ShieldAlert, 
  DollarSign, 
  Award, 
  RefreshCw, 
  XCircle, 
  Plus, 
  Activity, 
  CheckCircle2, 
  Database, 
  Zap, 
  Lock, 
  ShieldCheck, 
  Cloud,
  Clock,
  ArrowRightLeft,
  UploadCloud,
  DownloadCloud,
  X
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface PaperTradingManagerProps {
  onSelectSymbol?: (symbol: string) => void;
  onOpenSettings?: () => void;
}

export const PaperTradingManager: React.FC<PaperTradingManagerProps> = ({ onSelectSymbol, onOpenSettings }) => {
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(getPaperPortfolio());
  const [tursoConnected, setTursoConnected] = useState<boolean | null>(null);
  const [tursoStatus, setTursoStatus] = useState<TursoConnectionStatus | null>(null);
  const [showTursoModal, setShowTursoModal] = useState(false);
  const [isSyncingTurso, setIsSyncingTurso] = useState(false);
  const [tursoSyncFeedback, setTursoSyncFeedback] = useState<string | null>(null);
  const [showNewTradeModal, setShowNewTradeModal] = useState(false);
  const [orderMode, setOrderMode] = useState<'MARKET' | 'LIMIT'>('LIMIT');

  // 2-Way Sync with Turso DB
  useEffect(() => {
    let mounted = true;

    async function syncTurso() {
      const conn = await checkTursoConnection();
      if (mounted) {
        setTursoConnected(conn.connected);
        setTursoStatus(conn);
      }

      if (conn.connected) {
        const remotePortfolio = await fetchPaperPortfolioFromTurso();
        if (remotePortfolio && mounted) {
          setPortfolio((prev) => {
            const prevOpenIds = prev.openTrades.map((t) => t.id).sort().join(',');
            const remoteOpenIds = remotePortfolio.openTrades.map((t) => t.id).sort().join(',');
            const prevClosedCount = prev.closedTrades.length;
            const remoteClosedCount = remotePortfolio.closedTrades.length;

            if (
              prevOpenIds !== remoteOpenIds ||
              prevClosedCount !== remoteClosedCount ||
              Math.abs(prev.cashBalance - remotePortfolio.cashBalance) > 0.01
            ) {
              return remotePortfolio;
            }
            return prev;
          });
        }
      }
    }

    syncTurso();
    const interval = setInterval(syncTurso, 10000);

    const handleSyncTrigger = () => syncTurso();
    window.addEventListener('focus', handleSyncTrigger);
    document.addEventListener('visibilitychange', handleSyncTrigger);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', handleSyncTrigger);
      document.removeEventListener('visibilitychange', handleSyncTrigger);
    };
  }, []);

  const handleManualTursoSync = async () => {
    setIsSyncingTurso(true);
    setTursoSyncFeedback('جاري المزامنة مع Turso Cloud...');
    try {
      // 1. Save local portfolio to cloud
      const current = getPaperPortfolio();
      await savePortfolioToTurso(current);
      // 2. Fetch latest from cloud
      const remote = await fetchPaperPortfolioFromTurso();
      if (remote) {
        setPortfolio(remote);
      }
      // 3. Update status
      const conn = await checkTursoConnection(true);
      setTursoConnected(conn.connected);
      setTursoStatus(conn);
      setTursoSyncFeedback(`✅ تم حفظ واسترجاع الصفقات بنجاح من Turso Cloud (${conn.totalTradesLogged ?? 0} صفقة في السحابة)`);
    } catch {
      setTursoSyncFeedback('⚠️ تعذر إتمام المزامنة مع Turso');
    } finally {
      setIsSyncingTurso(false);
      setTimeout(() => setTursoSyncFeedback(null), 4000);
    }
  };

  // Quick Trade Entry Modal Form State
  const [sym, setSym] = useState('BTCUSDT');
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [entryPrice, setEntryPrice] = useState('65000');
  const [slPrice, setSlPrice] = useState('64000');
  const [tp1Price, setTp1Price] = useState('66000');
  const [tp2Price, setTp2Price] = useState('68000');
  const [allocAmount, setAllocAmount] = useState('1000');

  // WebSocket Live Price Streaming
  const openSymbolsString = portfolio.openTrades
    .map((t) => t.symbol.toUpperCase())
    .sort()
    .join(',');

  const openSymbolsKey = useMemo(() => {
    const syms = Array.from(new Set(portfolio.openTrades.map((t) => t.symbol.toUpperCase())));
    return syms.length > 0 ? syms : ['BTCUSDT'];
  }, [openSymbolsString]);

  const { tickersMap, status: wsStatus } = useOkxAllTickersWebSocket(openSymbolsKey);
  const isWsLive = wsStatus === 'CONNECTED';

  // Live Tick updates
  useEffect(() => {
    if (!tickersMap || Object.keys(tickersMap).length === 0 || portfolio.openTrades.length === 0) return;
    setPortfolio((prev) => {
      let current = prev;
      let hasChange = false;
      for (const trade of prev.openTrades) {
        const live = tickersMap[trade.symbol.toUpperCase()];
        if (live && live > 0 && live !== trade.currentPrice) {
          current = updateTradeWithLiveTick(current, trade.symbol, live);
          hasChange = true;
        }
      }
      return hasChange ? current : prev;
    });
  }, [tickersMap]);

  // Separate active vs pending orders
  const pendingOrders = useMemo(() => {
    return portfolio.openTrades.filter((t) => t.status === 'PENDING_ENTRY');
  }, [portfolio.openTrades]);

  const activeFilledTrades = useMemo(() => {
    return portfolio.openTrades.filter((t) => t.status !== 'PENDING_ENTRY');
  }, [portfolio.openTrades]);

  const totalOpenPnlUsdt = activeFilledTrades.reduce((acc, t) => acc + t.pnlUsdt, 0);
  const totalOpenAlloc = portfolio.openTrades.reduce((acc, t) => acc + t.allocatedAmount, 0);
  const totalEquity = portfolio.cashBalance + totalOpenAlloc + totalOpenPnlUsdt;
  const totalNetPnlUsdt = totalEquity - portfolio.initialBalance;
  const totalNetPnlPercent = (totalNetPnlUsdt / portfolio.initialBalance) * 100;

  const closedWins = portfolio.closedTrades.filter((t) => t.pnlUsdt > 0);
  const closedLosses = portfolio.closedTrades.filter((t) => t.pnlUsdt <= 0);

  const winRate = portfolio.closedTrades.length > 0
    ? (closedWins.length / portfolio.closedTrades.length) * 100
    : 0;

  const grossWins = closedWins.reduce((acc, t) => acc + t.pnlUsdt, 0);
  const grossLosses = Math.abs(closedLosses.reduce((acc, t) => acc + t.pnlUsdt, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99 : 0;

  const handleManualClose = (tradeId: string) => {
    const updated = closeTradeManually(portfolio, tradeId);
    setPortfolio(updated);
  };

  const handleCancelPending = (tradeId: string) => {
    const updated = cancelPendingOrder(portfolio, tradeId);
    setPortfolio(updated);
  };

  const handleExecutePendingNow = (tradeId: string) => {
    const trade = portfolio.openTrades.find((t) => t.id === tradeId);
    const livePrice = trade ? tickersMap[trade.symbol.toUpperCase()] || trade.currentPrice : undefined;
    const updated = executePendingNowAtMarket(portfolio, tradeId, livePrice);
    setPortfolio(updated);
  };

  const handleReset = () => {
    if (confirm('هل أنت متأكد من إعادة تعيين جميع صفقات وسجل المحفظة الافتراضية؟')) {
      const reset = resetPaperPortfolio(10000);
      setPortfolio(reset);
    }
  };

  const handleCreateTradeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(entryPrice);
    const sl = parseFloat(slPrice);
    const tp1 = parseFloat(tp1Price);
    const tp2 = parseFloat(tp2Price);
    const alloc = parseFloat(allocAmount);

    if (!p || !sl || !tp1 || !tp2 || !alloc) {
      alert('يرجى إدخال قيم صحيحة للأسعار والمبلغ.');
      return;
    }

    const isPending = orderMode === 'LIMIT';
    const livePrice = tickersMap[sym.toUpperCase()] || p;

    openVirtualTrade(
      sym.toUpperCase(),
      tradeType,
      p,
      sl,
      tp1,
      tp2,
      alloc,
      5,
      {
        orderType: orderMode,
        isPending,
        currentMarketPrice: livePrice,
      }
    );

    setPortfolio(getPaperPortfolio());
    setShowNewTradeModal(false);
  };

  const circuitBreaker = checkCircuitBreakersStatus(portfolio);

  return (
    <div className="space-y-6 text-right">
      {/* Top On-Chart Live HUD */}
      <OnChartHUD
        portfolio={portfolio}
        selectedSymbol={portfolio.openTrades[0]?.symbol || 'BTCUSDT'}
        onOpenSettings={onOpenSettings}
      />

      {/* Header & Controls Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-950/80 border border-emerald-500/80 rounded-2xl flex items-center justify-center text-emerald-400 font-bold">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">المحفظة الافتراضية وسجل الصفقات (Paper Trading V9.00)</h2>
              <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-mono px-2 py-0.5 rounded-full font-bold">
                Confluence Pro
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>إدارة مخاطر مؤسسية مع إغلاق 50% عند 1:1 R:R ونقل الستوب للدخول (Break-Even)</span>
              {tursoConnected !== null && (
                <button
                  type="button"
                  onClick={() => setShowTursoModal(true)}
                  className={`inline-flex items-center gap-1 font-mono text-[10px] px-2.5 py-0.5 rounded-full transition cursor-pointer ${
                    tursoConnected 
                      ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700 hover:bg-emerald-900/90' 
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                  title="عرض تفاصيل واتصال قاعدة بيانات Turso Cloud"
                >
                  <Database className="w-3 h-3 text-emerald-400" />
                  <span>{tursoConnected ? 'Turso Cloud ☁️ متصل' : 'حفظ محلي'}</span>
                  {tursoStatus?.totalTradesLogged !== undefined && (
                    <span className="bg-emerald-900/80 text-emerald-200 px-1.5 py-0.2 text-[9px] rounded-full font-bold">
                      {tursoStatus.totalTradesLogged} صفقة
                    </span>
                  )}
                </button>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
          <button
            onClick={handleManualTursoSync}
            disabled={isSyncingTurso}
            className="flex-1 sm:flex-none px-3.5 py-2.5 bg-slate-950 hover:bg-slate-850 text-emerald-400 hover:text-emerald-300 border border-emerald-900/60 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            title="مزامنة فورية وحفظ الصفقات في قاعدة بيانات Turso السحابية"
          >
            <Cloud className={`w-4 h-4 text-emerald-400 ${isSyncingTurso ? 'animate-pulse' : ''}`} />
            <span>{isSyncingTurso ? 'جاري المزامنة...' : 'مزامنة Turso ☁️'}</span>
          </button>

          <button
            onClick={() => setShowNewTradeModal(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صفقة افتراضية</span>
          </button>

          <button
            onClick={handleReset}
            className="px-3 py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            title="إعادة تعيين المحفظة"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تصفير</span>
          </button>
        </div>
      </div>

      {/* Turso Cloud Sync Feedback Toast */}
      {tursoSyncFeedback && (
        <div className="bg-emerald-950/90 border border-emerald-600 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{tursoSyncFeedback}</span>
          </div>
          <button onClick={() => setTursoSyncFeedback(null)} className="text-emerald-400 hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Total Equity Card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-xs font-bold text-slate-400 flex items-center justify-between">
            <span>إجمالي سيولة المحفظة:</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </span>
          <div className="text-xl md:text-2xl font-mono font-black text-white">
            ${totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
            <span>كاش متاح:</span>
            <span className="text-slate-200 font-mono">${portfolio.cashBalance.toFixed(2)}</span>
          </div>
        </div>

        {/* Net PnL Card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-xs font-bold text-slate-400 flex items-center justify-between">
            <span>صافي الأرباح الكلية:</span>
            {totalNetPnlUsdt >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400" />
            )}
          </span>
          <div className={`text-xl md:text-2xl font-mono font-black ${totalNetPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalNetPnlUsdt >= 0 ? '+' : ''}${totalNetPnlUsdt.toFixed(2)}
          </div>
          <div className={`text-[11px] font-bold ${totalNetPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalNetPnlPercent >= 0 ? '+' : ''}{totalNetPnlPercent.toFixed(2)}% من رأس المال
          </div>
        </div>

        {/* Win Rate Card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-xs font-bold text-slate-400 flex items-center justify-between">
            <span>نسبة الصفقات الرابحة:</span>
            <Award className="w-4 h-4 text-amber-400" />
          </span>
          <div className="text-xl md:text-2xl font-mono font-black text-amber-400">
            {winRate.toFixed(1)}%
          </div>
          <div className="text-[11px] font-bold text-slate-400">
            {closedWins.length} صفقة رابحة / {portfolio.closedTrades.length} صفقات مغلقة
          </div>
        </div>

        {/* Profit Factor Card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-xs font-bold text-slate-400 flex items-center justify-between">
            <span>معامل الربحية (Profit Factor):</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </span>
          <div className="text-xl md:text-2xl font-mono font-black text-cyan-400">
            {profitFactor.toFixed(2)}
          </div>
          <div className="text-[11px] font-bold text-slate-400">
            الصفقات النشطة الآن: {portfolio.openTrades.length}
          </div>
        </div>
      </div>

      {/* PnL Equity Curve Chart */}
      {portfolio.equityHistory.length > 1 && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
          <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>رسم بياني لنمو رأس المال (Portfolio Equity Curve):</span>
          </h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={portfolio.equityHistory}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#equityGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Pending Orders Waiting for Execution */}
      {pendingOrders.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-500/50 rounded-2xl overflow-hidden p-5 space-y-4 shadow-lg">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-base font-extrabold text-amber-400 flex items-center gap-2">
              <Clock className="w-5 h-5 animate-spin" />
              <span>الأوامر المعلقة في انتظار وصول السعر المحدد ({pendingOrders.length})</span>
            </h3>
            <span className="text-xs text-amber-300 font-bold bg-amber-950/60 px-3 py-1 rounded-lg border border-amber-800/80">
              تفعيل آلي فور ملامسة السعر ⏳
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingOrders.map((trade) => {
              const isBuy = trade.type === 'BUY';
              const livePrice = tickersMap[trade.symbol.toUpperCase()] || trade.currentPrice;
              const distancePercent = (((trade.entryPrice - livePrice) / livePrice) * 100).toFixed(2);

              return (
                <div 
                  key={trade.id}
                  className="bg-slate-950/90 border border-amber-500/30 p-4 rounded-xl space-y-3 relative"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectSymbol && onSelectSymbol(trade.symbol)}
                        className="font-black text-white text-base hover:text-amber-400 cursor-pointer"
                      >
                        {trade.symbol}
                      </button>
                      <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] ${
                        isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}>
                        {isBuy ? 'BUY LIMIT ⏳' : 'SELL LIMIT ⏳'}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800">
                      هامش محجوز: ${trade.allocatedAmount}
                    </span>
                  </div>

                  {/* Pricing Comparison */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-2.5 rounded-lg text-center font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-amber-300 font-sans block">سعر الدخول المطلوب</span>
                      <span className="text-white font-black">${trade.entryPrice}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">السعر الحالي</span>
                      <span className="text-slate-200 font-bold">${livePrice}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-cyan-400 font-sans block">المسافة للتفعيل</span>
                      <span className="text-cyan-300 font-bold">{Number(distancePercent) > 0 ? `+${distancePercent}%` : `${distancePercent}%`}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleExecutePendingNow(trade.id)}
                      className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1 shadow"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>تنفيذ فوري الآن بسعر السوق</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancelPending(trade.id)}
                      className="py-1.5 px-3 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold text-xs rounded-lg transition cursor-pointer"
                    >
                      إلغاء واسترجاع الهامش ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Open Trades Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-5 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
            <span>الصفقات النشطة المفتوحة ({activeFilledTrades.length})</span>
          </h3>
          <span className="text-xs text-slate-400 font-bold bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
            تحديث لحظي عبر WebSocket ⚡
          </span>
        </div>

        {activeFilledTrades.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-slate-950/60 rounded-xl border border-slate-800/80 text-sm">
            {pendingOrders.length > 0 
              ? 'يوجد أوامر معلقة في الأعلى قيد انتظار وصول السعر المحدد للتفعيل.' 
              : 'لا توجد صفقات مفتوحة حالياً. يمكنك فتح صفقة بنقرة واحدة عند ظهور إشارة توافق مؤكدة.'}
          </div>
        ) : (
          <>
            {/* Mobile Cards View (Visible on small screens) */}
            <div className="space-y-3 md:hidden">
              {activeFilledTrades.map((trade) => {
                const isBuy = trade.type === 'BUY';
                const isProfit = trade.pnlUsdt >= 0;

                return (
                  <div 
                    key={trade.id} 
                    className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 shadow-md"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectSymbol && onSelectSymbol(trade.symbol)}
                          className="font-black text-white text-base hover:text-emerald-400 text-right cursor-pointer"
                        >
                          {trade.symbol}
                        </button>
                        <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] ${
                          isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {isBuy ? 'BUY 🟢' : 'SELL 🔴'}
                        </span>
                      </div>

                      <div className={`font-mono font-black text-sm ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? '+' : ''}${trade.pnlUsdt.toFixed(2)}
                        <span className="text-[10px] mr-1">({isProfit ? '+' : ''}{trade.pnlPercent.toFixed(2)}%)</span>
                      </div>
                    </div>

                    {/* Price Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-2.5 rounded-lg text-center font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-sans block">سعر الدخول</span>
                        <span className="text-slate-200 font-bold">${trade.entryPrice}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-sans block">السعر اللحظي</span>
                        <span className="text-white font-black">${trade.currentPrice}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-rose-400 font-sans block">وقف الخسارة</span>
                        <span className="text-rose-400 font-bold">${trade.stopLoss}</span>
                      </div>
                    </div>

                    {/* Scale-Out / Break-Even Status & Actions */}
                    <div className="flex justify-between items-center gap-2 pt-1">
                      <div className="text-[11px]">
                        {trade.isScaleOutDone ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-bold">
                            🎯 تم إغلاق 50% (+${trade.scaleOutPnlUsdt?.toFixed(1)})
                          </span>
                        ) : trade.isBreakEvenTriggered ? (
                          <span className="text-cyan-400 font-bold text-[10px]">🛡️ تأمين BE مفعّل</span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">هامش: ${trade.allocatedAmount.toFixed(1)}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleManualClose(trade.id)}
                        className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-bold transition cursor-pointer"
                      >
                        إغلاق الصفقة ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Wide Table (Hidden on small screens) */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800/80 scrollbar-thin">
              <table className="w-full min-w-[760px] text-right text-xs md:text-sm">
                <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3">الزوج والعقد</th>
                    <th className="p-3">النوع</th>
                    <th className="p-3">الدخول</th>
                    <th className="p-3">السعر اللحظي</th>
                    <th className="p-3">الوقف (SL)</th>
                    <th className="p-3">الهدف 1 (TP1)</th>
                    <th className="p-3">حالة الإدارة (Scale-Out/BE)</th>
                    <th className="p-3">الربح/الخسارة اللحظية</th>
                    <th className="p-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {activeFilledTrades.map((trade) => {
                    const isBuy = trade.type === 'BUY';
                    const isProfit = trade.pnlUsdt >= 0;

                    return (
                      <tr key={trade.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3 font-extrabold text-white">
                          <button
                            onClick={() => onSelectSymbol && onSelectSymbol(trade.symbol)}
                            className="hover:text-emerald-400 cursor-pointer flex flex-col items-start"
                          >
                            <span className="font-bold">{trade.symbol}</span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              {trade.quantity} لوت | هامش ${trade.allocatedAmount.toFixed(1)}
                            </span>
                          </button>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[11px] ${isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
                            {isBuy ? 'BUY 🟢' : 'SELL 🔴'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-300">${trade.entryPrice}</td>
                        <td className="p-3 font-black text-white">${trade.currentPrice}</td>
                        <td className="p-3 text-rose-400">
                          ${trade.stopLoss}
                          {trade.isBreakEvenTriggered && (
                            <span className="block text-[10px] text-cyan-400 font-sans font-bold">
                              🛡️ تأمين BE
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-emerald-400">${trade.takeProfit1}</td>
                        <td className="p-3 font-sans">
                          {trade.isScaleOutDone ? (
                            <div className="space-y-0.5">
                              <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700 text-[10px] font-bold inline-block">
                                🎯 تم إغلاق 50% (+${trade.scaleOutPnlUsdt?.toFixed(1)})
                              </span>
                              <span className="block text-[10px] text-slate-400 font-mono">
                                متبقي 50% مع ATR Trailing
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              في انتظار 1:1 R:R للإغلاق الجزئي
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-bold">
                          <div className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                            {isProfit ? '+' : ''}${trade.pnlUsdt.toFixed(2)}
                            <span className="text-[11px] mr-1">({isProfit ? '+' : ''}{trade.pnlPercent.toFixed(2)}%)</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleManualClose(trade.id)}
                            className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            إغلاق ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Closed Trades Journal Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-5 space-y-4">
        <h3 className="text-base font-extrabold text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-cyan-400" />
          <span>سجل الصفقات المنتهية والأرباح المحققة ({portfolio.closedTrades.length})</span>
        </h3>

        {portfolio.closedTrades.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-slate-950/60 rounded-xl border border-slate-800/80 text-sm">
            لا توجد صفقات مغلقة بعد في السجل.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80 scrollbar-thin">
            <table className="w-full min-w-[700px] text-right text-xs md:text-sm">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3">الزوج</th>
                  <th className="p-3">النوع</th>
                  <th className="p-3">الدخول</th>
                  <th className="p-3">سعر الخروج</th>
                  <th className="p-3">سبب الخروج</th>
                  <th className="p-3">الربح/الخسارة الصافية</th>
                  <th className="p-3">وقت الإغلاق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {portfolio.closedTrades.map((trade) => {
                  const isBuy = trade.type === 'BUY';
                  const isProfit = trade.pnlUsdt >= 0;

                  return (
                    <tr key={trade.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-extrabold text-white">{trade.symbol}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-extrabold text-[11px] ${isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">${trade.entryPrice}</td>
                      <td className="p-3 font-black text-white">${trade.exitPrice || trade.currentPrice}</td>
                      <td className="p-3 font-sans font-bold text-xs">
                        {trade.status === 'CLOSED_TP2' && <span className="text-cyan-400">🎯 الهدف الكامل TP2</span>}
                        {trade.status === 'CLOSED_SCALE_OUT_RUNNER' && <span className="text-emerald-400">🛡️ تأمين الدخول (بعد 50% Scale-Out)</span>}
                        {trade.status === 'CLOSED_TP1' && <span className="text-emerald-400">🎯 الهدف الأول TP1</span>}
                        {trade.status === 'CLOSED_BREAKEVEN' && <span className="text-cyan-400">🛡️ تأمين الدخول BE</span>}
                        {trade.status === 'CLOSED_TRAILING' && <span className="text-teal-400">📈 وقف متحرك ATR</span>}
                        {trade.status === 'CLOSED_SL' && <span className="text-rose-400">🛑 وقف الخسارة SL</span>}
                        {trade.status === 'CLOSED_FRIDAY_GAP_GUARD' && <span className="text-purple-400">🛡️ إغلاق فجوات الجمعة 20:00 UTC</span>}
                        {trade.status === 'CLOSED_MANUAL' && <span className="text-slate-400">✋ إغلاق يدوي</span>}
                      </td>
                      <td className="p-3 font-bold">
                        <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                          {isProfit ? '+' : ''}${trade.pnlUsdt.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 text-xs">{trade.closeTime || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Trade Entry Modal */}
      {showNewTradeModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateTradeSubmit} className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>فتح صفقة افتراضية جديدة</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewTradeModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">طريقة الدخول والتنفيذ:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderMode('LIMIT')}
                    className={`py-2 px-3 rounded-xl font-bold border text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${orderMode === 'LIMIT' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>أمر معلق (Limit)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderMode('MARKET')}
                    className={`py-2 px-3 rounded-xl font-bold border text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${orderMode === 'MARKET' ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>دخول فوري (Market)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">رمز الزوج / السلعة:</label>
                <input
                  type="text"
                  value={sym}
                  onChange={(e) => setSym(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl font-mono text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">نوع الصفقة:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTradeType('BUY')}
                    className={`py-2 rounded-xl font-bold border transition cursor-pointer ${tradeType === 'BUY' ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                  >
                    شراء (BUY)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradeType('SELL')}
                    className={`py-2 rounded-xl font-bold border transition cursor-pointer ${tradeType === 'SELL' ? 'bg-rose-500 text-slate-950 border-rose-400' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                  >
                    بيع (SELL)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">سعر الدخول ($):</label>
                  <input
                    type="number"
                    step="any"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">المبلغ المخصص ($):</label>
                  <input
                    type="number"
                    value={allocAmount}
                    onChange={(e) => setAllocAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl font-mono text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-rose-400 mb-1 font-bold">الوقف SL ($):</label>
                  <input
                    type="number"
                    step="any"
                    value={slPrice}
                    onChange={(e) => setSlPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 p-2 rounded-xl font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-emerald-400 mb-1 font-bold">الهدف TP1 ($):</label>
                  <input
                    type="number"
                    step="any"
                    value={tp1Price}
                    onChange={(e) => setTp1Price(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 p-2 rounded-xl font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-cyan-400 mb-1 font-bold">الهدف TP2 ($):</label>
                  <input
                    type="number"
                    step="any"
                    value={tp2Price}
                    onChange={(e) => setTp2Price(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 p-2 rounded-xl font-mono text-white"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-sm transition cursor-pointer"
              >
                دخول الصفقة الافتراضية الآن 🚀
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Turso Cloud Database Management Modal */}
      {showTursoModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-6 space-y-5 shadow-2xl text-right">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-500/80 flex items-center justify-center text-emerald-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">قاعدة بيانات الصفقات Turso SQLite Cloud</h3>
                  <p className="text-[11px] text-slate-400">حفظ واسترجاع صفقات التداول وإشارات السوق آلياً</p>
                </div>
              </div>
              <button
                onClick={() => setShowTursoModal(false)}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Connection Info */}
            <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-bold">حالة الاتصال بالسيرفر:</span>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 ${
                  tursoStatus?.connected 
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' 
                    : 'bg-amber-950 text-amber-300 border border-amber-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${tursoStatus?.connected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                  {tursoStatus?.connected ? 'متصل بالسحابة بنجاح ☁️' : 'غير متصل أو جاري التحقق'}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 block font-mono">سيرفر قاعدة البيانات (Turso Host):</span>
                <div className="font-mono text-xs font-bold text-emerald-400 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 select-all truncate">
                  {tursoStatus?.host || 'okx-crypto-analyzer-fadyezzaat.aws-eu-west-1.turso.io'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-center font-mono">
                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 block">إجمالي الصفقات بالسحابة</span>
                  <span className="text-lg font-black text-white">{tursoStatus?.totalTradesLogged ?? 0}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 block">إشارات التداول المسجلة</span>
                  <span className="text-lg font-black text-cyan-400">{tursoStatus?.totalSignalsLogged ?? 0}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 block">إجراءات المزامنة السحابية:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSyncingTurso}
                  onClick={async () => {
                    await handleManualTursoSync();
                    setShowTursoModal(false);
                  }}
                  className="px-3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>حفظ الصفقات في السحابة ☁️</span>
                </button>

                <button
                  type="button"
                  disabled={isSyncingTurso}
                  onClick={async () => {
                    setIsSyncingTurso(true);
                    const remote = await fetchPaperPortfolioFromTurso();
                    if (remote) {
                      setPortfolio(remote);
                      setTursoSyncFeedback(`✅ تم استرجاع ${remote.openTrades.length} صفقة مفتوحة و ${remote.closedTrades.length} صفقة مغلقة من Turso`);
                    } else {
                      setTursoSyncFeedback('لم يتم العثور على صفقات مسجلة في السحابة.');
                    }
                    setIsSyncingTurso(false);
                    setShowTursoModal(false);
                  }}
                  className="px-3 py-2.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 hover:text-white border border-cyan-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>استرجاع الصفقات من Turso 📥</span>
                </button>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const res = await checkTursoConnection(true);
                  setTursoStatus(res);
                  setTursoConnected(res.connected);
                }}
                className="w-full py-2 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة فحص وتحديث حالة الاتصال</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { runHistoricalBacktest, BacktestReport } from '../utils/backtestEngine';
import { SymbolInfo } from '../types';
import { Play, RotateCcw, TrendingUp, TrendingDown, ShieldAlert, Award, Activity, Calendar, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface BacktestingEngineProps {
  symbols: SymbolInfo[];
  selectedSymbol: string;
}

export const BacktestingEngine: React.FC<BacktestingEngineProps> = ({ symbols, selectedSymbol }) => {
  const [sym, setSym] = useState(selectedSymbol);
  const [periodDays, setPeriodDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runHistoricalBacktest(sym, periodDays, 10000);
      setReport(res);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'فشل إجراء الاختبار الرجعي على البيانات التاريخية.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-wrap justify-between items-center gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-cyan-950/80 border border-cyan-500/80 rounded-2xl flex items-center justify-center text-cyan-400">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              محرك الاختبار الرجعي (Historical Backtesting Engine)
            </h2>
            <p className="text-xs text-slate-400">
              اختبار كفاءة استراتيجية التوافق ومربع التسعة على الشموع التاريخية (4H, 1H, 15M, 5M) لآخر 15 أو 30 أو 90 يوماً من منصة OKX.
            </p>
          </div>
        </div>

        {/* Form Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={sym}
            onChange={(e) => setSym(e.target.value)}
            disabled={loading}
            className="bg-slate-950 border border-slate-700 text-white px-3 py-2.5 rounded-xl font-bold text-xs outline-none cursor-pointer"
          >
            {symbols.map((item) => (
              <option key={item.symbol} value={item.symbol}>
                {item.icon} {item.name} ({item.symbol})
              </option>
            ))}
          </select>

          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            disabled={loading}
            className="bg-slate-950 border border-slate-700 text-white px-3 py-2.5 rounded-xl font-bold text-xs outline-none cursor-pointer"
          >
            <option value={15}>آخر 15 يوماً</option>
            <option value={30}>آخر 30 يوماً</option>
            <option value={60}>آخر 60 يوماً</option>
            <option value={90}>آخر 90 يوماً</option>
          </select>

          <button
            onClick={handleRunBacktest}
            disabled={loading}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-500/20"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-slate-950" />
            )}
            <span>{loading ? 'جاري الاختبار...' : 'تشغيل محاكاة الاختبار 🚀'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/80 border border-rose-500/80 p-4 rounded-xl text-rose-200 text-xs font-bold">
          ⚠️ {error}
        </div>
      )}

      {/* Backtest Report Output */}
      {report && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-xs font-bold text-slate-400 flex items-center justify-between">
                <span>العائد الصافي (ROI %):</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </span>
              <div className={`text-xl md:text-2xl font-mono font-black ${report.roiPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {report.roiPercent >= 0 ? '+' : ''}{report.roiPercent.toFixed(2)}%
              </div>
              <div className="text-[11px] font-bold text-slate-400">
                الأرباح الصافية: ${report.netProfitUsdt.toFixed(2)}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-xs font-bold text-slate-400 flex items-center justify-between">
                <span>نسبة النجاح (Win Rate):</span>
                <Award className="w-4 h-4 text-amber-400" />
              </span>
              <div className="text-xl md:text-2xl font-mono font-black text-amber-400">
                {report.winRate.toFixed(1)}%
              </div>
              <div className="text-[11px] font-bold text-slate-400">
                {report.winningTrades} رابحة / {report.totalTrades} صفقات
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-xs font-bold text-slate-400 flex items-center justify-between">
                <span>معامل الربحية (Profit Factor):</span>
                <Activity className="w-4 h-4 text-cyan-400" />
              </span>
              <div className="text-xl md:text-2xl font-mono font-black text-cyan-400">
                {report.profitFactor.toFixed(2)}
              </div>
              <div className="text-[11px] font-bold text-slate-400">
                {report.losingTrades} صفقات خاسرة
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-xs font-bold text-slate-400 flex items-center justify-between">
                <span>أقصى تراجع (Max Drawdown):</span>
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              </span>
              <div className="text-xl md:text-2xl font-mono font-black text-rose-400">
                -{report.maxDrawdownPercent.toFixed(2)}%
              </div>
              <div className="text-[11px] font-bold text-slate-400">
                رأس المال الابتدائي: ${report.initialCapital}
              </div>
            </div>
          </div>

          {/* Backtest Equity Curve Chart */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span>المنحنى التراكمي لنمو رأس المال في الاختبار الرجعي ({report.symbol}):</span>
            </h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={report.equityCurve}>
                  <defs>
                    <linearGradient id="btGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#btGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trade History Log Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-cyan-400" />
              <span>سجل الصفقات المنفذة تاريخياً ({report.trades.length})</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs md:text-sm">
                <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3">وقت الدخول</th>
                    <th className="p-3">النوع</th>
                    <th className="p-3">سعر الدخول</th>
                    <th className="p-3">الهدف 1/2</th>
                    <th className="p-3">الوقف SL</th>
                    <th className="p-3">نتيجة الصفقة</th>
                    <th className="p-3">العائد %</th>
                    <th className="p-3">وقت الخروج</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {report.trades.map((t) => {
                    const isWin = t.pnlPercent > 0;
                    return (
                      <tr key={t.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3 text-slate-300 text-xs">{t.entryTime}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[11px] ${t.type === 'BUY' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                            {t.type}
                          </span>
                        </td>
                        <td className="p-3 text-white font-bold">${t.entryPrice.toFixed(2)}</td>
                        <td className="p-3 text-emerald-400">${t.takeProfit1.toFixed(2)}</td>
                        <td className="p-3 text-rose-400">${t.stopLoss.toFixed(2)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                            t.result === 'TP2' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' :
                            t.result === 'TP1' ? 'bg-teal-950 text-teal-300 border border-teal-700' :
                            'bg-rose-950 text-rose-300 border border-rose-700'
                          }`}>
                            {t.result === 'TP2' ? 'TP2 ضرب الهدف 🎯🎯' :
                             t.result === 'TP1' ? 'TP1 ضرب الهدف 🎯' : 'SL ضرب الوقف 🛑'}
                          </span>
                        </td>
                        <td className={`p-3 font-extrabold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                        </td>
                        <td className="p-3 text-slate-400 text-xs">{t.exitTime}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

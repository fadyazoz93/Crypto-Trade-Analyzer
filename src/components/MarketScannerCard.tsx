import React from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus, 
  Gauge, 
  Compass, 
  Target, 
  Clock, 
  Zap, 
  Check, 
  Copy, 
  Briefcase, 
  ChevronRight 
} from 'lucide-react';
import { ScanItemResult, AnalysisResult } from '../types';

interface MarketScannerCardProps {
  item: ScanItemResult;
  onSelectSymbol: (symbol: string) => void;
  onCopyCardSignal: (e: React.MouseEvent, item: ScanItemResult) => void;
  copiedSymbol: string | null;
  onOpenExecution: (analysis: AnalysisResult) => void;
  isScalp: boolean;
}

export const MarketScannerCard = React.memo(
  function MarketScannerCard({
    item,
    onSelectSymbol,
    onCopyCardSignal,
    copiedSymbol,
    onOpenExecution,
    isScalp,
  }: MarketScannerCardProps) {
    const isBuy = item.decision === 'BUY';
    const isSell = item.decision === 'SELL';
    const matrix = item.analysis?.confluenceMatrix;
    const gann = item.analysis?.gannData || matrix?.gann;
    const tradeSetup = item.analysis?.trade_setup;
    const nearestGann = gann?.nearestGannSupport;
    const gannDist = nearestGann && nearestGann.price > 0 ? (Math.abs(item.price - nearestGann.price) / item.price * 100) : 0;

    return (
      <div
        onClick={() => onSelectSymbol(item.symbol)}
        className={`bg-slate-950/80 hover:bg-slate-950 p-3.5 sm:p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3.5 cursor-pointer relative overflow-hidden group shadow-lg ${
          isBuy
            ? 'border-emerald-500/60 hover:border-emerald-400 shadow-emerald-950/30'
            : isSell
            ? 'border-rose-500/60 hover:border-rose-400 shadow-rose-950/30'
            : 'border-slate-800 hover:border-slate-700'
        }`}
      >
        {/* Glowing background accent for active buy/sell signals */}
        {isBuy && (
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />
        )}
        {isSell && (
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-500" />
        )}

        {/* Top Row: Symbol Info & Decision Badge */}
        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 bg-slate-900 rounded-xl border border-slate-800/80 shadow-inner">
                {item.icon}
              </span>
              <div>
                <h3 className="font-extrabold text-white text-base flex items-center gap-1.5">
                  <span>{item.name}</span>
                  <bdi dir="ltr" className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    {item.symbol}
                  </bdi>
                </h3>
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-200 mt-0.5">
                  <span>سعر حقيقي:</span>
                  <span className="text-emerald-400 text-sm font-extrabold">
                    ${item.price.toFixed(item.price < 1 ? 6 : 2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Decision Badge & Confluence Matrix Pill */}
            <div className="flex flex-col items-end gap-1">
              <span
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black shadow-md ${
                  isBuy
                    ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400/30'
                    : isSell
                    ? 'bg-rose-500 text-white ring-2 ring-rose-400/30'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {isBuy ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : isSell ? (
                  <ArrowDownRight className="w-4 h-4" />
                ) : (
                  <Minus className="w-4 h-4" />
                )}
                <span>{isBuy ? 'شراء مؤكد 🟢' : isSell ? 'بيع مؤكد 🔴' : 'انتظار ⚪'}</span>
              </span>

              {matrix ? (
                <span className={`text-[10px] font-extrabold font-mono px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                  matrix.passed
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : matrix.totalScore >= 60
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}>
                  <Gauge className="w-3 h-3" />
                  <span>التوافق: {matrix.totalScore}/100 ({matrix.grade})</span>
                </span>
              ) : null}
            </div>
          </div>

          {/* Confluence Matrix Progress & 4-Grid Breakdown */}
          {matrix ? (
            <div className="space-y-2 pt-1 border-t border-slate-800/80">
              {/* Visual Progress Bar */}
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800/80">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    matrix.passed
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : matrix.totalScore >= 60
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                      : 'bg-slate-700'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, matrix.totalScore))}%` }}
                />
              </div>

              {/* 4-Grid Institutional Confluence Indicators */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {/* 1. Macro & Major Pivot */}
                <div
                  className={`p-2 rounded-xl border flex flex-col justify-between gap-1 ${
                    matrix.macroTrend.passed
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-slate-300">
                      <Compass className="w-3 h-3 text-cyan-400" />
                      <span>الاتجاه الكلي:</span>
                    </span>
                    <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-950/60 font-black">
                      {matrix.macroTrend.score}/20
                    </span>
                  </div>
                  <div className="font-bold text-[11px] truncate text-white">
                    {gann?.anchorSync?.waveDirection === 'BULLISH'
                      ? 'موجة صاعدة 🟢'
                      : gann?.anchorSync?.waveDirection === 'BEARISH'
                      ? 'موجة هابطة 🔴'
                      : isScalp ? 'إطار 1H/15M' : 'إطار 4H/1H'}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">
                    {gann?.refPivotPrice ? `ارتكاز P0: $${gann.refPivotPrice.toFixed(item.price < 1 ? 4 : 2)}` : `EMA 200: $${item.ema200_4h.toFixed(2)}`}
                  </div>
                </div>

                {/* 2. Gann Square of 9 Level */}
                <div
                  className={`p-2 rounded-xl border flex flex-col justify-between gap-1 ${
                    matrix.gannPriceLevel.passed
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-slate-300">
                      <Target className="w-3 h-3 text-amber-400" />
                      <span>مربع التسعة (Sq9):</span>
                    </span>
                    <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-950/60 font-black">
                      {matrix.gannPriceLevel.score}/25
                    </span>
                  </div>
                  <div className="font-bold text-[11px] truncate text-white">
                    {gann?.nearestGannSupport?.angleName || 'زوايا جان'}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">
                    {gannDist > 0 ? `انحراف: ${gannDist.toFixed(2)}%` : 'تفاعل مباشر ✓'}
                  </div>
                </div>

                {/* 3. Gann Time Cycle Harmonic */}
                <div
                  className={`p-2 rounded-xl border flex flex-col justify-between gap-1 ${
                    matrix.gannTimeCycle.passed
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      <span>التوافق الزمني:</span>
                    </span>
                    <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-950/60 font-black">
                      {matrix.gannTimeCycle.score}/15
                    </span>
                  </div>
                  <div className="font-bold text-[11px] truncate text-white">
                    {gann?.activeTimeAngle ? `زاوية ${gann.activeTimeAngle}` : 'دورة توافقية'}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">
                    {matrix.gannTimeCycle.passed ? 'زاوية متوافقة ✓' : 'بانتظار الشمعة'}
                  </div>
                </div>

                {/* 4. 5M Momentum & RSI */}
                <div
                  className={`p-2 rounded-xl border flex flex-col justify-between gap-1 ${
                    matrix.microMomentum.passed
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-slate-300">
                      <Zap className="w-3 h-3 text-yellow-400" />
                      <span>الزخم اللحظي:</span>
                    </span>
                    <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-950/60 font-black">
                      {matrix.microMomentum.score}/20
                    </span>
                  </div>
                  <div className="font-bold text-[11px] truncate text-white">
                    RSI: {item.rsi_5m.toFixed(1)}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">
                    {matrix.microMomentum.passed ? 'زخم مؤكد ✓' : 'نطاق محايد'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Minimal indicators row if full matrix is pending */
            <div className="grid grid-cols-2 gap-2 text-xs py-1 border-t border-slate-800/80">
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex justify-between">
                <span className="text-slate-400">{isScalp ? '200 EMA (1H):' : '200 EMA (4H):'}</span>
                <span className="font-mono font-bold">${item.ema200_4h.toFixed(2)}</span>
              </div>
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex justify-between">
                <span className="text-slate-400">RSI (5M):</span>
                <span className="font-mono font-bold text-emerald-400">{item.rsi_5m.toFixed(1)}</span>
              </div>
            </div>
          )}

          {/* Trade Setup summary (if active BUY or SELL signal) */}
          {tradeSetup && (isBuy || isSell) && (
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-1 text-xs">
              <div className="flex justify-between items-center text-[11px] text-slate-400 font-bold border-b border-slate-800/60 pb-1">
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3 text-emerald-400" />
                  <span>أهداف الصفقة المقترحة:</span>
                </span>
                <span className="text-emerald-400 font-mono">عائد: {tradeSetup.risk_reward_ratio}</span>
              </div>

              <div className="grid grid-cols-3 gap-1 pt-0.5 text-[11px] font-mono text-center">
                <div className="bg-slate-950/70 text-slate-200 p-1 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-400">سعر الدخول</div>
                  <div className="font-bold text-white">${tradeSetup.entry_price}</div>
                </div>
                <div className="bg-rose-950/50 text-rose-300 p-1 rounded border border-rose-900/60">
                  <div className="text-[9px] text-rose-400">إيقاف الخسارة (SL)</div>
                  <div className="font-bold">${tradeSetup.stop_loss}</div>
                </div>
                <div className="bg-emerald-950/50 text-emerald-300 p-1 rounded border border-emerald-900/60">
                  <div className="text-[9px] text-emerald-400">{tradeSetup.take_profit_4 ? 'سلّم الأهداف (TP1-4)' : 'الهدف (TP)'}</div>
                  <div className="font-bold text-emerald-300">
                    {tradeSetup.take_profit_4 
                      ? `$${tradeSetup.take_profit_1} → $${tradeSetup.take_profit_4}`
                      : `$${tradeSetup.take_profit || tradeSetup.take_profit_1}`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Brief reason or status message */}
          {item.reason && (
            <p className="text-[11px] text-slate-400 line-clamp-2 leading-tight italic bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
              {item.reason}
            </p>
          )}
        </div>

        {/* Card Actions Toolbar */}
        <div className="space-y-1.5 pt-2">
          {tradeSetup && (isBuy || isSell) && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={(e) => onCopyCardSignal(e, item)}
                className="py-2 px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold rounded-xl border border-slate-700/80 text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {copiedSymbol === item.symbol ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-black">تم النسخ! ✓</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>نسخ الصفقة 📋</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.analysis) {
                    onOpenExecution(item.analysis);
                  }
                }}
                className={`py-2 px-2.5 font-black rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md ${
                  isBuy
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20'
                    : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>دخول الصفقة 🚀</span>
              </button>
            </div>
          )}

          {/* Card Footer Action: Open Full Analysis */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelectSymbol(item.symbol);
            }}
            className="w-full py-2 px-3 bg-slate-900/90 hover:bg-emerald-500 text-slate-300 hover:text-slate-950 font-bold rounded-xl border border-slate-800 hover:border-emerald-400 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer group-hover:bg-slate-800"
          >
            <span>فتح التحليل الهندسي الشامل</span>
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.price === nextProps.item.price &&
      prevProps.item.decision === nextProps.item.decision &&
      prevProps.item.rsi_5m === nextProps.item.rsi_5m &&
      prevProps.item.adx_1h === nextProps.item.adx_1h &&
      prevProps.copiedSymbol === nextProps.copiedSymbol &&
      prevProps.isScalp === nextProps.isScalp &&
      prevProps.item.analysis?.confluenceMatrix?.totalScore === nextProps.item.analysis?.confluenceMatrix?.totalScore &&
      prevProps.item.timestamp === nextProps.item.timestamp
    );
  }
);

import React from 'react';
import { ConfluenceScoringMatrix, GannGeometryData, DailyMacroBiasStatus } from '../types';
import { ShieldCheck, CheckCircle2, XCircle, Compass, Target, Clock, Zap, BarChart3, Scale, Sparkles, Activity, TrendingUp, Layers, ArrowUpRight, ArrowDownRight, Globe } from 'lucide-react';

interface ConfluenceMatrixCardProps {
  confluenceMatrix?: ConfluenceScoringMatrix;
  gannData?: GannGeometryData;
  price: number;
  dailyMacroBias?: DailyMacroBiasStatus;
  circuitBreaker?: {
    isSpikeActive: boolean;
    volumeMultiplier?: number;
    rangeMultiplier?: number;
    message?: string;
  };
  indicators?: Record<string, any>;
}

export const ConfluenceMatrixCard: React.FC<ConfluenceMatrixCardProps> = ({
  confluenceMatrix,
  gannData,
  price,
  dailyMacroBias,
  circuitBreaker,
  indicators,
}) => {
  if (!confluenceMatrix) return null;

  const {
    totalScore,
    sopScore,
    sopScoreNeeded = 4,
    version = 'V41.00 Enterprise Protection Shield',
    engineType = 'INTRADAY_1001',
    isExecutionTrigger,
    items,
    wyckoffData,
    structuralSLType,
    gann,
    gannSlopeData,
    reversalBarData,
    quadTargets,
  } = confluenceMatrix;
  const totalGatesCount = items.length || 5;
  const scorePercent = Math.min(100, Math.max(0, totalScore));
  const activeSop = sopScore !== undefined ? sopScore : items.filter((i) => i.passed).length;
  const neededPercent = Math.round((sopScoreNeeded / totalGatesCount) * 100);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'MACRO_TREND':
        return <Compass className="w-4 h-4 text-cyan-400" />;
      case 'PRICE_LEVEL':
        return <Target className="w-4 h-4 text-amber-400" />;
      case 'GANN_SLOPE':
        return <TrendingUp className="w-4 h-4 text-orange-400" />;
      case 'TIME_CYCLE':
        return <Clock className="w-4 h-4 text-indigo-400" />;
      case 'MOMENTUM':
        return <Zap className="w-4 h-4 text-emerald-400" />;
      case 'WYCKOFF':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'VOLUME':
        return <BarChart3 className="w-4 h-4 text-violet-400" />;
      case 'RISK_REWARD':
        return <Scale className="w-4 h-4 text-teal-400" />;
      default:
        return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-4 sm:p-5 space-y-4 shadow-2xl">
      {/* 1. Header & Score Master Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              <span>مصفوفة جان ووايكوف المؤسسية ({version})</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                {engineType}
              </span>
              {structuralSLType && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800">
                  SL: {structuralSLType}
                </span>
              )}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {totalGatesCount} بوابات توافق متزامنة (SOP Gates 1-{totalGatesCount}) • شرط الدخول: نجاح SOP 1 + تحقيق {sopScoreNeeded}/{totalGatesCount} بوابات (≥ {neededPercent}%)
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">مجموع البوابات (SOP)</span>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl sm:text-3xl font-black font-mono ${
                isExecutionTrigger ? 'text-emerald-400' : activeSop >= sopScoreNeeded - 1 ? 'text-cyan-400' : 'text-amber-400'
              }`}>
                {activeSop}/{totalGatesCount}
              </span>
              <span className="text-xs text-slate-500 font-mono font-bold">({totalScore}%)</span>
            </div>
          </div>

          <div className={`px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 ${
            isExecutionTrigger
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/80 shadow-lg shadow-emerald-950/50 animate-pulse'
              : 'bg-slate-900 text-slate-400 border-slate-700'
          }`}>
            {isExecutionTrigger ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>إشارة مؤكدة ({activeSop}/{totalGatesCount} Gates ✓)</span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 text-amber-400" />
                <span>بانتظار الاكتمال (&lt; {sopScoreNeeded}/{totalGatesCount})</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Visual Confluence Score Progress Meter */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-slate-400">0/{totalGatesCount} (0%)</span>
          <span className="text-amber-400 font-bold flex items-center gap-1">
            <span>حد التنفيذ المؤسسي ({sopScoreNeeded}/{totalGatesCount} - {neededPercent}%)</span>
            <Sparkles className="w-3 h-3 text-amber-400" />
          </span>
          <span className="text-emerald-400 font-bold">{totalGatesCount}/{totalGatesCount} (100%)</span>
        </div>

        <div className="relative h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isExecutionTrigger
                ? 'bg-gradient-to-r from-cyan-500 via-emerald-500 to-emerald-400 shadow-md shadow-emerald-500/50'
                : totalScore >= 60
                ? 'bg-gradient-to-r from-cyan-600 to-cyan-400'
                : 'bg-gradient-to-r from-slate-600 to-amber-500'
            }`}
            style={{ width: `${scorePercent}%` }}
          />
          {/* Threshold Mark */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-[0_0_8px_#f59e0b] z-10"
            style={{ left: `${neededPercent}%` }}
            title={`حد الأمان والتنفيذ (${neededPercent}%)`}
          />
        </div>
      </div>

      {/* محدد المسار المسبق للإطار اليومي (Directional Bias Switch) ومستويات جان الكبرى (Daily Key Levels) */}
      {dailyMacroBias && (
        <div
          className={`p-3.5 rounded-xl border text-xs transition-all duration-200 ${
            !dailyMacroBias.enabled
              ? 'bg-slate-900/50 border-slate-800 text-slate-400'
              : dailyMacroBias.isMacroBullish
              ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-700/80 shadow-md shadow-emerald-950/20'
              : 'bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-950 border-rose-700/80 shadow-md shadow-rose-950/20'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/70">
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-lg font-black ${
                  !dailyMacroBias.enabled
                    ? 'bg-slate-800 text-slate-400'
                    : dailyMacroBias.isMacroBullish
                    ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-600'
                    : 'bg-rose-900/80 text-rose-300 border border-rose-600'
                }`}
              >
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-white text-xs sm:text-sm">
                    محدد المسار المسبق للإطار اليومي (Directional Bias Switch)
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                    1D 50 EMA & Daily Key Levels
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {dailyMacroBias.enabled
                    ? 'محدد مسار مسبق بدون إحداث شلل: يرخص الصفقات المتوافقة فقط على 4H و 15M ويستخرج قمة/قاع الأمس كدعوم ومقاومات قصوى'
                    : 'محدد المسار اليومي معطل حالياً من الإعدادات'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <span
                className={`px-3 py-1 rounded-lg font-black text-xs flex items-center gap-1.5 border shadow-sm ${
                  !dailyMacroBias.enabled
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : dailyMacroBias.isMacroBullish
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-emerald-950'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-rose-950'
                }`}
              >
                {dailyMacroBias.isMacroBullish ? (
                  <>
                    <ArrowUpRight className="w-4 h-4 text-emerald-400 stroke-[3]" />
                    <span>مسار صاعد عام (Macro Bullish) 🟢</span>
                  </>
                ) : dailyMacroBias.isMacroBearish ? (
                  <>
                    <ArrowDownRight className="w-4 h-4 text-rose-400 stroke-[3]" />
                    <span>مسار هابط عام (Macro Bearish) 🔴</span>
                  </>
                ) : (
                  <span>محايد (Neutral) ⚪</span>
                )}
              </span>

              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black border ${
                  dailyMacroBias.allowedDirection === 'BUY_ONLY'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700 ring-1 ring-emerald-500/40'
                    : dailyMacroBias.allowedDirection === 'SELL_ONLY'
                    ? 'bg-rose-950 text-rose-300 border-rose-700 ring-1 ring-rose-500/40'
                    : 'bg-amber-950/80 text-amber-300 border-amber-600/70 ring-1 ring-amber-500/30'
                }`}
              >
                {dailyMacroBias.allowedDirection === 'BUY_ONLY'
                  ? 'شراء فقط (Long Only)'
                  : dailyMacroBias.allowedDirection === 'SELL_ONLY'
                  ? 'بيع فقط (Short Only)'
                  : 'مسار مضاربي مزدوج ⚡ (شراء & بيع لحظي)'}
              </span>
            </div>
          </div>

          {/* Key Metrics Grid: Close vs EMA, Yesterday Candle, and Daily Key Levels */}
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <span className="text-slate-400 block text-[10px]">إغلاق الأمس مقابل 50 EMA:</span>
              <div className="flex items-center justify-between mt-0.5">
                <span className="font-mono font-bold text-white text-xs">
                  ${dailyMacroBias.prevDailyClose.toFixed(price < 1 ? 6 : 2)}
                </span>
                <span className="font-mono text-amber-300 text-[10px]">
                  EMA: ${dailyMacroBias.dailyEma50.toFixed(price < 1 ? 4 : 2)}
                </span>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <span className="text-slate-400 block text-[10px]">شمعة الأمس (Yesterday Candle):</span>
              <div className="flex items-center gap-1.5 font-bold text-xs mt-0.5">
                <span
                  className={
                    dailyMacroBias.yesterdayCandleType === 'BULLISH'
                      ? 'text-emerald-400'
                      : dailyMacroBias.yesterdayCandleType === 'BEARISH'
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }
                >
                  {dailyMacroBias.yesterdayCandleType === 'BULLISH'
                    ? 'شمعة شرائية واضحة 🟢'
                    : dailyMacroBias.yesterdayCandleType === 'BEARISH'
                    ? 'شمعة بيعية هابطة 🔴'
                    : 'شمعة محايدة ⚪'}
                </span>
              </div>
            </div>

            {/* Previous Daily High (PDH) - Max Resistance Ceiling */}
            <div className={`p-2 rounded-lg border ${
              dailyMacroBias.isNearDailyHighResistance
                ? 'bg-rose-950/50 border-rose-600 animate-pulse'
                : 'bg-slate-950/80 border-slate-800/80'
            }`}>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400">سقف قمة الأمس (PDH):</span>
                {dailyMacroBias.isNearDailyHighResistance && (
                  <span className="text-[9px] bg-rose-900/80 text-rose-200 px-1 rounded font-bold">مقاومة قصوى ⚠️</span>
                )}
              </div>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="font-mono font-bold text-amber-400 text-xs">
                  ${dailyMacroBias.prevDailyHigh ? dailyMacroBias.prevDailyHigh.toFixed(price < 1 ? 6 : 2) : '-'}
                </span>
                {dailyMacroBias.distanceToDailyHighPercent !== undefined && (
                  <span className="text-[10px] font-mono text-slate-400">
                    البعد: {dailyMacroBias.distanceToDailyHighPercent.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>

            {/* Previous Daily Low (PDL) - Max Support Floor */}
            <div className={`p-2 rounded-lg border ${
              dailyMacroBias.isNearDailyLowSupport
                ? 'bg-emerald-950/50 border-emerald-600 animate-pulse'
                : 'bg-slate-950/80 border-slate-800/80'
            }`}>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400">أرضية قاع الأمس (PDL):</span>
                {dailyMacroBias.isNearDailyLowSupport && (
                  <span className="text-[9px] bg-emerald-900/80 text-emerald-200 px-1 rounded font-bold">دعم أقصى ⚠️</span>
                )}
              </div>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="font-mono font-bold text-cyan-400 text-xs">
                  ${dailyMacroBias.prevDailyLow ? dailyMacroBias.prevDailyLow.toFixed(price < 1 ? 6 : 2) : '-'}
                </span>
                {dailyMacroBias.distanceToDailyLowPercent !== undefined && (
                  <span className="text-[10px] font-mono text-slate-400">
                    البعد: {dailyMacroBias.distanceToDailyLowPercent.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Proximity Warning Banner if Touching PDH or PDL */}
          {dailyMacroBias.isNearDailyHighResistance && (
            <div className="mt-2 p-2 rounded-lg bg-rose-950/80 border border-rose-500/80 text-rose-200 flex items-center gap-2">
              <span className="font-black text-sm">⛔</span>
              <span className="font-bold text-[11px]">
                سقف مقاومة قمة الأمس ملامس مباشرة (${dailyMacroBias.prevDailyHigh.toFixed(price < 1 ? 6 : 2)}): يتجنب البوت الشراء هنا لمنع الارتداد العكسي ومصائد السيولة عند القمة.
              </span>
            </div>
          )}

          {dailyMacroBias.isNearDailyLowSupport && (
            <div className="mt-2 p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 flex items-center gap-2">
              <span className="font-black text-sm">⛔</span>
              <span className="font-bold text-[11px]">
                أرضية دعم قاع الأمس ملامسة مباشرة (${dailyMacroBias.prevDailyLow.toFixed(price < 1 ? 6 : 2)}): يتجنب البوت البيع هنا لمنع الارتداد الصاعد ومصائد السيولة عند القاع.
              </span>
            </div>
          )}
        </div>
      )}

      {/* مؤشرات حماية السيولة وقاطع الدائرة ومؤشر التذبذب (Choppiness Index & Circuit Breaker) */}
      {indicators && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
          {/* 1. Choppiness Index (CHOP 15M) */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>مؤشر التذبذب (CHOP 15M):</span>
              </span>
              <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[9px] ${
                indicators.choppiness_15m >= 61.8
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : indicators.choppiness_15m <= 38.2
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
              }`}>
                {indicators.choppiness_15m >= 61.8 ? 'نطاق متذبذب (Chop) ⚠️' : indicators.choppiness_15m <= 38.2 ? 'ترند قوي (Trending) ⚡' : 'سوق اعتيادي'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono font-extrabold text-sm text-white">
                {indicators.choppiness_15m !== undefined ? indicators.choppiness_15m : 50}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {indicators.isChoppyMarket ? 'توسيع SL إلى 2.0x ATR' : 'نطاق SL الطبيعي 1.5x ATR'}
              </span>
            </div>
          </div>

          {/* 2. قاطع الدائرة اللحظي للأخبار (Circuit Breaker) */}
          <div className={`p-2.5 rounded-lg border space-y-1 ${
            circuitBreaker?.isSpikeActive
              ? 'bg-rose-950/60 border-rose-500 animate-pulse'
              : 'bg-slate-950/80 border-slate-800/80'
          }`}>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>قاطع الدائرة (News Spike):</span>
              </span>
              <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[9px] ${
                circuitBreaker?.isSpikeActive
                  ? 'bg-rose-900 text-rose-200 border border-rose-600'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}>
                {circuitBreaker?.isSpikeActive ? 'مُفعّل (حجب فوري) 🚨' : 'آمن ومستقر ✓'}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[11px] font-mono">
              <span className={circuitBreaker?.isSpikeActive ? 'text-rose-300 font-bold' : 'text-slate-300'}>
                حجم {circuitBreaker?.volumeMultiplier || 1}x SMA
              </span>
              <span className="text-slate-400">
                مدى {circuitBreaker?.rangeMultiplier || 1}x ATR
              </span>
            </div>
          </div>

          {/* 3. التفاوت التكيفي لزوايا جان (Dynamic ATR Gann Tolerance) */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1 col-span-1 sm:col-span-2 lg:col-span-1">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span>التفاوت التكيفي لمربع 9:</span>
              </span>
              <span className="px-1.5 py-0.2 rounded font-mono font-bold text-[9px] bg-amber-950 text-amber-300 border border-amber-800">
                ATR-Adaptive
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[11px] font-mono">
              <span className="text-white font-bold">
                {indicators.atr_15m ? `$${indicators.atr_15m.toFixed(price < 1 ? 4 : 2)}` : 'تلقائي'}
              </span>
              <span className="text-amber-300/90 text-[10px]">
                نطاق مرن 0.18% - 0.35%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Confluence Matrix Cards (5 SOP Gates) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item, idx) => {
          const isPassed = item.passed;
          return (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all duration-200 ${
                isPassed
                  ? 'bg-emerald-950/20 border-emerald-800/80 shadow-md shadow-emerald-950/20'
                  : 'bg-slate-900/60 border-slate-800/90 text-slate-400'
              }`}
            >
              <div className="flex justify-between items-center pb-1.5 border-b border-slate-800/60">
                <div className="flex items-center gap-1.5 font-bold text-slate-200">
                  {getCategoryIcon(item.category)}
                  <span className="text-[11px] truncate">{item.nameAr}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[11px] font-mono font-black px-1.5 py-0.5 rounded ${
                    isPassed ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {item.score} / {item.maxScore}
                  </span>
                  {isPassed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-slate-600" />
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <div className={`text-[11px] leading-relaxed font-medium ${isPassed ? 'text-emerald-300' : 'text-slate-300'}`}>
                  {item.description}
                </div>
                {item.details && (
                  <div className="text-[10px] font-mono text-slate-400 bg-slate-950/80 p-1.5 rounded border border-slate-800/80 break-words leading-tight">
                    {item.details}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Quad Scale-Out Ladder (0.5R, 1.0R, 1.5R, 2.0R Hard Cap) */}
      {quadTargets && (
        <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800/80 space-y-2.5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-bold text-teal-300">
                سلم الخروج الرباعي وإدارة الصفقات (Quad Scale-Out Ladder - 1:2 R:R Cap)
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
              إغلاق جزئي 25% لكل هدف
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2 rounded-lg border border-teal-900/60 bg-slate-950/80 font-mono space-y-0.5">
              <div className="text-[10px] text-teal-400 font-sans font-bold">الهدف الأول (0.5R)</div>
              <div className="text-xs font-extrabold text-white">${quadTargets.tp1.toFixed(price < 1 ? 6 : 2)}</div>
              <div className="text-[9px] text-slate-400">إغلاق 25% + نقل الوقف للدخول</div>
            </div>
            <div className="p-2 rounded-lg border border-teal-900/60 bg-slate-950/80 font-mono space-y-0.5">
              <div className="text-[10px] text-teal-400 font-sans font-bold">الهدف الثاني (1.0R)</div>
              <div className="text-xs font-extrabold text-white">${quadTargets.tp2.toFixed(price < 1 ? 6 : 2)}</div>
              <div className="text-[9px] text-slate-400">إغلاق 25% + حجز ربح +0.5R</div>
            </div>
            <div className="p-2 rounded-lg border border-teal-900/60 bg-slate-950/80 font-mono space-y-0.5">
              <div className="text-[10px] text-teal-400 font-sans font-bold">الهدف الثالث (1.5R)</div>
              <div className="text-xs font-extrabold text-white">${quadTargets.tp3.toFixed(price < 1 ? 6 : 2)}</div>
              <div className="text-[9px] text-slate-400">إغلاق 25% + تفعيل Trailing 1.0 ATR</div>
            </div>
            <div className="p-2 rounded-lg border border-teal-900/60 bg-slate-950/80 font-mono space-y-0.5">
              <div className="text-[10px] text-amber-400 font-sans font-bold">الهدف النهائي (2.0R Cap)</div>
              <div className="text-xs font-extrabold text-white">${quadTargets.tp4.toFixed(price < 1 ? 6 : 2)}</div>
              <div className="text-[9px] text-amber-300 font-sans font-bold">إغلاق كامل (Hard Cap 1:2)</div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Quantitative Pillars Deep Dive: Dynamic Slope + Volume Reversal + Wyckoff Engine */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Dynamic Slope Pillar */}
        {gannSlopeData && (
          <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-orange-300 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                ميل مروحة جان الديناميكي (Dynamic 1x1 Fan):
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                gannSlopeData.isHolding1x1 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}>
                {gannSlopeData.isHolding1x1 ? 'يحافظ على مسار 1x1 ✓' : 'انحراف عن المسار ✗'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-400">
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">الميل (ATR/48):</span>
                <span className="text-white font-bold">{gannSlopeData.dynamicSlope.toFixed(6)}</span>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">سعر 1x1 المتوقع:</span>
                <span className="text-orange-300 font-bold">${gannSlopeData.expectedDynamic1x1.toFixed(price < 1 ? 4 : 2)}</span>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">نسبة الانحراف:</span>
                <span className="text-white font-bold">{gannSlopeData.currentDeviationPercent}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Volume Reversal Bar Pillar */}
        {reversalBarData && (
          <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-violet-300 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
                شمعة الانعكاس والسيولة (Reversal Bar & Volume):
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                reversalBarData.isReversalBar ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
              }`}>
                {reversalBarData.isReversalBar ? 'شمعة انعكاس مؤكدة' : 'بانتظار كسر القمة/القاع'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-400">
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">حجم الشمعة:</span>
                <span className="text-white font-bold">{reversalBarData.volume.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">متوسط SMA20:</span>
                <span className="text-slate-300 font-bold">{Math.round(reversalBarData.volumeSMA20).toLocaleString()}</span>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">مضاعف الفوليوم:</span>
                <span className="text-violet-300 font-bold">{reversalBarData.volumeRatio}x</span>
              </div>
            </div>
          </div>
        )}

        {/* Wyckoff Engine Pillar */}
        {wyckoffData && (
          <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-purple-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                محرك وايكوف للسيولة والسلوك (Wyckoff):
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                wyckoffData.isConfirmed ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-slate-800 text-slate-400'
              }`}>
                {wyckoffData.isConfirmed ? `${wyckoffData.signal} مؤكد ✓` : 'تحت المراقبة'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-400">
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">النمط الحركي:</span>
                <span className="text-white font-bold truncate">{wyckoffData.patternName}</span>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">نسبة الذيل:</span>
                <span className="text-purple-300 font-bold">{(wyckoffData.wickRatio * 100).toFixed(0)}%</span>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">مضاعف الفوليوم:</span>
                <span className="text-purple-300 font-bold">{wyckoffData.volumeRatio}x</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. Gann Square of Nine & Harmonic Cycles Sub-Panel */}
      {gann && (
        <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-300">
                شبكة زوايا مربع التسعة لجـان (Gann Square of 9 Geometry & Time Cycles)
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              نقطة الارتكاز (Pivot P0): <span className="text-amber-400 font-bold">${gann.refPivotPrice.toFixed(price < 1 ? 4 : 2)}</span> ({gann.refPivotType === 'SWING_LOW' ? 'قاع ارتكاز' : 'قمة ارتكاز'})
            </div>
          </div>

          {/* Gann Levels Horizontal Ladder */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs">
            {gann.levels.map((lvl, index) => {
              const isNearest = lvl.angle === gann.nearestGannSupport.angle || lvl.angle === gann.nearestGannResistance.angle;
              const isPassed = Math.abs(price - lvl.price) / price * 100 <= 0.15;
              return (
                <div
                  key={index}
                  className={`p-2 rounded-lg border font-mono space-y-0.5 ${
                    isPassed
                      ? 'bg-amber-950/60 border-amber-500 text-amber-200 ring-1 ring-amber-500'
                      : isNearest
                      ? 'bg-cyan-950/40 border-cyan-700 text-cyan-200'
                      : 'bg-slate-950/70 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-sans font-bold flex items-center justify-center gap-1">
                    <span>{lvl.angleName}</span>
                    <span className="text-slate-500">({lvl.angle}°)</span>
                  </div>
                  <div className="text-xs font-extrabold text-white">
                    ${lvl.price.toFixed(price < 1 ? 4 : 2)}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {lvl.type === 'SUPPORT' ? 'دعم جان' : lvl.type === 'RESISTANCE' ? 'مقاومة جان' : 'مركز الارتكاز'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time Cycle Harmonic Status (Rule of 49 & Sqrt P0 & Modulo 144) */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-950/90 p-2.5 rounded-lg border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-300">
                الدورة الزمنية: <span className="font-mono font-bold text-indigo-300">{gann.timeHarmonicCycleName}</span>
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-slate-400">الشموع المنقضية: <strong className="text-white">{gann.barsElapsed}</strong> شمعة 5M</span>
              <span className={`px-2 py-0.5 rounded font-bold ${
                gann.isTimeHarmonicAligned ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
              }`}>
                {gann.isTimeHarmonicAligned ? 'توافق زمني مؤكد ✓' : 'في انتظار التوافق'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

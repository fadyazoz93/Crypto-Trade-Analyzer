import React from 'react';
import { IntradayProtectionShield, TradeSetup } from '../types';
import { 
  ShieldCheck, 
  Layers, 
  Target, 
  Clock, 
  Zap, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  BarChart2, 
  Compass, 
  ArrowUpRight, 
  ArrowDownRight,
  Shield,
  Sliders,
  DollarSign
} from 'lucide-react';

interface IntradayProtectionCardProps {
  protection?: IntradayProtectionShield;
  tradeSetup?: TradeSetup;
  price: number;
  symbol: string;
}

export const IntradayProtectionCard: React.FC<IntradayProtectionCardProps> = ({
  protection,
  tradeSetup,
  price,
  symbol,
}) => {
  if (!protection) return null;

  const { slippageGuard, reversalGuard, executionMatrix } = protection;
  const isTier1 = slippageGuard.tier1LiquidityFocus.isTier1Symbol;

  return (
    <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-white">
                درع حماية التداول اليومي المؤسسي (Intraday Protection Shield)
              </h3>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                Anti-Slippage & Anti-Reversal
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              استغلال ميزة التداول اليومي: امتلاك الوقت الكافي للتمركز والتأكيد قبل حركة السعر الكبرى
            </p>
          </div>
        </div>

        {/* Tier-1 Badge */}
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
            isTier1
              ? 'bg-cyan-950 text-cyan-300 border-cyan-700 ring-1 ring-cyan-500/30'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}>
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isTier1 ? 'أزواج الفئة الأولى (Tier-1) 🔥' : 'عملة بديلة نشطة'}</span>
          </span>
        </div>
      </div>

      {/* Grid: Part 1 (Anti-Slippage) & Part 2 (Anti-Reversal) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Section 1: أساليب تفادي الانزلاق السعري (Slippage Prevention) */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs sm:text-sm font-black text-slate-100">
                أولاً: أساليب تفادي الانزلاق السعري (Slippage)
              </h4>
            </div>
            <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800 font-mono">
              Limit Focus
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Rule 1: Limit Orders Pre-Positioning */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="flex items-center gap-1.5 text-cyan-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>1. التمركز المسبق بأوامر الحد (Limit Orders):</span>
                </span>
                <span className="font-mono text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-white">
                  ${slippageGuard.limitOrderEntry.entryPrice.toFixed(price < 1 ? 4 : 2)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {slippageGuard.limitOrderEntry.note}
              </p>
            </div>

            {/* Rule 2: Stop-Limit Protection */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="flex items-center gap-1.5 text-cyan-300">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>2. أوامر الوقف المحدود (Stop-Limit):</span>
                </span>
                <span className="font-mono text-[11px] bg-amber-950/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/80">
                  تفعيل: ${slippageGuard.stopLimitProtection.stopPrice}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {slippageGuard.stopLimitProtection.note}
              </p>
            </div>

            {/* Rule 3: Economic Calendar Buffer */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="flex items-center gap-1.5 text-cyan-300">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>3. أمان البيانات الاقتصادية (Economic News Guard):</span>
                </span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800 font-bold">
                  آمن (±15 Min Buffer) ✓
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {slippageGuard.economicNewsGuard.note}
              </p>
            </div>

            {/* Rule 4: Tier-1 Liquidity Depth */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="flex items-center gap-1.5 text-cyan-300">
                  <BarChart2 className="w-3.5 h-3.5 text-violet-400" />
                  <span>4. السيولة المؤسسية العالية (Tier-1 Coins):</span>
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                  {slippageGuard.tier1LiquidityFocus.category}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {slippageGuard.tier1LiquidityFocus.note}
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: أساليب تفادي الانعكاسات المفاجئة (Reversal Prevention) */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs sm:text-sm font-black text-slate-100">
                ثانياً: أساليب تفادي الانعكاسات المفاجئة (Reversals)
              </h4>
            </div>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-mono">
              Liquidity & MSS
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Rule 5: Liquidity Sweep */}
            <div className={`p-2.5 rounded-lg border space-y-1 ${
              reversalGuard.liquiditySweep.detected
                ? 'bg-amber-950/40 border-amber-500/80 shadow-md ring-1 ring-amber-500/30'
                : 'bg-slate-900/90 border-slate-800'
            }`}>
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>1. مناطق السيولة وسحب السيولة (Liquidity Sweep):</span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  reversalGuard.liquiditySweep.detected
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {reversalGuard.liquiditySweep.detected ? 'سحب سيولة مؤكد 🎯' : 'سيولة طبيعية'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {reversalGuard.liquiditySweep.note}
              </p>
            </div>

            {/* Rule 6: Market Structure Shift (MSS) */}
            <div className={`p-2.5 rounded-lg border space-y-1 ${
              reversalGuard.marketStructureShift.confirmed
                ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/30'
                : 'bg-slate-900/90 border-slate-800'
            }`}>
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2. تأكيد كسر بنية السوق (MSS) بإغلاق الشمعة:</span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold font-mono ${
                  reversalGuard.marketStructureShift.confirmed
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {reversalGuard.marketStructureShift.confirmed ? 'MSS مؤكد بالإغلاق ✓' : 'بانتظار الإغلاق'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {reversalGuard.marketStructureShift.note}
              </p>
            </div>

            {/* Rule 7: 4H Trend Alignment */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  <span>3. فلترة الاتجاه بإطار 4 ساعات (4H Trend Alignment):</span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  reversalGuard.fourHourTrendAlignment.aligned
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    : 'bg-rose-950 text-rose-300 border border-rose-700'
                }`}>
                  {reversalGuard.fourHourTrendAlignment.h4Trend === 'BULLISH' ? 'صاعد 4H 🟢' : 'هابط 4H 🔴'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {reversalGuard.fourHourTrendAlignment.note}
              </p>
            </div>

            {/* Rule 8: Volume & Momentum Divergence */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
                  <span>4. تأكيد الفوليوم والزخم (Divergence & Volume):</span>
                </span>
                <span className="text-[10px] bg-teal-950 text-teal-300 px-1.5 py-0.5 rounded border border-teal-800 font-bold">
                  {reversalGuard.divergenceVolumeExhaustion.rsiDivergenceType !== 'NONE'
                    ? `انفراج ${reversalGuard.divergenceVolumeExhaustion.rsiDivergenceType}`
                    : 'زخم متناسق'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {reversalGuard.divergenceVolumeExhaustion.note}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Part 3: مصفوفة التنفيذ الآمن في التداول اليومي (Safe Execution Matrix Summary) */}
      <div className="bg-slate-950/90 border border-emerald-500/40 rounded-xl p-3.5 space-y-2.5 shadow-inner">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs sm:text-sm font-black text-white">
              مصفوفة التنفيذ الآمن في التداول اليومي (Safe Execution Matrix)
            </h4>
          </div>
          <span className="text-[11px] text-emerald-400 font-bold">
            التوجيه العملي الموصى به للصفقة الحالية 📌
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {/* Box 1: نوع الأمر */}
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[10px] font-bold block">نوع أمر الدخول الموصى به:</span>
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-amber-300 text-xs">
                {executionMatrix.orderTypeDecision.recommendedOrder === 'LIMIT' ? 'أمر حد معلق (Limit)' : 'وقف محدود (Stop-Limit)'}
              </span>
              <span className="text-[10px] bg-slate-800 px-1.5 rounded text-white font-mono">
                ${executionMatrix.orderTypeDecision.suggestedLimitPrice}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              {executionMatrix.orderTypeDecision.rationale}
            </p>
          </div>

          {/* Box 2: وقف الخسارة */}
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[10px] font-bold block">تحديد وقف الخسارة (Structural SL):</span>
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-rose-400 text-xs">
                ${executionMatrix.stopLossGuidance.finalStopLoss}
              </span>
              <span className="text-[10px] bg-rose-950 text-rose-300 px-1.5 rounded font-mono">
                +1.5x ATR Buffer
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              خلف المستوى الهيكلي لتفادي الذيول الوهمية ومصائد الوقف.
            </p>
          </div>

          {/* Box 3: توقيت الدخول */}
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[10px] font-bold block">توقيت الدخول وإغلاق الشمعة:</span>
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-300 text-xs">
                إغلاق 15M مؤكد ✓
              </span>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 rounded">
                MSS مغلق
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              الدخول مع إغلاق الشمعة وخلو نافذة الأخبار الاقتصادية.
            </p>
          </div>

          {/* Box 4: توافق الاتجاه */}
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[10px] font-bold block">توافق الاتجاه الحاكم (4H & Daily):</span>
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300 text-xs">
                {executionMatrix.trendAlignmentGuidance.is4HAligned ? 'متطابق تماماً 🟢' : 'غير متطابق ⚠️'}
              </span>
              <span className="text-[10px] bg-cyan-950 text-cyan-300 px-1.5 rounded">
                {executionMatrix.trendAlignmentGuidance.h4Trend}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              التداول في اتجاه التدفق المالي المؤسسي فقط.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { AnalysisResult } from '../types';
import { IndicatorVisualizer } from './IndicatorVisualizer';
import { TradeSetupExporter } from './TradeSetupExporter';
import { ConfluenceMatrixCard } from './ConfluenceMatrixCard';
import { IntradayProtectionCard } from './IntradayProtectionCard';
import { QuickTradeExecutionModal } from './QuickTradeExecutionModal';
import { openVirtualTrade, getPaperPortfolio } from '../utils/paperTradingStore';
import { 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus, 
  TrendingUp, 
  ShieldAlert, 
  Award, 
  ShieldCheck, 
  Clock, 
  Gauge, 
  Layers, 
  Shield, 
  Zap, 
  Check, 
  Briefcase, 
  Copy, 
  Share2, 
  Target,
  Globe 
} from 'lucide-react';

interface AnalysisResultCardProps {
  result: AnalysisResult;
  selectedSymbol: string;
  onNavigateToPortfolio?: () => void;
}

export const AnalysisResultCard: React.FC<AnalysisResultCardProps> = ({ result, selectedSymbol, onNavigateToPortfolio }) => {
  const { decision, reason, indicators, trade_setup, timeGuard, spreadGuard, sessionInfo, confluenceMatrix, dailyMacroBias } = result;
  const [addedToPaper, setAddedToPaper] = useState(false);
  const [copiedSignal, setCopiedSignal] = useState(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);

  const isBuy = decision === 'BUY';
  const isSell = decision === 'SELL';
  const isNoTrade = decision === 'NO_TRADE';

  const existingTrade = getPaperPortfolio().openTrades.find((t) => t.symbol.toUpperCase() === selectedSymbol.toUpperCase());

  const handleCopyTradeSignal = () => {
    let text = '';
    if (trade_setup && !isNoTrade) {
      text = `⚡ **توصية تداول فورية - محلل الصفقات ومصفوفة التوافق** ⚡
الزوج: #${selectedSymbol}
نوع الصفقة: ${isBuy ? '🟢 شراء (BUY / LONG)' : '🔴 بيع (SELL / SHORT)'}
درجة التوافق المؤسسي: ${confluenceMatrix ? `${confluenceMatrix.totalScore}/100 (${confluenceMatrix.grade})` : 'مؤكدة'}
السعر اللحظي: $${indicators.price}

🎯 **تفاصيل الدخول وإدارة المخاطر:**
• سعر الدخول (Entry): $${trade_setup.entry_price}
• وقف الخسارة (Stop Loss): $${trade_setup.stop_loss} (${trade_setup.stopLossPercent}%)
• الهدف الأول (TP1): $${trade_setup.take_profit_1} (+${trade_setup.tp1Percent}%) [إغلاق 50% كاش]
• الوقف المتحرك (Trailing Stop): نسبة ${trade_setup.trailingCallbackPercent || (selectedSymbol.includes('BTC') ? 0.65 : selectedSymbol.includes('ETH') ? 0.75 : 0.85)}% تفعل عند TP1
• الهدف الثاني (TP2): $${trade_setup.take_profit_2 || trade_setup.take_profit} (+${trade_setup.tp2Percent || trade_setup.tpPercent}%)
• نسبة العائد للمخاطرة (R:R): ${trade_setup.risk_reward_ratio}
• حجم اللوت المقترح: ${trade_setup.suggestedPositionUsdt ? `$${trade_setup.suggestedPositionUsdt}` : '1% مخاطرة'}

🛡️ **خوارزميات الحماية:**
• تأمين الدخول (Break-Even): تلقائي عند 1:1 R:R
• الوقف المتحرك: 1.5x ATR Trailing Stop
• التوقيت: ${new Date().toLocaleTimeString('ar-EG')}`;
    } else {
      text = `📊 **بيانات ومستويات #${selectedSymbol}**
السعر اللحظي: $${indicators.price}
الحالة العامة: ⚪ انتظار (NO_TRADE)
200 EMA (4H): $${indicators.ema200_4h.toFixed(2)}
مؤشر RSI (5M): ${indicators.rsi_5m.toFixed(1)}
درجة التوافق: ${confluenceMatrix ? `${confluenceMatrix.totalScore}/100` : '—'}
التوقيت: ${new Date().toLocaleTimeString('ar-EG')}`;
    }

    navigator.clipboard.writeText(text);
    setCopiedSignal(true);
    setTimeout(() => setCopiedSignal(false), 2000);
  };

  const handleVirtualEntry = () => {
    const effectiveEntry = trade_setup?.entry_price || indicators.price;
    const effectiveIsBuy = isBuy || (!isSell);
    const effectiveSl = trade_setup?.stop_loss || (
      effectiveIsBuy
        ? Number((indicators.price * 0.985).toFixed(indicators.price < 1 ? 6 : 2))
        : Number((indicators.price * 1.015).toFixed(indicators.price < 1 ? 6 : 2))
    );
    const effectiveTp1 = trade_setup?.take_profit_1 || (
      effectiveIsBuy
        ? Number((indicators.price * 1.03).toFixed(indicators.price < 1 ? 6 : 2))
        : Number((indicators.price * 0.97).toFixed(indicators.price < 1 ? 6 : 2))
    );
    const effectiveTp2 = trade_setup?.take_profit_2 || (
      effectiveIsBuy
        ? Number((indicators.price * 1.06).toFixed(indicators.price < 1 ? 6 : 2))
        : Number((indicators.price * 0.94).toFixed(indicators.price < 1 ? 6 : 2))
    );

    openVirtualTrade(
      selectedSymbol,
      effectiveIsBuy ? 'BUY' : 'SELL',
      effectiveEntry,
      effectiveSl,
      effectiveTp1,
      effectiveTp2,
      trade_setup?.suggestedPositionUsdt || 500,
      confluenceMatrix ? Math.round(confluenceMatrix.totalScore / 20) : (indicators.sopScore || 5),
      {
        orderType: 'LIMIT',
        isPending: true,
        currentMarketPrice: indicators.price,
        takeProfit3: trade_setup?.take_profit_3,
        takeProfit4: trade_setup?.take_profit_4,
      }
    );
    setAddedToPaper(true);
    setTimeout(() => setAddedToPaper(false), 2500);
  };

  const isScalp = result.tradingMode === 'SCALP';

  return (
    <section
      className={`p-3.5 sm:p-5 md:p-6 rounded-2xl border transition-all duration-300 shadow-2xl space-y-4 sm:space-y-6 ${
        isBuy
          ? 'bg-emerald-950/40 border-emerald-500/80 shadow-emerald-950/30'
          : isSell
          ? 'bg-rose-950/40 border-rose-500/80 shadow-rose-950/30'
          : 'bg-slate-900 border-slate-700'
      }`}
    >
      {/* 1. Header with Signal Decision Badge & Quick Actions */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3.5 pb-4 border-b border-slate-800/80">
        <div>
          <span className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 block font-bold">حالة الإشارة الكلية للزوج</span>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
            <span className="text-xl sm:text-2xl md:text-3xl font-black text-white">{selectedSymbol}</span>
            <span className={`text-[11px] sm:text-xs px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1 ${
              isScalp
                ? 'bg-amber-950/90 text-amber-300 border-amber-600/80'
                : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
            }`}>
              {isScalp ? '⚡ مضاربة (Scalp)' : '📊 تداول يومي (Intraday)'}
            </span>
            <span className="text-[11px] sm:text-xs bg-slate-800 text-emerald-400 px-2 py-1 rounded-lg font-mono font-bold border border-slate-700">
              ${indicators.price.toFixed(indicators.price < 1 ? 6 : 2)}
            </span>
            {result.confluenceMatrix ? (
              <span className={`text-[11px] sm:text-xs px-2 py-1 rounded-lg font-mono font-bold border flex items-center gap-1 ${
                result.confluenceMatrix.passed
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                  : 'bg-slate-950 text-cyan-300 border-cyan-800/60'
              }`}>
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                درجة التوافق: {result.confluenceMatrix.totalScore}/100 ({result.confluenceMatrix.grade})
              </span>
            ) : (
              <span className="text-[11px] sm:text-xs bg-slate-950 text-cyan-300 px-2 py-1 rounded-lg font-mono font-bold border border-cyan-800/60 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                مصفوفة التوافق المؤسسي
              </span>
            )}

            {/* Daily Macro Trend Bias Badge */}
            {dailyMacroBias && (
              <span
                className={`text-[11px] sm:text-xs px-2 py-1 rounded-lg font-mono font-bold border flex items-center gap-1 ${
                  !dailyMacroBias.enabled
                    ? 'bg-slate-900 text-slate-400 border-slate-700'
                    : dailyMacroBias.isMacroBullish
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600 shadow-sm shadow-emerald-950'
                    : 'bg-rose-950/90 text-rose-300 border-rose-600 shadow-sm shadow-rose-950'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                {dailyMacroBias.enabled
                  ? `الاتجاه اليومي 1D: ${dailyMacroBias.isMacroBullish ? 'صاعد (شراء فقط)' : 'هابط (بيع فقط)'}`
                  : 'الاتجاه اليومي: معطل'}
              </span>
            )}

            {/* Trading Session Badge */}
            {sessionInfo && (
              <span className="text-[11px] sm:text-xs bg-indigo-950/80 text-indigo-300 px-2 py-1 rounded-lg font-bold border border-indigo-700/70 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                {sessionInfo.activeSession === 'OVERLAP' ? '⚡ جلسة التداخل (لندن+نيويورك)' :
                 sessionInfo.activeSession === 'LONDON' ? '🇬🇧 جلسة لندن' :
                 sessionInfo.activeSession === 'NEW_YORK' ? '🇺🇸 جلسة نيويورك' :
                 sessionInfo.activeSession === 'ASIA' ? '🇯🇵 جلسة آسيا' : 'خارج الجلسات'}
              </span>
            )}

            {/* Spread Guard Badge */}
            {spreadGuard && (
              <span
                className={`text-[11px] sm:text-xs px-2 py-1 rounded-lg font-mono font-bold border flex items-center gap-1 ${
                  spreadGuard.isSpreadSafe
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                    : 'bg-rose-950/80 text-rose-300 border-rose-700 animate-pulse'
                }`}
              >
                <Gauge className="w-3.5 h-3.5" />
                السبريد: {spreadGuard.spreadPercent.toFixed(3)}% {spreadGuard.isSpreadSafe ? '✓' : '⚠️'}
              </span>
            )}

            {timeGuard && (
              <span
                className={`text-[11px] sm:text-xs px-2 py-1 rounded-lg font-mono font-bold border flex items-center gap-1 ${
                  timeGuard.isSafe
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80'
                    : 'bg-amber-950/80 text-amber-300 border-amber-600/80 animate-pulse'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {timeGuard.isSafe ? `آمن (${timeGuard.utcTime}) ✓` : `غير آمن (${timeGuard.utcTime}) ⚠️`}
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Decision Badge & Quick Entry / Copy Buttons */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
          {/* Signal State Pill */}
          <div
            className={`px-4 sm:px-5 py-2 rounded-xl text-sm sm:text-base font-black shadow-lg flex items-center gap-1.5 justify-center shrink-0 ${
              isBuy
                ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400/40 animate-pulse'
                : isSell
                ? 'bg-rose-500 text-white ring-2 ring-rose-400/40 animate-pulse'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {isBuy ? <ArrowUpRight className="w-5 h-5 stroke-[3]" /> : isSell ? <ArrowDownRight className="w-5 h-5 stroke-[3]" /> : <Minus className="w-5 h-5 stroke-[3]" />}
            <span>{isBuy ? 'شراء 🟢 (BUY)' : isSell ? 'بيع 🔴 (SELL)' : 'انتظار ⚪ (NO_TRADE)'}</span>
          </div>

          {/* Copy Trade Button */}
          <button
            type="button"
            onClick={handleCopyTradeSignal}
            className="flex-1 sm:flex-initial px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 hover:border-slate-500 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
            title="نسخ توصية وبيانات الصفقة"
          >
            {copiedSignal ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-black">تم النسخ! ✓</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-cyan-400" />
                <span>نسخ الصفقة 📋</span>
              </>
            )}
          </button>

          {/* Enter Trade Execution Button */}
          {trade_setup && !isNoTrade ? (
            <button
              type="button"
              onClick={() => setShowExecutionModal(true)}
              className={`flex-1 sm:flex-initial px-4 py-2 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg hover:scale-[1.02] active:scale-[0.98] ${
                isBuy
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-2 ring-emerald-400/50'
                  : 'bg-rose-500 hover:bg-rose-400 text-white ring-2 ring-rose-400/50'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>دخول الصفقة 🚀</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowExecutionModal(true)}
              className="flex-1 sm:flex-initial px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border border-slate-700"
              title="دخول صفقة مخصصة"
            >
              <Target className="w-4 h-4 text-amber-400" />
              <span>دخول صفقة مخصصة 🎯</span>
            </button>
          )}
        </div>
      </div>

      {/* Prominent Quick Action Banner for Active Signals */}
      {trade_setup && !isNoTrade && (
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0 ${
              isBuy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
            }`}>
              {isBuy ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
            </div>
            <div>
              <div className="font-extrabold text-white text-xs sm:text-sm flex items-center gap-2">
                <span>إشارة تداول نشطة: {isBuy ? 'شراء طويل (Long)' : 'بيع قصير (Short)'}</span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-emerald-400 font-mono">
                  R:R {trade_setup.risk_reward_ratio}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                دخول: <span className="text-white font-bold">${trade_setup.entry_price}</span> | وقف: <span className="text-rose-400 font-bold">${trade_setup.stop_loss}</span> | هدف (TP): <span className="text-emerald-400 font-bold">${trade_setup.take_profit || trade_setup.take_profit_1}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Auto Executed / Quick Paper Entry Button */}
            {existingTrade ? (
              <button
                type="button"
                onClick={onNavigateToPortfolio}
                className="flex-1 sm:flex-initial px-3.5 py-2 bg-emerald-950/90 text-emerald-300 border border-emerald-500/80 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>الصفقة نشطة بالمحفظة ({existingTrade.status === 'PENDING_ENTRY' ? 'معلقة' : 'مفتوحة'}) ⚡</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleVirtualEntry}
                className="flex-1 sm:flex-initial px-3.5 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {addedToPaper ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300 font-extrabold">تم التنفيذ بمحفظتك! ✓</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>تنفيذ فوري بالمحفظة ⚡</span>
                  </>
                )}
              </button>
            )}

            {/* Custom Entry & Settings Modal */}
            <button
              type="button"
              onClick={() => setShowExecutionModal(true)}
              className={`flex-1 sm:flex-initial px-4 py-2 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md ${
                isBuy
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  : 'bg-rose-500 hover:bg-rose-400 text-white'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>{existingTrade ? 'تعديل المعاملات ⚙️' : 'دخول وتخصيص الصفقة 🚀'}</span>
            </button>

            {/* Copy Signal Button */}
            <button
              type="button"
              onClick={handleCopyTradeSignal}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition cursor-pointer"
              title="نسخ التوصية"
            >
              {copiedSignal ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
            </button>
          </div>
        </div>
      )}

      {/* Trading Time Guard Warning Callout */}
      {timeGuard && !timeGuard.isSafe && (
        <div className="bg-amber-950/80 border-2 border-amber-500/80 p-3 sm:p-4 rounded-xl text-amber-200 flex items-start gap-2.5 sm:gap-3 shadow-xl shadow-amber-950/50">
          <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1 w-full">
            <div className="flex justify-between items-center flex-wrap gap-1.5">
              <span className="font-extrabold text-amber-300 text-xs sm:text-sm flex items-center gap-1.5">
                <span>🛡️ تحذير مُصفي الوقت الآمن</span>
              </span>
              <span className="text-[10px] sm:text-xs bg-amber-900/90 text-amber-200 px-2 py-0.5 rounded-lg font-mono font-bold border border-amber-600">
                التوقيت: {timeGuard.utcTime}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-amber-100 leading-relaxed font-medium">
              {timeGuard.reason}
            </p>
            {timeGuard.nextSafeTime && (
              <div className="text-[11px] font-mono font-bold text-amber-300 pt-1 flex items-center gap-1">
                <span>توقيت استئناف النطاق الآمن:</span>
                <span className="bg-amber-900/80 px-2 py-0.5 rounded text-amber-100 font-extrabold">{timeGuard.nextSafeTime}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Volatility / News Spike Circuit Breaker Warning Callout */}
      {result.circuitBreaker?.isSpikeActive && (
        <div className="bg-rose-950/90 border-2 border-rose-500/80 p-3 sm:p-4 rounded-xl text-rose-200 flex items-start gap-2.5 sm:gap-3 shadow-xl shadow-rose-950/50 animate-pulse">
          <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 w-full">
            <div className="flex justify-between items-center flex-wrap gap-1.5">
              <span className="font-extrabold text-rose-300 text-xs sm:text-sm flex items-center gap-1.5">
                <span>⚠️ قاطع الدائرة اللحظي مفعل (News & Volatility Circuit Breaker)</span>
              </span>
              <span className="text-[10px] sm:text-xs bg-rose-900/90 text-rose-200 px-2 py-0.5 rounded-lg font-mono font-bold border border-rose-600">
                حجم {result.circuitBreaker.volumeMultiplier}x | مدى {result.circuitBreaker.rangeMultiplier}x ATR
              </span>
            </div>
            <p className="text-xs sm:text-sm text-rose-100 leading-relaxed font-medium">
              {result.circuitBreaker.message || 'تم حجب التداول مؤقتاً لتجنب الانزلاق السعري في شمعة خبر شاذة.'}
            </p>
          </div>
        </div>
      )}

      {/* 2. Confluence Scoring Engine & Gann Geometry Master Matrix */}
      {result.confluenceMatrix && (
        <ConfluenceMatrixCard
          confluenceMatrix={result.confluenceMatrix}
          gannData={result.gannData}
          price={indicators.price}
          dailyMacroBias={result.dailyMacroBias}
          circuitBreaker={result.circuitBreaker}
          indicators={indicators}
        />
      )}

      {/* 2.5 Intraday Protection Shield (Slippage Prevention & Reversal Prevention Matrix) */}
      {result.intradayProtection && (
        <IntradayProtectionCard
          protection={result.intradayProtection}
          tradeSetup={trade_setup}
          price={indicators.price}
          symbol={selectedSymbol}
        />
      )}

      {/* 3. Reason Callout */}
      <div className="space-y-1.5">
        <h3 className="text-[11px] sm:text-xs text-slate-400 font-bold uppercase flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
          <span>ملخص التقييم الخوارزمي والمبررات:</span>
        </h3>
        <p className="text-xs sm:text-sm md:text-base text-slate-200 leading-relaxed bg-slate-950/70 p-3 sm:p-4 rounded-xl border border-slate-800/90 font-medium">
          {reason}
        </p>
      </div>

      {/* 4. Trade Setup Targets (If Trade Accepted) */}
      {trade_setup && !isNoTrade && (
        <div className="space-y-2.5 pt-1">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-[11px] sm:text-xs text-slate-400 font-bold uppercase flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
              <span>خطة التداول المقترحة وإدارة رأس المال الذكية:</span>
            </h3>

            {/* Quick Action Buttons on Trade Setup Header */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyTradeSignal}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
              >
                {copiedSignal ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-cyan-400" />}
                <span>{copiedSignal ? 'تم النسخ!' : 'نسخ الصفقة 📋'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowExecutionModal(true)}
                className={`px-3 py-1 font-extrabold rounded-lg text-[11px] flex items-center gap-1 transition cursor-pointer shadow ${
                  isBuy ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' : 'bg-rose-500 hover:bg-rose-400 text-white'
                }`}
              >
                <Briefcase className="w-3 h-3" />
                <span>دخول الصفقة 🚀</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="bg-slate-950 p-3 sm:p-4 rounded-xl border border-slate-800 text-center space-y-0.5">
              <div className="text-[11px] sm:text-xs text-slate-400 font-bold flex items-center justify-center gap-1">
                <span>سعر الدخول المقترح (Entry)</span>
                {trade_setup.entry_type === 'LIMIT' && (
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-bold">معلق ⏳</span>
                )}
              </div>
              <div className="font-mono text-base sm:text-lg font-extrabold text-slate-100">${trade_setup.entry_price}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {trade_setup.entry_type === 'LIMIT' && trade_setup.entryDistancePercent !== undefined
                  ? `${Number(trade_setup.entryDistancePercent) > 0 ? `+${trade_setup.entryDistancePercent}%` : `${trade_setup.entryDistancePercent}%`} عن الحالي`
                  : 'تنفيذ فوري مباشر'}
              </div>
            </div>

            <div className="bg-slate-950 p-3 sm:p-4 rounded-xl border border-rose-900/40 text-center space-y-0.5">
              <div className="text-[11px] sm:text-xs text-rose-400 font-bold flex items-center justify-center gap-1">
                <ShieldAlert className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>وقف الخسارة الهيكلي (SL)</span>
              </div>
              <div className="font-mono text-base sm:text-lg font-extrabold text-rose-400">${trade_setup.stop_loss}</div>
              <div className="text-[10px] text-rose-300 font-mono">
                ({trade_setup.stopLossPercent}% مخاطرة | {trade_setup.structuralSLType === 'WYCKOFF_EXTREME' ? 'قاع وايكوف' : trade_setup.structuralSLType === 'GANN_SWING_ANCHOR' ? 'ارتكاز جان P0' : 'هيكلي ATR'})
              </div>
            </div>

            <div className="bg-slate-950 p-3 sm:p-4 rounded-xl border border-emerald-900/60 ring-1 ring-emerald-500/30 text-center space-y-0.5">
              <div className="text-[11px] sm:text-xs text-emerald-400 font-bold flex items-center justify-center gap-1">
                <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
                <span>هدف جان ووايكوف الموحد (TP)</span>
              </div>
              <div className="font-mono text-base sm:text-lg font-extrabold text-emerald-400">
                ${trade_setup.take_profit || trade_setup.take_profit_1}
              </div>
              <div className="text-[10px] text-emerald-300 font-mono">
                (+{trade_setup.tpPercent || trade_setup.tp1Percent}% ربح مستهدف)
              </div>
            </div>

            <div className="bg-slate-950 p-3 sm:p-4 rounded-xl border border-amber-900/40 text-center space-y-0.5">
              <div className="text-[11px] sm:text-xs text-amber-400 font-bold flex items-center justify-center gap-1">
                <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
                <span>نسبة العائد للمخاطرة (R:R)</span>
              </div>
              <div className="font-mono text-sm sm:text-base font-extrabold text-amber-300">
                {trade_setup.risk_reward_ratio}
              </div>
              <div className="text-[10px] text-amber-400 font-mono">
                {trade_setup.targetAngleName || 'نموذج جان ووايكوف الموحد'}
              </div>
            </div>
          </div>

          {/* Dynamic Risk & Automation Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <div className="text-slate-400 font-medium text-[11px]">حجم اللوت المقترح (%1 مخاطرة):</div>
                <div className="font-mono font-extrabold text-cyan-300">
                  {trade_setup.suggestedLotUnits ? `${trade_setup.suggestedLotUnits} عقد` : 'آلي'} 
                  {trade_setup.suggestedPositionUsdt ? ` ($${trade_setup.suggestedPositionUsdt})` : ''}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-slate-400 font-medium text-[11px]">حجز الأرباح المضمونة (Lock Profit +0.5R):</div>
                <div className="font-mono font-extrabold text-amber-300 text-xs">
                  {trade_setup.target50PercentPrice && (trade_setup.quadScaleOut?.tp1_0_5r || trade_setup.beTriggerPrice)
                    ? `عند $${trade_setup.target50PercentPrice} (50% TP) ارفع الوقف إلى $${trade_setup.quadScaleOut?.tp1_0_5r || trade_setup.beTriggerPrice} (+0.5R)`
                    : `رفع الوقف إلى +0.5R عند تحقيق 50% من الهدف`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-slate-400 font-medium text-[11px]">الوقف المتحرك (Trailing Stop):</div>
                <div className="font-mono font-extrabold text-emerald-300 text-xs">
                  {trade_setup.trailingCallbackPercent || (selectedSymbol.includes('BTC') ? 0.65 : selectedSymbol.includes('ETH') ? 0.75 : 0.85)}% تراجع
                  {trade_setup.take_profit_1 ? ` (يفعل عند TP1: $${trade_setup.take_profit_1})` : ''}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <TradeSetupExporter result={result} onNavigateToPortfolio={onNavigateToPortfolio} />
          </div>
        </div>
      )}

      {/* Quick Trade Execution Modal Popup */}
      <QuickTradeExecutionModal
        isOpen={showExecutionModal}
        onClose={() => setShowExecutionModal(false)}
        result={result}
        onNavigateToPortfolio={onNavigateToPortfolio}
      />

      {/* 5. SVG Visualizer */}
      <IndicatorVisualizer result={result} />
    </section>
  );
};


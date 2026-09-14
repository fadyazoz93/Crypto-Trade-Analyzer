import React, { useState } from 'react';
import { AnalysisResult, TradeSetup } from '../types';
import { openVirtualTrade, getPaperPortfolio } from '../utils/paperTradingStore';
import { getStrategySettings } from '../utils/settingsStore';
import { 
  X, 
  Briefcase, 
  ArrowUpRight, 
  ArrowDownRight, 
  Check, 
  Copy, 
  ShieldAlert, 
  TrendingUp, 
  Target, 
  Zap, 
  Gauge, 
  CheckCircle2, 
  Sliders, 
  ShieldCheck,
  Percent,
  DollarSign,
  Clock,
  Radio
} from 'lucide-react';

interface QuickTradeExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: AnalysisResult;
  onNavigateToPortfolio?: () => void;
}

export const QuickTradeExecutionModal: React.FC<QuickTradeExecutionModalProps> = ({
  isOpen,
  onClose,
  result,
  onNavigateToPortfolio,
}) => {
  const settings = getStrategySettings();
  const portfolio = getPaperPortfolio();

  const { symbol, decision, trade_setup, indicators, confluenceMatrix } = result;
  
  // Custom trade setup fallback if decision is NO_TRADE or trade_setup not provided
  const currentPrice = indicators.price || 100;
  const isBuy = decision === 'BUY' ? true : (decision === 'SELL' ? false : true);
  const [selectedDirection, setSelectedDirection] = useState<'BUY' | 'SELL'>(
    decision === 'SELL' ? 'SELL' : 'BUY'
  );

  // Dynamic entry, SL, TP fallback calculation
  const defaultEntry = trade_setup?.entry_price || currentPrice;
  const defaultSl = trade_setup?.stop_loss || (
    selectedDirection === 'BUY'
      ? Number((currentPrice * 0.985).toFixed(currentPrice < 1 ? 6 : 2))
      : Number((currentPrice * 1.015).toFixed(currentPrice < 1 ? 6 : 2))
  );

  // Order execution mode: 'LIMIT' (Pending), 'STOP_LIMIT' (Protected Pending), or 'MARKET' (Instant)
  const defaultIsPending = trade_setup?.entry_type === 'LIMIT' || trade_setup?.entry_type === 'STOP_LIMIT';
  const defaultMode: 'LIMIT' | 'STOP_LIMIT' | 'MARKET' = trade_setup?.entry_type === 'STOP_LIMIT'
    ? 'STOP_LIMIT'
    : (trade_setup?.entry_type === 'LIMIT' ? 'LIMIT' : 'MARKET');
  const [executionMode, setExecutionMode] = useState<'LIMIT' | 'STOP_LIMIT' | 'MARKET'>(defaultMode);

  // Stop-Limit trigger price state
  const defaultStopTrigger = trade_setup?.stop_limit_trigger || (
    selectedDirection === 'BUY'
      ? Number((defaultEntry * 0.999).toFixed(currentPrice < 1 ? 6 : 2))
      : Number((defaultEntry * 1.001).toFixed(currentPrice < 1 ? 6 : 2))
  );
  const [stopLimitTrigger, setStopLimitTrigger] = useState<number>(defaultStopTrigger);
  const singleTpSource = trade_setup?.take_profit || trade_setup?.take_profit_1;
  const defaultTp1 = singleTpSource || (
    selectedDirection === 'BUY'
      ? Number((currentPrice * 1.0225).toFixed(currentPrice < 1 ? 6 : 2))
      : Number((currentPrice * 0.9775).toFixed(currentPrice < 1 ? 6 : 2))
  );
  const defaultTp2 = singleTpSource || defaultTp1;

  const [customEntry, setCustomEntry] = useState<number>(defaultEntry);
  const [customSl, setCustomSl] = useState<number>(defaultSl);
  const [customTp1, setCustomTp1] = useState<number>(defaultTp1);
  const [customTp2, setCustomTp2] = useState<number>(defaultTp2);

  const [marginAmount, setMarginAmount] = useState<number>(() => {
    return trade_setup?.suggestedPositionUsdt ? Math.min(trade_setup.suggestedPositionUsdt, 1000) : 500;
  });
  const [leverage, setLeverage] = useState<number>(settings.accountLeverage || 5);
  const [riskPercent, setRiskPercent] = useState<number>(settings.riskPerTradePercent || 1.0);
  
  const [executed, setExecuted] = useState<boolean>(false);
  const [executedAsPending, setExecutedAsPending] = useState<boolean>(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Sync state ONLY when modal opens or symbol changes
  const prevIsOpenRef = React.useRef(isOpen);
  const prevSymbolRef = React.useRef(symbol);

  React.useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    const symbolChanged = isOpen && prevSymbolRef.current !== symbol;
    prevIsOpenRef.current = isOpen;
    prevSymbolRef.current = symbol;

    if (!justOpened && !symbolChanged) return;

    if (trade_setup) {
      const singleTp = trade_setup.take_profit || trade_setup.take_profit_1;
      setCustomEntry(trade_setup.entry_price);
      setCustomSl(trade_setup.stop_loss);
      setCustomTp1(singleTp);
      setCustomTp2(singleTp);
      setSelectedDirection(decision === 'SELL' ? 'SELL' : 'BUY');
      setExecutionMode(trade_setup.entry_type === 'STOP_LIMIT' ? 'STOP_LIMIT' : (trade_setup.entry_type === 'LIMIT' ? 'LIMIT' : 'MARKET'));
      if (trade_setup.stop_limit_trigger) {
        setStopLimitTrigger(trade_setup.stop_limit_trigger);
      }
    } else {
      setCustomEntry(currentPrice);
      const isLong = decision === 'SELL' ? false : true;
      setSelectedDirection(isLong ? 'BUY' : 'SELL');
      setCustomSl(Number((isLong ? currentPrice * 0.985 : currentPrice * 1.015).toFixed(currentPrice < 1 ? 6 : 2)));
      setCustomTp1(Number((isLong ? currentPrice * 1.03 : currentPrice * 0.97).toFixed(currentPrice < 1 ? 6 : 2)));
      setCustomTp2(Number((isLong ? currentPrice * 1.03 : currentPrice * 0.97).toFixed(currentPrice < 1 ? 6 : 2)));
      setExecutionMode('LIMIT');
    }
  }, [isOpen, symbol]);

  if (!isOpen) return null;

  const effectiveIsBuy = selectedDirection === 'BUY';
  const effectiveEntry = executionMode === 'MARKET' ? currentPrice : (customEntry || currentPrice);
  const effectiveSl = customSl;
  const effectiveTp1 = customTp1;
  const effectiveTp2 = customTp2;

  const entryDistancePercent = (((effectiveEntry - currentPrice) / currentPrice) * 100).toFixed(2);

  const handleExecute = () => {
    const isPendingOrder = executionMode === 'LIMIT' || executionMode === 'STOP_LIMIT';
    openVirtualTrade(
      symbol,
      effectiveIsBuy ? 'BUY' : 'SELL',
      effectiveEntry,
      effectiveSl,
      effectiveTp1,
      effectiveTp2,
      marginAmount,
      confluenceMatrix ? Math.round(confluenceMatrix.totalScore / 20) : (indicators.sopScore || 5),
      {
        leverage,
        riskPercent,
        customAllocAmount: marginAmount,
        atrMultiplier: settings.atrTrailingMultiplier || 1.5,
        orderType: executionMode === 'MARKET' ? 'MARKET' : 'LIMIT',
        isPending: isPendingOrder,
        currentMarketPrice: currentPrice,
        takeProfit3: trade_setup?.take_profit_3,
        takeProfit4: trade_setup?.take_profit_4,
      }
    );

    setExecutedAsPending(isPendingOrder);
    setExecuted(true);
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(label);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const slDiffPercent = (((effectiveSl - effectiveEntry) / effectiveEntry) * 100).toFixed(2);
  const tp1DiffPercent = (((effectiveTp1 - effectiveEntry) / effectiveEntry) * 100).toFixed(2);
  const tp2DiffPercent = (((effectiveTp2 - effectiveEntry) / effectiveEntry) * 100).toFixed(2);

  const fullSignalText = `⚡ **توصية تداول فورية - محلل الصفقات الذكي** ⚡
الزوج: #${symbol}
نوع الصفقة: ${effectiveIsBuy ? '🟢 شراء (BUY / LONG)' : '🔴 بيع (SELL / SHORT)'}
طريقة الدخول: ${executionMode === 'STOP_LIMIT' ? `🛡️ أمر وقف محدد (Stop-Limit: تفعيل $${stopLimitTrigger} / تنفيذ $${effectiveEntry})` : executionMode === 'LIMIT' ? `⏳ أمر معلق (انتظار وصول $${effectiveEntry})` : `⚡ دخول فوري بسعر السوق ($${currentPrice})`}
درجة التوافق: ${confluenceMatrix ? `${confluenceMatrix.totalScore}/100 (${confluenceMatrix.grade})` : 'مؤكدة'}

🎯 **تفاصيل الدخول والأهداف:**
• سعر الدخول المحدد (Entry): $${effectiveEntry}
${executionMode === 'STOP_LIMIT' ? `• سعر تفعيل الوقف (Stop Trigger): $${stopLimitTrigger}\n` : ''}• السعر اللحظي الحالي: $${currentPrice}
• وقف الخسارة (Stop Loss): $${effectiveSl} (${slDiffPercent}%)
• الهدف الموحد (TP): $${effectiveTp1} (${tp1DiffPercent}%)
• نسبة العائد للمخاطرة (R:R): ${trade_setup?.risk_reward_ratio || '1:2'}
• الهامش: $${marginAmount} | الرافعة: ${leverage}x

🛡️ **إدارة المخاطر:**
• درع الانزلاق: ${executionMode === 'STOP_LIMIT' ? 'مفعل بأمر Stop-Limit لمنع القفزات السعرية' : 'تمركز مسبق بأمر معلق Limit'}
• تأمين الدخول (Break-Even): عند وصول الهدف 1:1 R:R
• الوقف المتحرك: 1.5x ATR Trailing Stop
• التوقيت: ${new Date().toLocaleTimeString('ar-EG')}`;

  const botSignalText = executionMode === 'STOP_LIMIT'
    ? `${effectiveIsBuy ? 'BUY_STOP_LIMIT' : 'SELL_STOP_LIMIT'} ${symbol} Stop: ${stopLimitTrigger} Limit: ${effectiveEntry} SL: ${effectiveSl} TP: ${effectiveTp1}`
    : `${effectiveIsBuy ? 'BUY' : 'SELL'} ${symbol} Entry: ${effectiveEntry} SL: ${effectiveSl} TP: ${effectiveTp1}`;

  const notionalPosition = marginAmount * leverage;
  const estProfitTp1 = ((Math.abs(effectiveTp1 - effectiveEntry) / effectiveEntry) * notionalPosition).toFixed(2);
  const estMaxLoss = ((Math.abs(effectiveSl - effectiveEntry) / effectiveEntry) * notionalPosition).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fade-in" dir="rtl">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-8 relative overflow-hidden border-t-4 border-t-emerald-500">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${effectiveIsBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            {effectiveIsBuy ? <ArrowUpRight className="w-6 h-6 stroke-[3]" /> : <ArrowDownRight className="w-6 h-6 stroke-[3]" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">دخول ونسخ صفقة {symbol}</h2>
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedDirection('BUY')}
                    className={`px-2 py-0.5 text-xs font-bold rounded ${effectiveIsBuy ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    شراء 🟢 LONG
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDirection('SELL')}
                    className={`px-2 py-0.5 text-xs font-bold rounded ${!effectiveIsBuy ? 'bg-rose-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    بيع 🔴 SHORT
                  </button>
                </div>
              </div>
              {confluenceMatrix && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono font-bold">
                  توافق {confluenceMatrix.totalScore}/100 ({confluenceMatrix.grade})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              تحديد سعر الدخول الذكي مع انتظار السعر المحدد آلياً أو التنفيذ الفوري بسعر السوق
            </p>
          </div>
        </div>

        {/* Success Message Banner if Executed */}
        {executed ? (
          <div className="bg-emerald-950/90 border border-emerald-500 p-4 rounded-xl text-center space-y-3 shadow-lg">
            <div className="flex items-center justify-center gap-2 text-emerald-400 font-black text-base">
              <CheckCircle2 className="w-6 h-6" />
              <span>
                {executedAsPending
                  ? (executionMode === 'STOP_LIMIT' ? 'تم وضع أمر الوقف المحدد (Stop-Limit) بنجاح لحماية الانزلاق! 🛡️' : 'تم وضع الأمر المعلق بنجاح في المحفظة الافتراضية! ⏳')
                  : 'تم تنفيذ الصفقة فورياً ودخولها بنجاح في المحفظة الافتراضية! 🚀'}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              {executedAsPending ? (
                <>
                  {executionMode === 'STOP_LIMIT' ? (
                    <>
                      يتفعل الأمر عند وصول السعر إلى <strong className="text-purple-300">${stopLimitTrigger}</strong> ويُنفذ فقط بسعر الحد <strong className="text-amber-400">${effectiveEntry}</strong> بدون أي انزلاق سلبي. تم حجز الهامش <strong className="text-white">${marginAmount}</strong>.
                    </>
                  ) : (
                    <>
                      في انتظار وصول السعر اللحظي إلى <strong className="text-amber-400">${effectiveEntry}</strong> لتفعيل ودخول الصفقة آلياً.
                      تم حجز الهامش <strong className="text-white">${marginAmount}</strong> بنجاح.
                    </>
                  )}
                </>
              ) : (
                <>
                  تم الدخول الفوري بسعر السوق <strong className="text-white">${currentPrice}</strong> وحجز هامش <strong className="text-white">${marginAmount}</strong> برافعة <strong className="text-white">{leverage}x</strong>.
                </>
              )}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              {onNavigateToPortfolio && (
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToPortfolio();
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                >
                  <Briefcase className="w-4 h-4" />
                  <span>الانتقال لمتابعة الأوامر والصفقات في المحفظة 💼</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Execution Mode Selector: Stop-Limit vs Limit vs Market */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>طريقة تنفيذ أمر الدخول اليومي (Intraday Execution):</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  السعر الحالي: <strong className="text-white">${currentPrice}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Stop-Limit Mode (Anti-Slippage Guard) */}
                <button
                  type="button"
                  onClick={() => {
                    setExecutionMode('STOP_LIMIT');
                    if (trade_setup?.entry_price) setCustomEntry(trade_setup.entry_price);
                    if (trade_setup?.stop_limit_trigger) setStopLimitTrigger(trade_setup.stop_limit_trigger);
                  }}
                  className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                    executionMode === 'STOP_LIMIT'
                      ? 'bg-purple-950/50 border-purple-500 text-white shadow-md ring-1 ring-purple-500/40'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-purple-300 flex items-center gap-1">
                      <span>🛡️ وقف محدد (Stop-Limit)</span>
                    </span>
                    <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono font-bold">
                      حماية الانزلاق
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    تفعيل عند <strong className="text-purple-300 font-mono">${stopLimitTrigger}</strong> وتنفيذ محدد عند <strong className="text-white font-mono">${customEntry}</strong> لمنع القفزات السعرية.
                  </p>
                </button>

                {/* Pending Limit Mode */}
                <button
                  type="button"
                  onClick={() => {
                    setExecutionMode('LIMIT');
                    if (trade_setup?.entry_price) setCustomEntry(trade_setup.entry_price);
                  }}
                  className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                    executionMode === 'LIMIT'
                      ? 'bg-amber-950/40 border-amber-500 text-white shadow-md ring-1 ring-amber-500/40'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-400 flex items-center gap-1">
                      <span>⏳ أمر معلق (Limit Order)</span>
                    </span>
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
                      انتظار المستوى
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    انتظار وصول السعر إلى <strong className="text-white font-mono">${customEntry}</strong> للدخول بأفضل نقطة ({Number(entryDistancePercent) > 0 ? `+${entryDistancePercent}%` : `${entryDistancePercent}%`}).
                  </p>
                </button>

                {/* Instant Market Mode */}
                <button
                  type="button"
                  onClick={() => {
                    setExecutionMode('MARKET');
                    setCustomEntry(currentPrice);
                  }}
                  className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                    executionMode === 'MARKET'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-md ring-1 ring-emerald-500/40'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-400 flex items-center gap-1">
                      <span>⚡ تنفيذ فوري (Market)</span>
                    </span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                      دخول مباشر
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    دخول فوري مباشر بالسعر اللحظي الحالي (<strong className="text-white font-mono">${currentPrice}</strong>).
                  </p>
                </button>
              </div>
            </div>

            {/* Key Targets & Stop Loss Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className={`text-center p-2 rounded-lg border ${executionMode === 'STOP_LIMIT' ? 'bg-purple-950/20 border-purple-500/50' : executionMode === 'LIMIT' ? 'bg-amber-950/20 border-amber-500/50' : 'bg-slate-900/60 border-slate-800/80'}`}>
                <span className="text-[10px] text-slate-400 block font-medium">
                  {executionMode === 'STOP_LIMIT' ? 'سعر التنفيذ المحدد 🛡️' : executionMode === 'LIMIT' ? 'سعر الدخول المحدد ⏳' : 'سعر الدخول الفوري ⚡'}
                </span>
                <span className="font-mono text-sm sm:text-base font-black text-white">${effectiveEntry}</span>
                <button
                  onClick={() => handleCopyText(String(effectiveEntry), 'entry')}
                  className="mt-1 text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center justify-center gap-1 mx-auto cursor-pointer"
                >
                  {copiedSection === 'entry' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSection === 'entry' ? 'تم!' : 'نسخ'}</span>
                </button>
              </div>

              <div className="text-center p-2 rounded-lg bg-rose-950/20 border border-rose-900/30">
                <span className="text-[10px] text-rose-300 block font-medium">وقف الخسارة (SL)</span>
                <span className="font-mono text-sm sm:text-base font-black text-rose-400">${effectiveSl}</span>
                <button
                  onClick={() => handleCopyText(String(effectiveSl), 'sl')}
                  className="mt-1 text-[10px] text-rose-400 hover:text-rose-300 flex items-center justify-center gap-1 mx-auto cursor-pointer"
                >
                  {copiedSection === 'sl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSection === 'sl' ? 'تم!' : 'نسخ'}</span>
                </button>
              </div>

              <div className="text-center p-2 rounded-lg bg-emerald-950/20 border border-emerald-900/40">
                <span className="text-[10px] text-emerald-300 block font-medium">الهدف الموحد (TP)</span>
                <span className="font-mono text-sm sm:text-base font-black text-emerald-400">${effectiveTp1}</span>
                <button
                  onClick={() => handleCopyText(String(effectiveTp1), 'tp')}
                  className="mt-1 text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center justify-center gap-1 mx-auto cursor-pointer"
                >
                  {copiedSection === 'tp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSection === 'tp' ? 'تم!' : 'نسخ'}</span>
                </button>
              </div>

              <div className="text-center p-2 rounded-lg bg-amber-950/20 border border-amber-900/30">
                <span className="text-[10px] text-amber-300 block font-medium">العائد للمخاطرة (R:R)</span>
                <span className="font-mono text-sm sm:text-base font-black text-amber-300">{trade_setup?.risk_reward_ratio || '1:2'}</span>
                <div className="text-[9px] text-amber-400/80 font-mono mt-1 truncate">
                  {trade_setup?.targetAngleName || 'جان ووايكوف'}
                </div>
              </div>
            </div>

            {/* Price Adjustment Controls */}
            {(executionMode === 'LIMIT' || executionMode === 'STOP_LIMIT') && (
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 font-medium">
                    {executionMode === 'STOP_LIMIT' ? 'سعر التنفيذ (Limit Price):' : 'سعر الدخول المعلق:'}
                  </span>
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                    <span className="text-slate-400 text-xs">$</span>
                    <input
                      type="number"
                      step="any"
                      value={customEntry}
                      onChange={(e) => setCustomEntry(Number(e.target.value) || currentPrice)}
                      className="bg-transparent text-xs text-white font-mono w-24 focus:outline-none"
                    />
                  </div>
                </div>

                {executionMode === 'STOP_LIMIT' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-300 font-medium">سعر التفعيل (Stop Trigger):</span>
                    <div className="flex items-center gap-1 bg-slate-900 border border-purple-800/60 rounded-lg px-2 py-1">
                      <span className="text-slate-400 text-xs">$</span>
                      <input
                        type="number"
                        step="any"
                        value={stopLimitTrigger}
                        onChange={(e) => setStopLimitTrigger(Number(e.target.value) || currentPrice)}
                        className="bg-transparent text-xs text-purple-200 font-mono w-24 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {trade_setup?.entry_price && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomEntry(trade_setup.entry_price);
                      if (trade_setup.stop_limit_trigger) setStopLimitTrigger(trade_setup.stop_limit_trigger);
                    }}
                    className="self-end sm:self-center px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 rounded border border-slate-700 transition"
                  >
                    إعادة للمقترح
                  </button>
                )}
              </div>
            )}

            {/* Position Sizing & Leverage Parameters */}
            <div className="bg-slate-950/80 p-3.5 sm:p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span>إعدادات الهامش والرافعة المالية:</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  الرصيد المتاح: <strong className="text-emerald-400">${portfolio.cashBalance.toFixed(2)}</strong>
                </span>
              </div>

              {/* Margin Amount Selector */}
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>الهامش المخصص للصفقة (USDT Margin):</span>
                  <span className="font-mono font-bold text-white">${marginAmount}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[100, 250, 500, 1000, 2500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setMarginAmount(amt)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg border transition cursor-pointer ${
                        marginAmount === amt
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 flex-1 min-w-[100px]">
                    <span className="text-slate-500 text-xs">$</span>
                    <input
                      type="number"
                      min="10"
                      max={portfolio.cashBalance}
                      value={marginAmount}
                      onChange={(e) => setMarginAmount(Number(e.target.value) || 10)}
                      className="bg-transparent text-xs text-white font-mono w-full focus:outline-none"
                      placeholder="مخصص"
                    />
                  </div>
                </div>
              </div>

              {/* Leverage Selector */}
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>الرافعة المالية (Leverage):</span>
                  <span className="font-mono font-bold text-amber-400">{leverage}x (حجم العقد: ${notionalPosition.toLocaleString()})</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 5, 10, 20].map((lev) => (
                    <button
                      key={lev}
                      type="button"
                      onClick={() => setLeverage(lev)}
                      className={`py-1.5 text-xs font-bold rounded-lg border text-center transition cursor-pointer ${
                        leverage === lev
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {lev}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Profit & Risk Estimates */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono border-t border-slate-800/80">
                <div className="bg-rose-950/30 p-2 rounded-lg text-rose-300 border border-rose-900/40 text-center">
                  <span className="block text-[10px] text-rose-400">أقصى مخاطرة (عند SL):</span>
                  <span className="font-bold text-xs sm:text-sm">-${estMaxLoss}</span>
                </div>
                <div className="bg-emerald-950/30 p-2 rounded-lg text-emerald-300 border border-emerald-900/40 text-center">
                  <span className="block text-[10px] text-emerald-400">الربح المستهدف (عند TP):</span>
                  <span className="font-bold text-xs sm:text-sm">+${estProfitTp1} ({trade_setup?.risk_reward_ratio || '1:2'})</span>
                </div>
              </div>
            </div>

            {/* Quick Copy Section */}
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                  <span>نسخ بيانات الصفقة لمنصات التداول:</span>
                </span>
                <span className="text-[10px] text-slate-500">اختر الصيغة المناسبة</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyText(fullSignalText, 'full')}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {copiedSection === 'full' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedSection === 'full' ? 'تم نسخ التوصية الكاملة! ✅' : 'نسخ التوصية بالكامل (للمشاركة)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyText(botSignalText, 'bot')}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-800/60 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {copiedSection === 'bot' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>{copiedSection === 'bot' ? 'تم نسخ صيغة البوت! ✅' : 'نسخ صيغة البوت (Cornix/Exchange)'}</span>
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleExecute}
                className={`w-full sm:flex-1 py-3.5 px-4 font-black rounded-xl text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-xl ${
                  executionMode === 'STOP_LIMIT'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20'
                    : executionMode === 'LIMIT'
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20'
                    : effectiveIsBuy
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20'
                    : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                }`}
              >
                {executionMode === 'STOP_LIMIT' ? (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    <span>تأكيد أمر الوقف المحدد 🛡️ (تفعيل ${stopLimitTrigger} / تنفيذ ${effectiveEntry})</span>
                  </>
                ) : executionMode === 'LIMIT' ? (
                  <>
                    <Clock className="w-5 h-5" />
                    <span>تأكيد وضع الأمر المعلق ⏳ (انتظار ${effectiveEntry})</span>
                  </>
                ) : (
                  <>
                    <Briefcase className="w-5 h-5" />
                    <span>دخول وتأكيد الصفقة فورياً ⚡ (${marginAmount})</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

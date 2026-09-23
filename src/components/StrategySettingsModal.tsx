import React, { useState, useEffect } from 'react';
import { StrategySettings, getStrategySettings, saveStrategySettings, DEFAULT_SETTINGS } from '../utils/settingsStore';
import { saveSettingsToTurso, checkTursoConnection, savePortfolioToTurso, TursoConnectionStatus } from '../utils/tursoSync';
import { getPaperPortfolio, fetchPaperPortfolioFromTurso } from '../utils/paperTradingStore';
import { Sliders, Save, CheckCircle2, ShieldCheck, Zap, BellRing, ShieldAlert, Award, Clock, DollarSign, RefreshCw, X, Send, Database, UploadCloud, DownloadCloud, Trash2 } from 'lucide-react';
import { testTelegramConnection } from '../utils/telegramNotifications';
import { signalNotificationManager } from '../utils/tradeSignalNotifier';

interface StrategySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
}

export const StrategySettingsModal: React.FC<StrategySettingsModalProps> = ({ isOpen, onClose, onSaveSuccess }) => {
  const [settings, setSettings] = useState<StrategySettings>(getStrategySettings());
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [tursoStatus, setTursoStatus] = useState<TursoConnectionStatus | null>(null);
  const [testingTurso, setTestingTurso] = useState(false);
  const [tursoFeedback, setTursoFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkTursoConnection().then(setTursoStatus);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveStrategySettings(settings);
    saveSettingsToTurso(settings).catch(() => {});
    
    // Synchronize threshold with 24/7 background scanner daemon
    const targetScore = settings.sopScoreNeeded === 5 ? 5 : 4;
    fetch('/api/daemon/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minSopScore: targetScore }),
    }).catch(() => {});

    setSavedSuccess(true);
    if (onSaveSuccess) onSaveSuccess();
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  const handleResetToDefault = () => {
    if (window.confirm('هل تريد استعادة كافة الإعدادات الافتراضية لمنظومة التوافق ومربع التسعة V9.00؟')) {
      setSettings(DEFAULT_SETTINGS);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl p-6 space-y-6 shadow-2xl my-8 text-right">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-emerald-950/80 border border-emerald-500/80 rounded-xl flex items-center justify-center text-emerald-400 font-black">
              V9
            </div>
            <div>
              <h2 className="text-lg font-black text-white">إعدادات منظومة التوافق ومربع التسعة V9.00 المتكاملة</h2>
              <p className="text-xs text-slate-400">إدارة رأس المال المؤسسية، قواطع الأمان التلقائية، جني الأرباح الجزئي، وفلاتر التوافق</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Institutional Risk Sizing & Hard Cap */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>1️⃣ إدارة رأس المال وحجم العقد (Institutional Risk Sizing)</span>
            </h3>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700 font-bold">
              OrderCalcProfit
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 mb-1 font-bold">نسبة المخاطرة (% Risk):</label>
              <input
                type="number"
                step="0.25"
                min="0.1"
                max="10"
                value={settings.riskPerTradePercent}
                onChange={(e) => setSettings({ ...settings, riskPerTradePercent: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-lg text-white font-mono font-bold"
              />
              <span className="text-[10px] text-slate-500">الافتراضي: 1.0% من الرصيد</span>
            </div>

            <div>
              <label className="block text-rose-300 mb-1 font-bold">سقف الخسارة الأقصى ($ Hard Cap):</label>
              <input
                type="number"
                step="100"
                min="50"
                value={settings.hardRiskCapUsdt}
                onChange={(e) => setSettings({ ...settings, hardRiskCapUsdt: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-rose-800 p-2.5 rounded-lg text-rose-300 font-mono font-bold"
              />
              <span className="text-[10px] text-slate-500">الافتراضي: $1,000 حد أقصى للصفقة</span>
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-bold">رأس المال الافتراضي ($ Balance):</label>
              <input
                type="number"
                value={settings.defaultAccountBalance}
                onChange={(e) => setSettings({ ...settings, defaultAccountBalance: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-lg text-white font-mono font-bold"
              />
              <span className="text-[10px] text-slate-500">الافتراضي: $10,000</span>
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-bold">الرافعة المالية (Leverage):</label>
              <select
                value={settings.accountLeverage}
                onChange={(e) => setSettings({ ...settings, accountLeverage: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-lg text-white font-mono font-bold cursor-pointer"
              >
                <option value={1}>1x (Spot)</option>
                <option value={5}>5x</option>
                <option value={10}>10x (قياسي)</option>
                <option value={20}>20x</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Trade Management (Scale-Out, Break-Even, ATR Trailing) */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-cyan-400" />
            <span>2️⃣ إدارة الصفقة وجني الأرباح (Trade Management)</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Partial Scale-Out (50%) */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-white">جني الأرباح الجزئي (Scale-Out)</span>
                <input
                  type="checkbox"
                  checked={settings.enablePartialScaleOut}
                  onChange={(e) => setSettings({ ...settings, enablePartialScaleOut: e.target.checked })}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">نسبة الإغلاق (%):</span>
                <input
                  type="number"
                  value={settings.partialScaleOutPercent}
                  onChange={(e) => setSettings({ ...settings, partialScaleOutPercent: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-white font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-400">إغلاق 50% من العقد تلقائياً وحجز ربحه عند وصول السعر لنسبة 1:1 R:R (TP1).</p>
            </div>

            {/* Auto Break-Even */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-white">تأمين الدخول (Break-Even)</span>
                <input
                  type="checkbox"
                  checked={settings.enableBreakEven}
                  onChange={(e) => setSettings({ ...settings, enableBreakEven: e.target.checked })}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">هامش العمولات (%):</span>
                <input
                  type="number"
                  step="0.01"
                  value={settings.breakEvenFeeBufferPercent}
                  onChange={(e) => setSettings({ ...settings, breakEvenFeeBufferPercent: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-white font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-400">نقل الوقف لسعر الدخول + تغطية السبريد والعمولة فور تحقيق TP1.</p>
            </div>

            {/* Smart ATR Trailing */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-white">الوقف المتحرك (ATR Trailing)</span>
                <input
                  type="checkbox"
                  checked={settings.enableAtrTrailingStop}
                  onChange={(e) => setSettings({ ...settings, enableAtrTrailingStop: e.target.checked })}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">مضاعف ATR:</span>
                <input
                  type="number"
                  step="0.1"
                  value={settings.atrTrailingMultiplier}
                  onChange={(e) => setSettings({ ...settings, atrTrailingMultiplier: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-white font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-400">تحريك الستوب ديناميكياً خلف السعر للجزء المتبقي (50%) بناءً على 1.5x ATR.</p>
            </div>
          </div>
        </div>

        {/* Section 3: Safety Circuit Breakers */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>3️⃣ قواطع الأمان التلقائية لمنع استنزاف الحساب (Safety Circuit Breakers)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {/* Daily Max Loss */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-rose-300">🛑 قاطع الخسارة اليومي (Daily Max Loss)</span>
                <input
                  type="checkbox"
                  checked={settings.enableDailyMaxLossCircuitBreaker}
                  onChange={(e) => setSettings({ ...settings, enableDailyMaxLossCircuitBreaker: e.target.checked })}
                  className="rounded border-slate-700 text-rose-500 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">الحد الأقصى (%):</span>
                <input
                  type="number"
                  step="0.5"
                  value={settings.dailyMaxLossPercent}
                  onChange={(e) => setSettings({ ...settings, dailyMaxLossPercent: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-rose-300 font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-500">إيقاف التداول آلياً إذا بلغت خسائر اليوم -{settings.dailyMaxLossPercent}%.</p>
            </div>

            {/* Daily Target Lock */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-amber-300">🏆 قفل الأرباح اليومية (Daily Target Lock)</span>
                <input
                  type="checkbox"
                  checked={settings.enableDailyTargetLock}
                  onChange={(e) => setSettings({ ...settings, enableDailyTargetLock: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">الهدف اليومي (%):</span>
                <input
                  type="number"
                  step="0.5"
                  value={settings.dailyTargetLockPercent}
                  onChange={(e) => setSettings({ ...settings, dailyTargetLockPercent: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-amber-300 font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-500">قفل الأرباح وإيقاف الصفقات فور الوصول لـ +{settings.dailyTargetLockPercent}% لمنع رد المكاسب.</p>
            </div>

            {/* Margin Guard */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-purple-300">⚠️ حارس الهامش (Margin Guard)</span>
                <input
                  type="checkbox"
                  checked={settings.enableMarginGuard}
                  onChange={(e) => setSettings({ ...settings, enableMarginGuard: e.target.checked })}
                  className="rounded border-slate-700 text-purple-500 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">أدنى نسبة هامش (%):</span>
                <input
                  type="number"
                  step="50"
                  value={settings.minMarginLevelPercent}
                  onChange={(e) => setSettings({ ...settings, minMarginLevelPercent: Number(e.target.value) })}
                  className="w-20 bg-slate-950 border border-slate-700 p-1 rounded text-purple-300 font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-500">حظر فتح صفقات جديدة إذا انخفض Margin Level عن {settings.minMarginLevelPercent}%.</p>
            </div>

            {/* Cooldown Filter */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-white">⏳ فترة التهدئة (Cooldown Block)</span>
                <input
                  type="checkbox"
                  checked={settings.enableCooldownFilter}
                  onChange={(e) => setSettings({ ...settings, enableCooldownFilter: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">المدة بالدقائق:</span>
                <input
                  type="number"
                  step="5"
                  value={settings.cooldownMinutes}
                  onChange={(e) => setSettings({ ...settings, cooldownMinutes: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-white font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-500">حظر التداول لمدة {settings.cooldownMinutes} دقيقة على نفس الأصل بعد إغلاق صفقة سابقة.</p>
            </div>

            {/* Continuous 24/7 Crypto Engine */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-cyan-300">⚡ سيولة مشفرة مستمرة (24/7 Continuous)</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 font-bold border border-cyan-800">مفعّل 24/7</span>
              </div>
              <p className="text-[10px] text-slate-400">سوق العملات الرقمية مفتوح على مدار الساعة في جميع الجلسات بدون قيود أو عطلات أسبوعية.</p>
            </div>

            {/* Max Slippage / Deviation Protection */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-cyan-300">🎯 حماية الانزلاق السعري (Max Slippage Deviation)</span>
                <input
                  type="checkbox"
                  checked={settings.enableDeviationProtection ?? true}
                  onChange={(e) => setSettings({ ...settings, enableDeviationProtection: e.target.checked })}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">أقصى انحراف (Points):</span>
                <input
                  type="number"
                  step="5"
                  min="5"
                  max="100"
                  value={settings.maxDeviationPoints ?? 20}
                  onChange={(e) => setSettings({ ...settings, maxDeviationPoints: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-cyan-300 font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-400">إلغاء الأمر فوراً إذا حاول السيرفر تمرير السعر بأسوأ من 20 نقطة أثناء قفزات السيولة.</p>
            </div>

            {/* Native Economic Calendar News Filter */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2 md:col-span-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-amber-300">📰 ربط التقويم الاقتصادي المدمج (MQL5 Calendar News Guard)</span>
                <input
                  type="checkbox"
                  checked={settings.enableEconomicCalendarFilter ?? true}
                  onChange={(e) => setSettings({ ...settings, enableEconomicCalendarFilter: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">نافذة الحظر قبل/بعد الخبر (دقائق):</span>
                <input
                  type="number"
                  step="5"
                  min="5"
                  max="60"
                  value={settings.calendarNewsBufferMinutes ?? 15}
                  onChange={(e) => setSettings({ ...settings, calendarNewsBufferMinutes: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-amber-300 font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-400">حظر التداول آلياً قبل وبعد 15 دقيقة من الأخبار المصنفة High Impact (قرارات الفائدة الفيدرالية، التضخم CPI، وبيانات التوظيف NFP).</p>
            </div>
          </div>
        </div>

        {/* Section 4: 5 Confirmation Layers (Institutional Confirmation Matrix) */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>4️⃣ مصفوفة طبقات التأكيد المؤسسية ومستوى الإشارات (SOP Gates)</span>
            </h3>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700 font-bold">
              متوافق مع فاحص الخلفية 24/7
            </span>
          </div>

          {/* Unified SOP Gate Threshold for App & Background Scanner */}
          <div className="p-3.5 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/40 rounded-xl border border-emerald-800/60 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>الحد الأدنى لبوابات التأكيد لإصدار الإشارة (SOP Gate Threshold):</span>
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  يتحكم هذا الخيار في شروط ظهور الإشارات بالتطبيق وخلفية السيرفر التلقائي (24/7 Scanner) في نفس الوقت.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {[
                  { score: 4, label: '4 من 5 (المرن 80%)', desc: 'دقة مؤسسية عالية مع استثناء فلتر فرعي' },
                  { score: 5, label: '5 من 5 (التام 100%)', desc: 'توافق كامل لكافة البوابات الخمس' },
                ].map((item) => {
                  const currentScore = settings.sopScoreNeeded === 5 ? 5 : 4;
                  const isSelected = currentScore === item.score;
                  return (
                    <button
                      key={item.score}
                      type="button"
                      onClick={() => {
                        setSettings({
                          ...settings,
                          sopScoreNeeded: item.score,
                          flexibleMode: item.score === 4,
                        });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="text-[10px] text-emerald-300/80 bg-slate-950/60 p-2 rounded border border-emerald-900/40 flex items-center justify-between">
              <span>
                🎯 <strong>الوضع الفعّال حالياً:</strong> {settings.sopScoreNeeded === 4 ? 'الوضع المعتمد (4/5 بوابات - 80%) - صفقات مؤسسية مع استثناء فلتر فرعي.' : 'الوضع التام (5/5 بوابات - 100%) - توافق كامل لكافة أركان الاستراتيجية الخمسة.'}
              </span>
              <span className="text-cyan-400 font-mono">سيتطابق مع السيرفر آلياً عند الحفظ</span>
            </div>
          </div>

          {/* Daily Macro Trend Bias Gate 0 - Enterprise Directional Anchor */}
          <div className="p-3.5 bg-gradient-to-r from-blue-950/40 via-indigo-950/40 to-slate-900 rounded-xl border border-indigo-700/60 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableDailyMacroBias ?? true}
                  onChange={(e) => setSettings({ ...settings, enableDailyMacroBias: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-indigo-900/80 text-indigo-300 font-mono text-[10px] border border-indigo-700">Gate 0</span>
                  <span>المحدد الاتجاهي الكلي العلوي (Daily Macro Trend Bias - 1D 50 EMA)</span>
                </span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 text-[11px]">فترة متوسط EMA اليومي:</span>
                <input
                  type="number"
                  step="5"
                  min="10"
                  max="200"
                  value={settings.dailyEmaPeriod ?? 50}
                  onChange={(e) => setSettings({ ...settings, dailyEmaPeriod: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-indigo-700 p-1 rounded text-indigo-300 font-mono text-center font-bold text-xs"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              فلتر علوي صلب يُلزم المحرك باتجاه الإغلاق اليومي السابق مقارنة بمتوسط {settings.dailyEmaPeriod || 50} EMA اليومي:
              <br />
              🟢 <strong className="text-emerald-400">المسار الصاعد (Macro Bullish):</strong> إذا كان الإغلاق اليومي السابق أعلى من 50 EMA اليومي، يُمنح الضوء الأخضر لصفقات الشراء فقط وتُستبعد صفقات البيع المعاكسة.
              <br />
              🔴 <strong className="text-rose-400">المسار الهابط (Macro Bearish):</strong> إذا كان الإغلاق اليومي السابق أدنى من 50 EMA اليومي، يُمنح الضوء الأخضر لصفقات البيع فقط وتُستبعد صفقات الشراء المعاكسة.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* 1. Tick Volume Filter */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-white">1️⃣ فلتر الفوليوم اللحظي (Tick Volume)</span>
                <input
                  type="checkbox"
                  checked={settings.enableVolumeFilter ?? true}
                  onChange={(e) => setSettings({ ...settings, enableVolumeFilter: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">مضاعف الفوليوم (SMA20x):</span>
                <input
                  type="number"
                  step="0.05"
                  min="1.0"
                  max="3.0"
                  value={settings.volumeMultiplierThreshold ?? 1.15}
                  onChange={(e) => setSettings({ ...settings, volumeMultiplierThreshold: Number(e.target.value) })}
                  className="w-20 bg-slate-950 border border-slate-700 p-1 rounded text-white font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-500">حجم الشمعة المغلقة {'>'} متوسط 20 شمعة بمعدل {settings.volumeMultiplierThreshold || 1.15}x.</p>
            </div>

            {/* 2. Price Action Rejection */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-white">2️⃣ الرفض السعري (Rejection Wick)</span>
                <input
                  type="checkbox"
                  checked={settings.enablePriceActionRejection ?? true}
                  onChange={(e) => setSettings({ ...settings, enablePriceActionRejection: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">الحد الأدنى للذيل (%):</span>
                <input
                  type="number"
                  step="5"
                  min="15"
                  max="60"
                  value={settings.wickRejectionThresholdPercent ?? 30}
                  onChange={(e) => setSettings({ ...settings, wickRejectionThresholdPercent: Number(e.target.value) })}
                  className="w-20 bg-slate-950 border border-slate-700 p-1 rounded text-white font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-500">طول ذيل الرفض {'>'} {settings.wickRejectionThresholdPercent || 30}% من إجمالي طول الشمعة.</p>
            </div>

            {/* 3. Micro BOS */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-white">3️⃣ كسر الهيكل المصغر (Micro BOS)</span>
                <input
                  type="checkbox"
                  checked={settings.enableMicroBOS ?? true}
                  onChange={(e) => setSettings({ ...settings, enableMicroBOS: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400">إغلاق شمعة الدخول أعلى قمة أو أدنى قاع لآخر 3 شموع لتأكيد تحول الزخم.</p>
            </div>

            {/* 4. 1H 50 EMA Guard */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-white">4️⃣ حارس متوسط 50 EMA (1H Guard)</span>
                <input
                  type="checkbox"
                  checked={settings.enableEma50Guard ?? true}
                  onChange={(e) => setSettings({ ...settings, enableEma50Guard: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400">منع الشراء إذا كان السعر أسفل 50 EMA على 1H، ومنع البيع إذا كان أعلاها.</p>
            </div>

            {/* 5. Bollinger Bandwidth Filter */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2 md:col-span-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-white">5️⃣ فلتر اتساع البولنجر وتجنب التذبذب العرضي (Bandwidth Expansion)</span>
                <input
                  type="checkbox"
                  checked={settings.enableBandwidthFilter ?? true}
                  onChange={(e) => setSettings({ ...settings, enableBandwidthFilter: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">الحد الأدنى للاتساع (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.3"
                  max="3.0"
                  value={settings.minBandwidthPercent ?? 0.8}
                  onChange={(e) => setSettings({ ...settings, minBandwidthPercent: Number(e.target.value) })}
                  className="w-20 bg-slate-950 border border-slate-700 p-1 rounded text-white font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-500">حجب الصفقات أثناء فترات التضييق الشديد (Bandwidth {'<'} {settings.minBandwidthPercent || 0.8}%) لتفادي الفخاخ السعرية.</p>
            </div>

            {/* 6. Closed Candle Lock (Anti-Signal Flickering) */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-emerald-300">🔒 قفل تأكيد إغلاق الشمعة (Closed-Candle Lock)</span>
                <input
                  type="checkbox"
                  checked={settings.requireClosedCandleConfirm ?? true}
                  onChange={(e) => setSettings({ ...settings, requireClosedCandleConfirm: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                يمنع انعكاس وتذبذب الإشارة: يتم قياس الفوليوم وذيول الرفض وكسر الهيكل على <strong>الشمعة المغلقة المكتملة [1]</strong> فقط وليس الشمعة المفتوحة المتقلبة.
              </p>
            </div>

            {/* 7. Anti-Stop-Hunt Buffer */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-cyan-300">🛡️ حاجز حماية صائد الوقف (Anti-Stop-Hunt Buffer)</span>
                <input
                  type="checkbox"
                  checked={settings.enableAntiStopHuntBuffer ?? true}
                  onChange={(e) => setSettings({ ...settings, enableAntiStopHuntBuffer: e.target.checked })}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">مضاعف حاجز ATR للأمان:</span>
                <input
                  type="number"
                  step="0.25"
                  min="0.5"
                  max="2.5"
                  value={settings.antiStopHuntMultiplier ?? 1.0}
                  onChange={(e) => setSettings({ ...settings, antiStopHuntMultiplier: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-cyan-300 font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                يضع وقف الخسارة خلف القاع أو القمة بمسافة أمان إضافية لمنع صناع السوق من اصطياد الوقف بذيول السيولة (Liquidity Sweeps).
              </p>
            </div>

            {/* 8. Entry Proximity Gate */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-amber-300">🎯 فلتر مسافة الدخول (Entry Proximity Gate)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">أقصى مسافة مسموحة (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="2.0"
                  value={settings.maxEntryProximityPercent ?? 0.8}
                  onChange={(e) => setSettings({ ...settings, maxEntryProximityPercent: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-amber-300 font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                يمنع إرسال إشارات معلقة إذا كان السعر الحالي يبتعد بأكثر من {settings.maxEntryProximityPercent || 0.8}% عن نقطة الدخول، لتفادي التشتت ومطاردة السعر (Anti-FOMO).
              </p>
            </div>

            {/* 9. Binance Parallel Price Display */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-yellow-300">🔶 سعر Binance الموازي في الإشعار</span>
                <input
                  type="checkbox"
                  checked={settings.includeBinancePrice ?? true}
                  onChange={(e) => setSettings({ ...settings, includeBinancePrice: e.target.checked })}
                  className="rounded border-slate-700 text-yellow-500 focus:ring-yellow-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                إدراج سعر بينانس اللحظي جنباً إلى جنب مع سعر OKX في رسائل تليجرام، مع توضيح نوع الأمر (معلق Limit أم فوري Market) لمنع أي التباس مع الشارت.
              </p>
            </div>

            {/* 10. Anti-FOMO Guard */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-rose-300">🛑 فلتر منع مطاردة القمم والقيعان (Anti-FOMO)</span>
                <input
                  type="checkbox"
                  checked={settings.enableAntiFomoGuard ?? true}
                  onChange={(e) => setSettings({ ...settings, enableAntiFomoGuard: e.target.checked })}
                  className="rounded border-slate-700 text-rose-500 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">أقصى تباعد عن 20 EMA (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="3.0"
                  value={settings.antiFomoMaxExtensionPercent ?? 1.2}
                  onChange={(e) => setSettings({ ...settings, antiFomoMaxExtensionPercent: Number(e.target.value) })}
                  className="w-16 bg-slate-950 border border-slate-700 p-1 rounded text-rose-300 font-mono text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                حظر الشراء إذا كان السعر أعلى من متوسط 20 EMA بأكثر من {settings.antiFomoMaxExtensionPercent || 1.2}%، وحظر البيع عند القيعان الممتدة، لتفادي مصائد السيولة والانعكاسات المفاجئة.
              </p>
            </div>

            {/* 11. Altcoin Session Liquidity Guard */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-indigo-300">🌙 فلتر ركود سيولة العملات البديلة (Session Guard)</span>
                <input
                  type="checkbox"
                  checked={settings.enableAltcoinSessionGuard ?? true}
                  onChange={(e) => setSettings({ ...settings, enableAltcoinSessionGuard: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                حظر صفقات العملات البديلة خلال ساعات الركود والتصفيات (22:00 - 06:00 UTC) وقصر التداول على البيتكوين فقط لتفادي الكسر الكاذب والانزلاق السعري.
              </p>
            </div>

            {/* 12. Adverse Rejection Wick Guard */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-amber-300">🕯️ فلتر الشموع الرافضة (Adverse Wick Guard)</span>
                <input
                  type="checkbox"
                  checked={settings.enableAdverseWickGuard ?? true}
                  onChange={(e) => setSettings({ ...settings, enableAdverseWickGuard: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                فحص شمعة 15M المكتملة وحظر الشراء إذا أغلقت بنموذج شهاب بيعي (ذيل علوي ≥ 50%) وحظر البيع إذا أغلقت بنموذج مطرقة شرائية (ذيل سفلي ≥ 50%).
              </p>
            </div>

            {/* 13. Adaptive Altcoin Stop Loss Buffer */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-emerald-300">🛡️ الوقف التكيفي للعملات البديلة (Adaptive SL)</span>
                <input
                  type="checkbox"
                  checked={settings.enableAdaptiveAltcoinBuffer ?? true}
                  onChange={(e) => setSettings({ ...settings, enableAdaptiveAltcoinBuffer: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                توسيع وقف الخسارة للعملات البديلة إلى 2.4x ATR مع هامش 1.2% لحمايتها من ذيول ضرب الوقف السريعة، مع تصغير حجم العقد آلياً لتثبيت المخاطرة عند 1% بالضبط.
              </p>
            </div>

            {/* 14. Max SL Cap for Leveraged Safety */}
            <div className="p-3 bg-slate-900 rounded-xl border border-rose-900/40 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-rose-300">🛡️ سقف الوقف الأقصى لحماية الرافعة (Max SL Cap)</span>
                <input
                  type="checkbox"
                  checked={settings.enableMaxSlCap ?? true}
                  onChange={(e) => setSettings({ ...settings, enableMaxSlCap: e.target.checked })}
                  className="rounded border-slate-700 text-rose-500 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-300">أقصى مسافة وقف مسموحة:</span>
                <input
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="4.0"
                  value={settings.maxSlDistancePercent ?? 2.2}
                  onChange={(e) => setSettings({ ...settings, maxSlDistancePercent: Math.max(1.0, parseFloat(e.target.value) || 2.2) })}
                  className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-center text-xs font-mono font-bold text-rose-400 focus:border-rose-500 outline-none"
                />
                <span className="text-[11px] text-slate-400">% من سعر الدخول</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                يحدد سقفاً صارماً لمسافة الوقف (2.2% كحد أقصى)، مما يضمن عدم تجاوز الخسارة حاجز 11% بالرافعة 5x ويمنع الخسائر الحادة مثل AVAX نهائياً.
              </p>
            </div>

            {/* 15. Lock Profit Rule (+0.5R at 50% TP) */}
            <div className="p-3 bg-slate-900 rounded-xl border border-cyan-900/40 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-cyan-300">💰 قاعدة حجز الأرباح المضمونة (+0.5R عند 50% من الهدف)</span>
                <input
                  type="checkbox"
                  checked={settings.enableEarlyBreakevenAlert ?? true}
                  onChange={(e) => setSettings({ ...settings, enableEarlyBreakevenAlert: e.target.checked })}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                تضمين مستوى حجز أرباح لحظي في إشارات التليجرام والشارت: بمجرد وصول السعر لـ 50% من مشوار الهدف، يُرفع الوقف فوراً إلى مستوى ربح +0.5R لضمان الخروج بمكسب مؤكد حتى لو انعكس السوق.
              </p>
            </div>

            {/* 16. BTC 15M Intraday Dump Guard */}
            <div className="p-3 bg-slate-900 rounded-xl border border-amber-900/40 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-bold text-amber-300">⚡ صمام أمان البتكوين اللحظي (BTC 15M Dump Guard)</span>
                <input
                  type="checkbox"
                  checked={settings.enableBtc15mIntradayGuard ?? true}
                  onChange={(e) => setSettings({ ...settings, enableBtc15mIntradayGuard: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                مراقبة هبوط شمعة 15M اللحظية للبيتكوين؛ إذا هبطت بأكثر من 0.85%، يتم فوراً تجميد شراء العملات البديلة لحين استقرار الشمعة وتفادي السقوط المفاجئ.
              </p>
            </div>
          </div>
        </div>

        {/* Section 5: Manual Trade Execution Mode */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>5️⃣ نظام تنفيذ الصفقات (Manual Trade Execution)</span>
            </h3>
            <span className="text-[10px] bg-slate-800 text-amber-300 px-2 py-0.5 rounded border border-amber-600/50 font-bold">
              دخول يدوي فقط ✋
            </span>
          </div>

          <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 space-y-2.5">
            <div className="space-y-0.5">
              <span className="font-bold text-white text-xs block">أوامر دخول الصفقات: يدوية بالكامل</span>
              <span className="text-[11px] text-slate-400 block">
                يقوم النظام بتحليل السوق ورصد الإشارات الفنية ونقاط الدخول والأهداف (TP1-TP4) ووقف الخسارة بدقة، ويتم تنفيذ الصفقات حصرياً عبر ضغطك اليدوي على زر "دخول الصفقة".
              </span>
            </div>
            <div className="text-[11px] text-emerald-400/90 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-800/40 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <span>
                <strong>أمان رأس المال:</strong> يتم حساب أحجام العقود وإدارة المخاطر آلياً عند نقرك على زر فتح الصفقة لضمان الالتزام بقواعد إدارة رأس المال.
              </span>
            </div>
          </div>
        </div>

        {/* Section 6: Telegram Bot Integration */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
              <Send className="w-4 h-4 text-sky-400" />
              <span>6️⃣ ربط إشعارات بوت التليجرام (Telegram Bot Integration)</span>
            </h3>
            <span className="text-[10px] bg-sky-950 text-sky-300 px-2.5 py-0.5 rounded-full border border-sky-600/50 font-bold">
              متصل ونشط ✈️
            </span>
          </div>

          <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[10px]">البوت المربوط:</span>
                <div className="font-mono font-bold text-sky-400 flex items-center gap-1">
                  <a
                    href="https://t.me/crypto_trade_analyzer_bot"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline flex items-center gap-1 text-sky-400"
                    title="انقر لفتح البوت في تليجرام والضغط على ابدأ (Start)"
                  >
                    <span>@crypto_trade_analyzer_bot</span>
                    <span className="text-[10px] text-sky-300 font-sans">(فتح البوت)</span>
                  </a>
                </div>
              </div>
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[10px]">معرّف المحادثة (Chat ID):</span>
                <div className="font-mono font-bold text-slate-200">
                  1242072321
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="font-bold text-sky-300 text-xs flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>منع تكرار الإشعارات لنفس الصفقة (Anti-Spam Cooldown):</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="5"
                    max="180"
                    step="5"
                    value={settings.signalCooldownMinutes ?? 30}
                    onChange={(e) => setSettings({ ...settings, signalCooldownMinutes: Math.max(5, Number(e.target.value)) })}
                    className="w-20 bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white font-mono text-center font-bold text-xs"
                  />
                  <span className="text-slate-400 text-xs font-bold">دقيقة</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                يمنع تكرار تنبيه نفس الصفقة لنفس العملة في إطار زمني أقل من <strong>{settings.signalCooldownMinutes ?? 30} دقيقة</strong> لتقليل الإزعاج وتفادي التكرار عند تذبذب الشموع.
              </p>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              يتم إرسال كافة إشارات الشراء والبيع المعتمدة، مع أسعار الدخول، أهداف الأرباح (TP1-TP4)، ونقاط وقف الخسارة إلى حسابك على تليجرام والمتصفح فور صدورها من ماسح السوق والتحليل الفني.
            </p>

            <div className="flex items-center gap-3 pt-1 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  const res = await testTelegramConnection();
                  alert(res.message);
                }}
                className="px-3 py-2 bg-sky-950 hover:bg-sky-900 text-sky-300 hover:text-white font-bold text-xs rounded-xl border border-sky-600/60 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-sky-400" />
                <span>إرسال إشعار تجريبي فوري لتليجرام ✈️</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const count = signalNotificationManager.getNotifiedCount();
                  signalNotificationManager.clearAll();
                  alert(`تم تصفير سجل منع التكرار بنجاح (${count} صفقة تم تفريغها). يمكن استقبال الإشعارات الآن فورياً.`);
                }}
                className="px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                title="إفراغ سجل منع التكرار لإتاحة استقبال التنبيهات من جديد دون انتظار الـ 30 دقيقة"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                <span>إفراغ سجل مهلة الإشعارات 🔄</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section 7: Turso Cloud Database Integration */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>7️⃣ ربط وحفظ واسترجاع الصفقات على قاعدة بيانات Turso Cloud</span>
            </h3>
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold flex items-center gap-1 ${
              tursoStatus?.connected 
                ? 'bg-emerald-950 text-emerald-300 border-emerald-600/50' 
                : 'bg-amber-950 text-amber-300 border-amber-600/50'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tursoStatus?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {tursoStatus?.connected ? 'متصل بنجاح بالسحابة ☁️' : 'جاري الفحص...'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[10px]">سيرفر قاعدة البيانات (Database Host):</span>
                <div className="font-mono font-bold text-emerald-400 truncate text-[11px]" title={tursoStatus?.host || 'okx-crypto-analyzer-fadyezzaat.aws-eu-west-1.turso.io'}>
                  {tursoStatus?.host || 'okx-crypto-analyzer-fadyezzaat.aws-eu-west-1.turso.io'}
                </div>
              </div>
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[10px]">إحصائيات الصفقات في السحابة:</span>
                <div className="font-mono font-bold text-slate-200 flex items-center gap-2">
                  <span>{tursoStatus?.totalTradesLogged ?? 0} صفقة مسجلة</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-cyan-400">{tursoStatus?.totalSignalsLogged ?? 0} إشارة</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              يتم حفظ واسترجاع كافة الصفقات المفتوحة والمغلقة وتفاصيل إدارة المخاطر وسجل التداول تلقائياً على قاعدة بيانات <strong>Turso Cloud</strong> (منطقة AWS EU-West-1) لضمان مزامنتها بين الجوال والكمبيوتر دون أي فقدان للبيانات.
            </p>

            {tursoFeedback && (
              <div className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-between ${
                tursoFeedback.isError 
                  ? 'bg-rose-950/80 border-rose-700 text-rose-300' 
                  : 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
              }`}>
                <span>{tursoFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setTursoFeedback(null)}
                  className="text-slate-400 hover:text-white text-sm ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button
                type="button"
                disabled={testingTurso}
                onClick={async () => {
                  setTestingTurso(true);
                  const res = await checkTursoConnection(true);
                  setTursoStatus(res);
                  setTestingTurso(false);
                  setTursoFeedback({ message: res.message, isError: !res.connected });
                }}
                className="px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${testingTurso ? 'animate-spin' : ''}`} />
                <span>فحص الاتصال بـ Turso</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const port = getPaperPortfolio();
                  const ok = await savePortfolioToTurso(port);
                  if (ok) {
                    const status = await checkTursoConnection(true);
                    setTursoStatus(status);
                    setTursoFeedback({
                      message: `✅ تم حفظ كافة صفقات المحفظة في Turso بنجاح! (صفقات مفتوحة: ${port.openTrades.length} | صفقات مغلقة: ${port.closedTrades.length})`,
                      isError: false,
                    });
                  } else {
                    setTursoFeedback({
                      message: '⚠️ فشل الحفظ في Turso، يرجى التأكد من الاتصال بقاعدة البيانات.',
                      isError: true,
                    });
                  }
                }}
                className="px-3 py-2 bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 hover:text-white font-bold text-xs rounded-xl border border-emerald-600/50 flex items-center gap-1.5 transition cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                <span>حفظ ومزامنة الصفقات الآن ☁️</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const restored = await fetchPaperPortfolioFromTurso();
                  if (restored) {
                    const status = await checkTursoConnection(true);
                    setTursoStatus(status);
                    setTursoFeedback({
                      message: `✅ تم استرجاع الصفقات بنجاح من Turso! (مفتوحة: ${restored.openTrades.length} | مغلقة: ${restored.closedTrades.length} | الرصيد: $${restored.cashBalance.toFixed(2)})`,
                      isError: false,
                    });
                  } else {
                    setTursoFeedback({
                      message: 'لم يتم العثور على صفقات سابقة مسجلة في السحابة.',
                      isError: true,
                    });
                  }
                }}
                className="px-3 py-2 bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 hover:text-white font-bold text-xs rounded-xl border border-cyan-600/50 flex items-center gap-1.5 transition cursor-pointer"
              >
                <DownloadCloud className="w-3.5 h-3.5 text-cyan-400" />
                <span>استرجاع الصفقات من Turso 📥</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center gap-3 border-t border-slate-800 pt-4 flex-wrap">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-3.5 py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-slate-800 flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>استعادة الإعدادات الافتراضية لـ V9.00</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 font-bold text-xs rounded-xl border border-slate-800 transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              {savedSuccess ? <CheckCircle2 className="w-4 h-4 text-slate-950" /> : <Save className="w-4 h-4" />}
              <span>{savedSuccess ? 'تم الحفظ بنجاح! ✓' : 'حفظ التعديلات والإعدادات'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

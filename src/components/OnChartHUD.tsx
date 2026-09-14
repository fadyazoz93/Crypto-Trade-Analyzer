import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Shield, Zap, TrendingUp, TrendingDown, DollarSign, Activity, AlertTriangle, Lock, Award, Clock, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { getPaperPortfolio, checkCircuitBreakersStatus, CircuitBreakerState, PaperPortfolio } from '../utils/paperTradingStore';
import { getStrategySettings } from '../utils/settingsStore';

interface OnChartHUDProps {
  portfolio?: PaperPortfolio;
  selectedSymbol?: string;
  onOpenSettings?: () => void;
  onNavigateToPaper?: () => void;
}

export const OnChartHUD: React.FC<OnChartHUDProps> = ({
  portfolio: propPortfolio,
  selectedSymbol = 'BTCUSDT',
  onOpenSettings,
  onNavigateToPaper,
}) => {
  const [internalPortfolio, setInternalPortfolio] = useState<PaperPortfolio>(() => propPortfolio || getPaperPortfolio());
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [settings, setSettings] = useState(() => getStrategySettings());

  // Keep internal portfolio in sync if prop changes
  useEffect(() => {
    if (propPortfolio) {
      setInternalPortfolio(propPortfolio);
    }
  }, [propPortfolio]);

  // Sync with strategy settings updates
  useEffect(() => {
    const handleSettingsUpdate = () => {
      setSettings(getStrategySettings());
    };
    window.addEventListener('strategy-settings-updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('strategy-settings-updated', handleSettingsUpdate);
    };
  }, []);

  // Sync with portfolio updates if no prop passed from parent
  useEffect(() => {
    if (propPortfolio) return;
    const handleUpdate = () => setInternalPortfolio(getPaperPortfolio());
    window.addEventListener('paper-portfolio-updated', handleUpdate);
    const interval = setInterval(handleUpdate, 3000);
    return () => {
      window.removeEventListener('paper-portfolio-updated', handleUpdate);
      clearInterval(interval);
    };
  }, [propPortfolio]);

  const activePortfolio = propPortfolio || internalPortfolio;
  const circuitState: CircuitBreakerState = checkCircuitBreakersStatus(activePortfolio, selectedSymbol);

  const isProfit = circuitState.todayNetPnlUsdt >= 0;
  const targetPercent = settings.dailyTargetLockPercent || 15.0;
  const maxLossPercent = settings.dailyMaxLossPercent || 8.0;

  // Progress towards target or max loss
  const progressToTarget = Math.min(100, Math.max(0, (circuitState.todayNetPnlPercent / targetPercent) * 100));
  const progressToMaxLoss = circuitState.todayNetPnlPercent < 0
    ? Math.min(100, Math.max(0, (Math.abs(circuitState.todayNetPnlPercent) / maxLossPercent) * 100))
    : 0;

  return (
    <div className="bg-slate-950/95 border border-slate-800/90 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden transition-all duration-200">
      {/* Top Header Strip */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-emerald-950/90 border border-emerald-500/80 flex items-center justify-center text-emerald-400 font-black text-xs shadow-lg shadow-emerald-950/50">
              V9
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                circuitState.isTradingAllowed ? 'bg-emerald-400' : 'bg-rose-400'
              }`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                circuitState.isTradingAllowed ? 'bg-emerald-500' : 'bg-rose-500'
              }`} />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white tracking-wide">
                لوحة التحكم الحية (Confluence & Risk HUD)
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono font-bold">
                Institutional
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              محرك إدارة المخاطر وقواطع الأمان التلقائية
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Bot Engine State Badge */}
          <div className={`px-3 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 shadow-sm ${
            circuitState.botState === 'RUNNING'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/80'
              : circuitState.botState === 'DAILY_TARGET_LOCK'
              ? 'bg-amber-950/80 text-amber-300 border-amber-600/80'
              : circuitState.botState === 'DAILY_LOSS_LOCK'
              ? 'bg-rose-950/80 text-rose-300 border-rose-600/80'
              : circuitState.botState === 'MARGIN_GUARD_LOCK'
              ? 'bg-purple-950/80 text-purple-300 border-purple-600/80'
              : 'bg-cyan-950/80 text-cyan-300 border-cyan-600/80'
          }`}>
            {circuitState.botState === 'RUNNING' && <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />}
            {circuitState.botState === 'DAILY_TARGET_LOCK' && <Award className="w-3.5 h-3.5 text-amber-400" />}
            {circuitState.botState === 'DAILY_LOSS_LOCK' && <Lock className="w-3.5 h-3.5 text-rose-400" />}
            {circuitState.botState === 'MARGIN_GUARD_LOCK' && <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />}
            {circuitState.botState === 'FRIDAY_GAP_GUARD_BLOCK' && <Shield className="w-3.5 h-3.5 text-purple-400" />}
            {circuitState.botState === 'NEWS_CALENDAR_BLOCK' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
            {circuitState.botState === 'COOLDOWN' && <Clock className="w-3.5 h-3.5 text-cyan-400" />}
            {circuitState.botState === 'NY_VOLATILITY_BLOCK' && <AlertTriangle className="w-3.5 h-3.5 text-cyan-400" />}
            <span className="font-extrabold">{circuitState.statusBadge.label}</span>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer"
            title={isExpanded ? 'طي اللوحة' : 'توسيع اللوحة'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Metrics Box */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Main 4 Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-right">
            {/* 1. Account Equity & Cash */}
            <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                <span>سيولة الحساب (Equity):</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="font-mono text-lg font-black text-white">
                ${circuitState.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                كاش متاح: ${activePortfolio.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* 2. Today's PnL & Target Lock Progress */}
            <div className={`p-3 rounded-xl border space-y-1 ${
              isProfit ? 'bg-emerald-950/30 border-emerald-800/50' : 'bg-rose-950/30 border-rose-800/50'
            }`}>
              <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span>أرباح/خسائر اليوم (Today PnL):</span>
                {isProfit ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-400" />}
              </div>
              <div className={`font-mono text-lg font-black ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isProfit ? '+' : ''}${circuitState.todayNetPnlUsdt.toFixed(2)}
                <span className="text-xs font-normal mr-1.5 opacity-90">
                  ({isProfit ? '+' : ''}{circuitState.todayNetPnlPercent.toFixed(2)}%)
                </span>
              </div>
              {/* Target / Loss Progress Bar */}
              <div className="space-y-0.5 pt-0.5">
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden flex">
                  {isProfit ? (
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressToTarget}%` }}
                    />
                  ) : (
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressToMaxLoss}%` }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                  <span>قاطع الخسارة: -{maxLossPercent}%</span>
                  <span>قفل الربح: +{targetPercent}%</span>
                </div>
              </div>
            </div>

            {/* 3. Margin Level Health */}
            <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                <span>مستوى الهامش (Margin Level):</span>
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="font-mono text-lg font-black text-cyan-300">
                {circuitState.marginLevelPercent > 9000 ? '∞ 100%' : `${circuitState.marginLevelPercent.toFixed(0)}%`}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                الهامش المستخدم: ${circuitState.usedMarginUsdt.toFixed(2)} (الحد: 500%)
              </div>
            </div>

            {/* 4. Open Trades & Hard Cap Indicator */}
            <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                <span>الصفقات المفتوحة / السقف:</span>
                <Activity className="w-3.5 h-3.5 text-teal-400" />
              </div>
              <div className="font-mono text-lg font-black text-teal-300 flex items-center justify-between">
                <span>{circuitState.openTradesCount} صفقات</span>
                <span className="text-[10px] bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-normal">
                  سقف ${settings.hardRiskCapUsdt || 1000}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                إغلاق جزئي 50% عند 1:1 R:R مع نقل الستوب للدخول
              </div>
            </div>
          </div>

          {/* Quick Safety Audit Description Strip */}
          <div className="flex items-center justify-between bg-slate-900/60 px-3.5 py-2 rounded-xl border border-slate-800 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">● حالة قواطع الأمان:</span>
              <span className="text-slate-300">{circuitState.statusBadge.description}</span>
            </div>

            <div className="flex items-center gap-2">
              {onNavigateToPaper && (
                <button
                  onClick={onNavigateToPaper}
                  className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition cursor-pointer underline underline-offset-2"
                >
                  سجل المحفظة الافتراضية ←
                </button>
              )}
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="text-[11px] font-bold text-slate-400 hover:text-white transition cursor-pointer"
                >
                  ⚙️ تعديل الإعدادات
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

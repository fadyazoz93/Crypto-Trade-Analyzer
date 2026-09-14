import React, { useState, useEffect } from 'react';
import { Zap, Clock, Bell, BellOff, ShieldCheck, Flame, Layers, CheckCircle2, Send, Check, Server } from 'lucide-react';
import { checkTradingTimeGuard } from '../utils/technicalAnalysis';
import { TradingMode } from '../types';
import { testTelegramConnection } from '../utils/telegramNotifications';

interface HeaderProps {
  lastUpdated: string | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
  notificationsEnabled?: boolean;
  onToggleNotifications?: () => void;
  activeSymbol: string;
  wsStatus?: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  tradingMode?: TradingMode;
  onToggleTradingMode?: (mode: TradingMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  lastUpdated,
  soundEnabled,
  onToggleSound,
  notificationsEnabled = false,
  onToggleNotifications,
  activeSymbol,
  wsStatus = 'CONNECTED',
  tradingMode = 'SCALP',
  onToggleTradingMode,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [testingTelegram, setTestingTelegram] = useState<boolean>(false);
  const [telegramSent, setTelegramSent] = useState<boolean>(false);
  const [daemonStatus, setDaemonStatus] = useState<{ active: boolean; scans: number; scanning: boolean } | null>(null);

  // Poll background daemon status every 12 seconds
  useEffect(() => {
    let mounted = true;
    const fetchDaemon = async () => {
      try {
        const res = await fetch('/api/daemon/status');
        if (res.ok && mounted) {
          const data = await res.json();
          setDaemonStatus({
            active: data.isActive,
            scans: data.totalScans || 0,
            scanning: data.isScanning || false,
          });
        }
      } catch {}
    };

    fetchDaemon();
    const timer = setInterval(fetchDaemon, 12000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const handleTestTelegram = async () => {
    if (testingTelegram) return;
    setTestingTelegram(true);
    const res = await testTelegramConnection();
    setTestingTelegram(false);
    if (res.success) {
      setTelegramSent(true);
      setTimeout(() => setTelegramSent(false), 4000);
    } else {
      alert(res.message);
    }
  };

  useEffect(() => {
    const update = () => {
      setCurrentTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const isWsLive = wsStatus === 'CONNECTED';

  return (
    <header className="bg-slate-900 border border-slate-800 p-3 sm:p-5 md:p-6 rounded-2xl shadow-2xl relative overflow-hidden">
      {/* Decorative ambient gradient backdrop */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-2.5 sm:gap-4">
        {/* Title and Badges */}
        <div className="space-y-1.5 sm:space-y-2 w-full md:w-auto">
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            {/* Live WebSocket Status Badge */}
            <span
              className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold shadow-md transition-all ${
                isWsLive
                  ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/80 shadow-emerald-900/50'
                  : 'bg-amber-950/90 text-amber-300 border border-amber-600/80'
              }`}
            >
              <span className="relative flex h-1.5 w-1.5 sm:h-2.5 sm:w-2.5 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isWsLive ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2.5 sm:w-2.5 ${isWsLive ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
              <span>{isWsLive ? 'بث حي 🔴' : 'جاري الربط...'}</span>
            </span>

            <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold bg-slate-950 text-cyan-300 border border-cyan-800/80">
              <img src="/logo.svg" alt="Logo" className="w-3.5 h-3.5 object-contain" />
              <span>بيانات OKX الرسمية ⚡</span>
            </span>

            {/* Telegram Bot Notification Status Badge with Instant Test */}
            <button
              type="button"
              onClick={handleTestTelegram}
              disabled={testingTelegram}
              className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all cursor-pointer shadow-sm ${
                telegramSent
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500 shadow-emerald-900/50'
                  : 'bg-sky-950/90 text-sky-300 border border-sky-600/80 hover:bg-sky-900/90 shadow-sky-950'
              }`}
              title="بوت التليجرام مفعّل (@FadyTrade_bot) - انقر لإرسال إشعار تجريبي فوري إلى حسابك"
            >
              <Send className={`w-3 h-3 text-sky-400 ${testingTelegram ? 'animate-spin' : ''}`} />
              <span>{testingTelegram ? 'جاري الإرسال...' : telegramSent ? 'تم الإرسال لتليجرام! ✓' : 'تليجرام: متصل ✈️'}</span>
            </button>

            {/* 24/7 Autonomous Background Scanner Daemon Status Badge */}
            {daemonStatus && (
              <span
                className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all border ${
                  daemonStatus.active
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
                title={
                  daemonStatus.active
                    ? `فاحص السيرفر الدائم (24/7 Daemon): يعمل في الخلفية مستقلاً عن المتصفح، أجرى ${daemonStatus.scans} فحص لـ 20 عملة ويرسل الصفقات إلى تليجرام وقاعدة بيانات Turso السحابية.`
                    : 'محرك الفحص الخلفي متوقف مؤقتاً'
                }
              >
                <Server className={`w-3 h-3 ${daemonStatus.active ? (daemonStatus.scanning ? 'text-amber-400 animate-pulse' : 'text-emerald-400') : 'text-slate-500'}`} />
                <span>
                  {daemonStatus.active
                    ? daemonStatus.scanning
                      ? 'سيرفر 24/7: يفحص الآن ⚡'
                      : `سيرفر 24/7: نشط 🤖 (${daemonStatus.scans})`
                    : 'سيرفر 24/7: متوقف'}
                </span>
              </span>
            )}

            {(() => {
              const tg = checkTradingTimeGuard();
              return (
                <span
                  className={`inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold border transition-all ${
                    tg.isSafe
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                      : 'bg-amber-950/90 text-amber-300 border-amber-500/80 animate-pulse'
                  }`}
                  title={tg.isSafe ? 'مُصفي الوقت الآمن: التداول آمن الآن' : tg.reason}
                >
                  <ShieldCheck className={`w-3 h-3 ${tg.isSafe ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span>{tg.isSafe ? `وقت آمن (${tg.utcTime})` : `تحذير (${tg.utcTime})`}</span>
                </span>
              );
            })()}
          </div>

          {/* Main Logo & Title */}
          <div className="flex items-center gap-2 sm:gap-3 pt-0.5 min-w-0">
            <img 
              src="/logo.svg" 
              alt="Crypto Trade Analyzer Logo" 
              className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-xl border border-emerald-500/40 p-1 bg-slate-950 shadow-lg shadow-emerald-500/10 shrink-0 object-contain" 
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-xs sm:text-base md:text-lg font-extrabold bg-gradient-to-l from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent tracking-tight truncate">
                Crypto Trade Analyzer
              </h1>
              <p className="text-[9px] sm:text-xs text-slate-400 font-medium truncate">
                تحليل متزامن للأطر الزمنية ومصفوفة التوافق المؤسسي
              </p>
            </div>
          </div>

          {/* Dedicated Intraday Strategy Badge (Pure Intraday Engine) */}
          <div className="pt-0.5 sm:pt-1 flex flex-row items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2.5 bg-gradient-to-r from-emerald-500/15 via-teal-500/20 to-cyan-500/15 border border-emerald-500/50 px-3 py-1.5 rounded-xl shadow-lg shadow-emerald-950/40">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex flex-col text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-emerald-300 tracking-tight">
                    استراتيجية التداول اليومي فقط (Intraday Only 📊)
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-bold">
                    V42.0
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  1D Bias &bull; 4H Trend &bull; 1H Direction &bull; 15M Matrix &bull; 5M Trigger
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Bar Controls */}
        <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-slate-800/80 pt-2 md:pt-0">
          <div className="text-right bg-slate-950/90 px-2.5 py-1 sm:py-2 rounded-xl border border-slate-800 text-[10px] sm:text-xs text-slate-400 space-y-0.5">
            <div className="flex items-center gap-1 text-slate-300 font-semibold">
              <Clock className="w-3 h-3 text-emerald-400" />
              <span>{currentTime || '--:--:--'}</span>
            </div>
            {lastUpdated && (
              <div className="text-[9px] sm:text-[11px]">
                فحص: <span className="text-emerald-400 font-mono font-bold">{lastUpdated}</span>
              </div>
            )}
          </div>

          {/* Action Toggles: Sound & Browser Notifications */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Sound alert toggle button */}
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'إيقاف التنبيهات الصوتية' : 'تفعيل التنبيهات الصوتية'}
              className={`p-2 sm:p-3 rounded-xl border transition-all flex items-center gap-1 text-xs font-bold cursor-pointer min-h-[40px] ${
                soundEnabled
                  ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-300 hover:bg-emerald-900/80'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {soundEnabled ? <Bell className="w-4 h-4 text-emerald-400" /> : <BellOff className="w-4 h-4 text-slate-500" />}
              <span className="hidden sm:inline">{soundEnabled ? 'الصوت مفعل' : 'مكتوم'}</span>
            </button>

            {/* Browser notification toggle button */}
            {onToggleNotifications && (
              <button
                type="button"
                onClick={onToggleNotifications}
                title={notificationsEnabled ? 'إيقاف إشعارات المتصفح' : 'تفعيل إشعارات المتصفح المنبثقة'}
                className={`p-2 sm:p-3 rounded-xl border transition-all flex items-center gap-1 text-xs font-bold cursor-pointer min-h-[40px] ${
                  notificationsEnabled
                    ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300 hover:bg-cyan-900/80 shadow-lg shadow-cyan-950/50'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Zap className={`w-4 h-4 ${notificationsEnabled ? 'text-cyan-400 fill-cyan-400 animate-pulse' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">
                  {notificationsEnabled ? 'الإشعارات 🔔' : 'إشعارات'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

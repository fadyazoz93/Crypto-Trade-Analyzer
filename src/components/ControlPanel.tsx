import React, { useState } from 'react';
import { Search, RefreshCw, Plus, Check, Play, Pause, Layers, SlidersHorizontal, Briefcase, RotateCcw, LayoutGrid, Settings } from 'lucide-react';
import { SymbolInfo } from '../types';

export type ActiveTab = 'scanner' | 'single' | 'heatmap' | 'paper' | 'backtest' | 'calculator' | 'history';

interface ControlPanelProps {
  symbols: SymbolInfo[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onAddCustomSymbol: (symbol: string) => void;
  loading: boolean;
  onFetchAnalysis: () => void;
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  wsStatus?: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  onRefreshSymbols?: () => void;
  symbolsUpdating?: boolean;
  symbolsLastUpdated?: string | null;
  onOpenSettings: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  symbols,
  selectedSymbol,
  onSelectSymbol,
  onAddCustomSymbol,
  loading,
  onFetchAnalysis,
  activeTab,
  onChangeTab,
  wsStatus = 'CONNECTED',
  onRefreshSymbols,
  symbolsUpdating = false,
  symbolsLastUpdated,
  onOpenSettings,
}) => {
  const [customInput, setCustomInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [customError, setCustomError] = useState('');

  const isWsLive = wsStatus === 'CONNECTED';

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let clean = customInput.trim().toUpperCase();
    if (!clean) return;
    if (!clean.endsWith('USDT')) {
      clean += 'USDT';
    }
    if (symbols.some((s) => s.symbol === clean)) {
      setCustomError('الرمز موجود بالفعل في القائمة');
      return;
    }
    onAddCustomSymbol(clean);
    onSelectSymbol(clean);
    setCustomInput('');
    setShowAddModal(false);
    setCustomError('');
  };

  return (
    <div className="bg-slate-900 p-3.5 sm:p-5 md:p-6 rounded-2xl border border-slate-800 space-y-4 sm:space-y-5 shadow-xl">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 bg-slate-950 rounded-xl border border-slate-800/80 overflow-x-auto scrollbar-none snap-x touch-pan-x">
        <button
          onClick={() => onChangeTab('scanner')}
          className={`py-2 px-2.5 sm:px-3 rounded-lg text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap min-h-[40px] snap-start ${
            activeTab === 'scanner'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>ماسح السوق 🚀</span>
        </button>

        <button
          onClick={() => onChangeTab('heatmap')}
          className={`py-2 px-2.5 sm:px-3 rounded-lg text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap min-h-[40px] snap-start ${
            activeTab === 'heatmap'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>الخريطة الحرارية 📊</span>
        </button>

        <button
          onClick={() => onChangeTab('paper')}
          className={`py-2 px-2.5 sm:px-3 rounded-lg text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap min-h-[40px] snap-start ${
            activeTab === 'paper'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>المحفظة الافتراضية 💼</span>
        </button>

        <button
          onClick={() => onChangeTab('backtest')}
          className={`py-2 px-2.5 sm:px-3 rounded-lg text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap min-h-[40px] snap-start ${
            activeTab === 'backtest'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>الاختبار الرجعي 🔄</span>
        </button>

        <button
          onClick={() => onChangeTab('single')}
          className={`py-2 px-2.5 sm:px-3 rounded-lg text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap min-h-[40px] snap-start ${
            activeTab === 'single'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>تحليل عملة 🔍</span>
        </button>

        <button
          onClick={() => onChangeTab('calculator')}
          className={`py-2 px-2.5 sm:px-3 rounded-lg text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap min-h-[40px] snap-start ${
            activeTab === 'calculator'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>الحاسبة 🧮</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="py-2 px-2.5 sm:px-3 rounded-lg text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap bg-slate-900 text-slate-300 hover:text-white border border-slate-700/80 mr-auto min-h-[40px] snap-start"
          title="تخصيص الإعدادات والتنقل"
        >
          <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
          <span>الإعدادات ⚙️</span>
        </button>
      </div>

      {activeTab === 'single' && (
        <div className="space-y-3.5 pt-1">
          {/* Quick Symbol Chips Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>الوصول السريع للعملات الأكثر نشاطاً:</span>
              </span>
              <div className="flex items-center gap-2">
                {onRefreshSymbols && (
                  <button
                    type="button"
                    onClick={onRefreshSymbols}
                    disabled={symbolsUpdating}
                    title="تحديث قائمة الأكثر تداولاً تلقائياً من منصة OKX"
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer bg-slate-950 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-800 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${symbolsUpdating ? 'animate-spin text-cyan-400' : ''}`} />
                    <span className="hidden sm:inline">{symbolsUpdating ? 'جاري التحديث...' : 'تحديث القائمة'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowAddModal(!showAddModal)}
                  className="text-emerald-400 hover:text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer bg-slate-950 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-800 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة رمز</span>
                </button>
              </div>
            </div>

            {/* Quick Horizontal Scroll Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none snap-x touch-pan-x">
              {symbols.slice(0, 10).map((sym) => {
                const isSelected = sym.symbol === selectedSymbol;
                return (
                  <button
                    key={sym.symbol}
                    type="button"
                    onClick={() => onSelectSymbol(sym.symbol)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer snap-start min-h-[36px] ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 scale-[1.02] border border-emerald-400'
                        : 'bg-slate-950 hover:bg-slate-800/80 text-slate-300 border border-slate-800/90'
                    }`}
                  >
                    <span>{sym.icon}</span>
                    <span>{sym.symbol.replace('USDT', '')}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Symbol Selector Dropdown for Full List */}
          <div className="space-y-1.5">
            <select
              value={selectedSymbol}
              onChange={(e) => onSelectSymbol(e.target.value)}
              disabled={loading}
              className="w-full bg-slate-950 border border-slate-800 text-white p-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition cursor-pointer font-bold disabled:opacity-50 hover:border-slate-700 text-xs sm:text-sm"
            >
              {symbols.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.icon} {item.name} ({item.symbol})
                </option>
              ))}
            </select>
          </div>

          {/* Modal to add custom symbol */}
          {showAddModal && (
            <form onSubmit={handleAddSubmit} className="bg-slate-950 p-4 rounded-xl border border-emerald-800/60 space-y-3 animate-fade-in">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-400">أدخل رمز زوج العملة (مثال: NEARUSDT أو SOL):</span>
                <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-xs font-bold">
                  إلغاء ✕
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="مثال: SOLUSDT"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono uppercase"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>إضافة</span>
                </button>
              </div>
              {customError && <p className="text-rose-400 text-xs font-semibold">{customError}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
};

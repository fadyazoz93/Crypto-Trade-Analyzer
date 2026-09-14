import React, { useState } from 'react';
import { SignalHistoryItem } from '../types';
import { 
  History, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus, 
  ExternalLink, 
  Gauge, 
  Copy, 
  Check, 
  Bot, 
  Send, 
  Cloud, 
  RefreshCw,
  Target,
  ShieldAlert
} from 'lucide-react';

interface SignalHistoryProps {
  history: SignalHistoryItem[];
  onClearHistory: () => void;
  onSelectSymbol: (symbol: string) => void;
  onRefresh?: () => void;
}

export const SignalHistory: React.FC<SignalHistoryProps> = ({ 
  history, 
  onClearHistory, 
  onSelectSymbol,
  onRefresh 
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'DAEMON' | 'BUY' | 'SELL'>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh) {
      setRefreshing(true);
      await onRefresh();
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  const handleCopyHistoryItem = (e: React.MouseEvent, item: SignalHistoryItem) => {
    e.stopPropagation();
    const tradeSetup = item.trade_setup;
    const actionText = item.decision === 'BUY' ? '🟢 شراء (BUY LONG)' : '🔴 بيع (SELL SHORT)';
    const matrix = item.confluenceMatrix;
    const price = item.indicators?.price ?? (item as any).price ?? tradeSetup?.entry_price ?? 0;

    let text = `⚡ **توصية تداول - سجل الإشارات** ⚡
الزوج: #${item.symbol}
القرار: ${actionText}
سعر التنفيذ: $${price}`;

    if (tradeSetup) {
      text += `\nسعر الدخول: $${tradeSetup.entry_price}
وقف الخسارة: $${tradeSetup.stop_loss}
الهدف الأول (TP1 - 0.5R): $${tradeSetup.take_profit_1 || tradeSetup.take_profit}
${tradeSetup.take_profit_2 ? `الهدف الثاني (TP2 - 1.0R): $${tradeSetup.take_profit_2}\n` : ''}${tradeSetup.take_profit_3 ? `الهدف الثالث (TP3 - 1.5R): $${tradeSetup.take_profit_3}\n` : ''}${tradeSetup.take_profit_4 ? `الهدف الرابع (TP4 - 2.0R): $${tradeSetup.take_profit_4}\n` : ''}العائد: ${tradeSetup.risk_reward_ratio || '1:2 (Quad Exit Scale-Out)'}`;
    }

    if (matrix) {
      text += `\nدرجة التوافق: ${matrix.totalScore}/100 (${matrix.grade})`;
    } else if (item.sopScore) {
      text += `\nبوابات SOP: ${item.sopScore}/5`;
    }

    text += `\nالتوقيت: ${new Date(item.timestamp).toLocaleTimeString('ar-EG')}`;

    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredHistory = history.filter((item) => {
    if (filter === 'ALL') return true;
    if (filter === 'DAEMON') return item.source === 'DAEMON' || item.source === 'TURSO' || item.telegramSent;
    return item.decision === filter;
  });

  if (history.length === 0) {
    return (
      <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center space-y-4 shadow-xl">
        <div className="w-14 h-14 bg-slate-800/80 rounded-2xl flex items-center justify-center mx-auto text-emerald-400 border border-slate-700">
          <History className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-200">سجل إشارات التداول والماسح الذكي</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            يتم تخزين جميع الإشارات الصادرة من فاحص السيرفر (24/7 Daemon) وتليجرام وقاعدة بيانات Turso هنا تلقائياً.
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl inline-flex items-center gap-2 cursor-pointer transition"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>تحديث السجل من السيرفر</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 p-4 sm:p-5 md:p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3.5">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-white">سجل إشارات التداول والسيرفر ({history.length})</h2>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
              <span>مزامنة فورية</span>
            </button>
          )}

          <button
            onClick={onClearHistory}
            className="text-slate-400 hover:text-rose-400 text-xs font-bold flex items-center gap-1 transition cursor-pointer px-2 py-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>مسح السجل</span>
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            filter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          الكل ({history.length})
        </button>
        <button
          onClick={() => setFilter('DAEMON')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
            filter === 'DAEMON' ? 'bg-indigo-600 text-white' : 'text-indigo-300 hover:bg-indigo-950/50'
          }`}
        >
          <Bot className="w-3 h-3" />
          <span>إشارات السيرفر وتليجرام</span>
        </button>
        <button
          onClick={() => setFilter('BUY')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            filter === 'BUY' ? 'bg-emerald-500 text-slate-950' : 'text-emerald-400 hover:bg-emerald-950/40'
          }`}
        >
          شراء ({history.filter((h) => h.decision === 'BUY').length})
        </button>
        <button
          onClick={() => setFilter('SELL')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            filter === 'SELL' ? 'bg-rose-500 text-white' : 'text-rose-400 hover:bg-rose-950/40'
          }`}
        >
          بيع ({history.filter((h) => h.decision === 'SELL').length})
        </button>
      </div>

      <div className="space-y-3">
        {filteredHistory.map((item) => {
          const isBuy = item.decision === 'BUY';
          const isSell = item.decision === 'SELL';
          const matrix = item.confluenceMatrix;
          const tradeSetup = item.trade_setup;
          const price = item.indicators?.price ?? (item as any).price ?? tradeSetup?.entry_price ?? 0;
          const sop = item.sopScore ?? matrix?.sopScore ?? item.indicators?.sopScore;
          const isDaemon = item.source === 'DAEMON' || item.source === 'TURSO' || item.telegramSent;

          return (
            <div
              key={item.id}
              onClick={() => onSelectSymbol(item.symbol)}
              className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700 transition cursor-pointer space-y-3"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1 ${
                      isBuy
                        ? 'bg-emerald-500 text-slate-950'
                        : isSell
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {isBuy ? <ArrowUpRight className="w-3.5 h-3.5" /> : isSell ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    {isBuy ? 'BUY' : isSell ? 'SELL' : 'NO_TRADE'}
                  </span>

                  <span className="font-extrabold text-white text-base">#{item.symbol}</span>
                  <span className="text-xs text-slate-300 font-mono font-bold">
                    ${price < 1 ? price.toFixed(6) : price.toFixed(2)}
                  </span>

                  {isDaemon && (
                    <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                      <Bot className="w-3 h-3" />
                      <span>فاحص السيرفر 24/7</span>
                      {item.telegramSent && <Send className="w-2.5 h-2.5 text-cyan-400" />}
                    </span>
                  )}

                  {sop !== undefined && sop > 0 && (
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono font-bold">
                      SOP: {sop}/5
                    </span>
                  )}

                  {matrix && (
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${
                      matrix.passed
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        : 'bg-slate-900 text-cyan-300 border-cyan-800'
                    }`}>
                      <Gauge className="w-2.5 h-2.5" />
                      <span>{matrix.totalScore}/100 ({matrix.grade})</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                  <span>{new Date(item.timestamp).toLocaleTimeString('ar-EG')}</span>
                </div>
              </div>

              {/* Trade Targets Grid */}
              {tradeSetup && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block">سعر الدخول</span>
                    <span className="text-white font-bold">${tradeSetup.entry_price}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-400 block">وقف الخسارة (SL)</span>
                    <span className="text-rose-300 font-bold">${tradeSetup.stop_loss}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-400 block">الهدف الموحد (TP)</span>
                    <span className="text-emerald-300 font-bold">${tradeSetup.take_profit_1 || tradeSetup.take_profit}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-cyan-400 block">نسبة المخاطرة</span>
                    <span className="text-cyan-300 font-bold">{tradeSetup.risk_reward_ratio || '1:2'}</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 line-clamp-2">{item.reason}</p>

              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                {item.decision !== 'NO_TRADE' ? (
                  <button
                    onClick={(e) => handleCopyHistoryItem(e, item)}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                    <span>{copiedId === item.id ? 'تم النسخ!' : 'نسخ التوصية'}</span>
                  </button>
                ) : <div />}

                <span className="text-emerald-400 font-bold text-xs flex items-center gap-0.5">
                  عرض التحليل والشارت <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

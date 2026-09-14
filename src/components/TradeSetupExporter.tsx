import React, { useState } from 'react';
import { AnalysisResult } from '../types';
import { Copy, Check, Share2, Briefcase, Zap, Target, ShieldAlert, TrendingUp } from 'lucide-react';
import { QuickTradeExecutionModal } from './QuickTradeExecutionModal';

interface TradeSetupExporterProps {
  result: AnalysisResult;
  onNavigateToPortfolio?: () => void;
}

export const TradeSetupExporter: React.FC<TradeSetupExporterProps> = ({ result, onNavigateToPortfolio }) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState<boolean>(false);

  const { symbol, decision, trade_setup, indicators, timestamp, confluenceMatrix, gannData } = result;

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  if (!trade_setup || decision === 'NO_TRADE') return null;

  const actionText = decision === 'BUY' ? '🟢 إشارة شراء (BUY LONG)' : '🔴 إشارة بيع (SELL SHORT)';
  
  const singleTp = trade_setup.take_profit || trade_setup.take_profit_1;
  const tpPercent = trade_setup.tpPercent || trade_setup.tp1Percent;

  const fullText = `⚡ **توصية تداول من محلل الصفقات ومصفوفة التوافق** ⚡
الزوج: #${symbol}
القرار: ${actionText}
سعر التنفيذ المباشر: $${indicators.price}
درجة التوافق المؤسسي: ${confluenceMatrix ? `${confluenceMatrix.totalScore}/100 (${confluenceMatrix.grade})` : 'مؤكدة'}
${gannData?.nearestGannSupport ? `زاوية مربع التسعة لجان: ${gannData.nearestGannSupport.angleName} ($${gannData.nearestGannSupport.price.toFixed(indicators.price < 1 ? 6 : 2)})` : ''}

🎯 **هدف الصفقة الموحد وإدارة المخاطر:**
• سعر الدخول (Entry): $${trade_setup.entry_price}
• وقف الخسارة (SL): $${trade_setup.stop_loss} (${trade_setup.stopLossPercent}%)
• هدف جان ووايكوف الموحد (TP): $${singleTp} (+${tpPercent}%)
• نسبة العائد مقابل المخاطرة (R:R): ${trade_setup.risk_reward_ratio}

📊 **مؤشرات الفحص:**
• 200 EMA (4H): $${indicators.ema200_4h.toFixed(2)}
• RSI (5M): ${indicators.rsi_5m.toFixed(1)}
• تأمين الدخول (Break-Even): عند 1:1 R:R

🕒 التوقيت: ${new Date(timestamp).toLocaleTimeString('ar-EG')}`;

  const botText = `${decision === 'BUY' ? 'BUY' : 'SELL'} ${symbol} Entry: ${trade_setup.entry_price} SL: ${trade_setup.stop_loss} TP: ${singleTp}`;

  return (
    <>
      <div className="bg-slate-950 p-4 rounded-xl border border-emerald-800/60 flex flex-col gap-3">
        {/* Header & Quick Action Buttons */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
            <Share2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>خيارات نسخ ودخول صفقة {symbol}:</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            {/* Quick 1-Click Value Copy Pills */}
            <button
              onClick={() => handleCopy(String(trade_setup.entry_price), 'entry')}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
              title="نسخ سعر الدخول فقط"
            >
              {copiedType === 'entry' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>دخول: ${trade_setup.entry_price}</span>
            </button>

            <button
              onClick={() => handleCopy(String(trade_setup.stop_loss), 'sl')}
              className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
              title="نسخ وقف الخسارة فقط"
            >
              {copiedType === 'sl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>SL: ${trade_setup.stop_loss}</span>
            </button>

            <button
              onClick={() => handleCopy(String(singleTp), 'tp')}
              className="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
              title="نسخ الهدف الموحد فقط"
            >
              {copiedType === 'tp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>TP: ${singleTp}</span>
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-800/80">
          <button
            onClick={() => handleCopy(fullText, 'full')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {copiedType === 'full' ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">تم نسخ التوصية الكاملة! ✅</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-emerald-400" />
                <span>نسخ التوصية بالكامل 📋</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleCopy(botText, 'bot')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-800/60 font-mono font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {copiedType === 'bot' ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">تم نسخ صيغة البوت! ✅</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-cyan-400" />
                <span>صيغة البوت والمنصات 🤖</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsExecutionModalOpen(true)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-lg text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
          >
            <Briefcase className="w-4 h-4" />
            <span>تخصيص ودخول الصفقة 🚀</span>
          </button>
        </div>
      </div>

      {/* Execution Modal */}
      <QuickTradeExecutionModal
        isOpen={isExecutionModalOpen}
        onClose={() => setIsExecutionModalOpen(false)}
        result={result}
        onNavigateToPortfolio={onNavigateToPortfolio}
      />
    </>
  );
};


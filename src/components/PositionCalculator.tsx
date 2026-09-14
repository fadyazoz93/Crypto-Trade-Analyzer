import React, { useState } from 'react';
import { Calculator, DollarSign, Percent, ShieldAlert, Award, ArrowUpRight, ShieldCheck, Zap, Info } from 'lucide-react';
import { TradeSetup } from '../types';
import { calculateInstitutionalRiskSizing, getContractSpec, CONTRACT_SPECS } from '../utils/institutionalRiskEngine';
import { getStrategySettings } from '../utils/settingsStore';

interface PositionCalculatorProps {
  tradeSetup?: TradeSetup;
  price: number;
  symbol?: string;
}

export const PositionCalculator: React.FC<PositionCalculatorProps> = ({ tradeSetup, price, symbol = 'BTCUSDT' }) => {
  const settings = getStrategySettings();
  const [selectedSym, setSelectedSym] = useState<string>(symbol);
  const [accountBalance, setAccountBalance] = useState<number>(settings.defaultAccountBalance || 10000);
  const [riskPercent, setRiskPercent] = useState<number>(settings.riskPerTradePercent || 1.0);
  const [hardCap, setHardCap] = useState<number>(settings.hardRiskCapUsdt || 1000);
  const [leverage, setLeverage] = useState<number>(settings.accountLeverage || 10);
  const [tradeDirection, setTradeDirection] = useState<'BUY' | 'SELL'>('BUY');

  const entry = tradeSetup?.entry_price || price || 65000;
  const sl = tradeSetup?.stop_loss || (tradeDirection === 'BUY' ? entry * 0.985 : entry * 1.015);
  const tp1 = tradeSetup?.take_profit_1 || (tradeDirection === 'BUY' ? entry * 1.015 : entry * 0.985);
  const tp2 = tradeSetup?.take_profit_2 || (tradeDirection === 'BUY' ? entry * 1.035 : entry * 0.965);

  const sizing = calculateInstitutionalRiskSizing(
    selectedSym,
    tradeDirection,
    entry,
    sl,
    tp1,
    tp2,
    accountBalance,
    riskPercent,
    hardCap,
    leverage
  );

  return (
    <div className="bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-800 space-y-6 shadow-xl text-right">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-500/80 flex items-center justify-center text-emerald-400 font-bold">
            V9
          </div>
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              حاسبة إدارة المخاطر المؤسسية وحجم العقد (Institutional Risk Sizing)
            </h2>
            <span className="text-xs text-slate-400">
              محاكاة دقيقة 100% عبر OrderCalcProfit لكافة الأصول والمعادن مع سقف الخسارة الأقصى (Hard Cap)
            </span>
          </div>
        </div>

        {sizing.isHardCapApplied && (
          <div className="bg-rose-950/80 text-rose-300 border border-rose-600/80 px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>تم تطبيق سقف الخسارة الأقصى (Hard Cap: ${hardCap})</span>
          </div>
        )}
      </div>

      {/* Asset Selection & Contract Type */}
      <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 space-y-3">
        <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>اختيار الأصل ومواصفات العقد (Contract Specs):</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { key: 'BTCUSDT', label: 'BTCUSDT', desc: '1 BTC / لوت' },
            { key: 'ETHUSDT', label: 'ETHUSDT', desc: '1 ETH / لوت' },
            { key: 'XAUUSDT', label: 'الذهب (XAU)', desc: '100 أونصة / لوت' },
            { key: 'XAGUSDT', label: 'الفضة (XAG)', desc: '5,000 أونصة / لوت' },
            { key: 'EURUSD', label: 'EUR/USD', desc: '100,000 وحدة' },
            { key: 'USOIL', label: 'النفط (WTI)', desc: '1,000 برميل' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedSym(item.key)}
              className={`p-2.5 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                selectedSym === item.key
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500 shadow-md'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850'
              }`}
            >
              <div className="text-white font-mono">{item.label}</div>
              <div className="text-[10px] text-slate-400 font-normal">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Input Parameters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Account Balance */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-300">رأس المال الكلي ($ Balance):</label>
          <div className="relative">
            <DollarSign className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
            <input
              type="number"
              value={accountBalance}
              onChange={(e) => setAccountBalance(Math.max(1, Number(e.target.value)))}
              className="w-full bg-slate-950 border border-slate-700 text-white pr-9 pl-3 py-2.5 rounded-xl font-bold font-mono focus:border-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Risk Percentage */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-300">نسبة المخاطرة (% Risk):</label>
          <div className="relative">
            <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
            <input
              type="number"
              step="0.25"
              min="0.1"
              max="10"
              value={riskPercent}
              onChange={(e) => setRiskPercent(Math.max(0.1, Number(e.target.value)))}
              className="w-full bg-slate-950 border border-slate-700 text-white pr-9 pl-3 py-2.5 rounded-xl font-bold font-mono focus:border-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Hard Risk Cap */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-rose-300 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>سقف الخسارة الأقصى (Hard Cap $):</span>
          </label>
          <div className="relative">
            <DollarSign className="w-4 h-4 text-rose-400 absolute right-3 top-3.5" />
            <input
              type="number"
              step="100"
              min="50"
              value={hardCap}
              onChange={(e) => setHardCap(Math.max(10, Number(e.target.value)))}
              className="w-full bg-slate-950 border border-rose-800/80 text-rose-300 pr-9 pl-3 py-2.5 rounded-xl font-bold font-mono focus:border-rose-500 outline-none"
            />
          </div>
        </div>

        {/* Leverage Selection */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-300">الرافعة المالية (Leverage):</label>
          <select
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 text-white px-3 py-2.5 rounded-xl font-bold font-mono focus:border-emerald-500 outline-none cursor-pointer"
          >
            <option value={1}>1x (Spot / بدون رافعة)</option>
            <option value={2}>2x</option>
            <option value={5}>5x (مستحسن)</option>
            <option value={10}>10x (قياسي)</option>
            <option value={20}>20x</option>
            <option value={50}>50x (مخاطرة عالية)</option>
          </select>
        </div>
      </div>

      {/* Calculated Institutional Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Exact Lot Size */}
        <div className="bg-slate-950 p-4 rounded-xl border border-emerald-800/60 text-center space-y-1">
          <div className="text-xs text-emerald-400 flex items-center justify-center gap-1 font-bold">
            <Award className="w-4 h-4" />
            <span>حجم العقد المقترح (Lot Size)</span>
          </div>
          <div className="font-mono text-xl font-black text-white">
            {sizing.roundedLots} <span className="text-xs text-emerald-400 font-sans">لوت / عقد</span>
          </div>
          <div className="text-[10px] text-slate-400">
            خطوة التقريب: {sizing.spec.volumeStep} | العقد: {sizing.spec.contractSize} وحدة
          </div>
        </div>

        {/* 2. Maximum Dollar Loss */}
        <div className="bg-slate-950 p-4 rounded-xl border border-rose-900/60 text-center space-y-1">
          <div className="text-xs text-rose-400 flex items-center justify-center gap-1 font-bold">
            <ShieldAlert className="w-4 h-4" />
            <span>الخسارة الفعلية عند الستوب</span>
          </div>
          <div className="font-mono text-xl font-black text-rose-400">
            -${sizing.maxDollarLoss.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400">
            {sizing.isHardCapApplied ? `مقيد بالسقف ($${hardCap})` : `(${riskPercent}% من الرصيد)`}
          </div>
        </div>

        {/* 3. Margin Required */}
        <div className="bg-slate-950 p-4 rounded-xl border border-cyan-900/60 text-center space-y-1">
          <div className="text-xs text-cyan-400 flex items-center justify-center gap-1 font-bold">
            <ArrowUpRight className="w-4 h-4" />
            <span>الهامش المطلوب (Margin)</span>
          </div>
          <div className="font-mono text-xl font-black text-cyan-300">
            ${sizing.marginRequiredUsd.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400">
            القيمة الإجمالية: ${sizing.positionNotionalUsd.toFixed(2)}
          </div>
        </div>

        {/* 4. TP1 Profit (50% Scale-out ready) */}
        <div className="bg-slate-950 p-4 rounded-xl border border-teal-900/60 text-center space-y-1">
          <div className="text-xs text-teal-400 flex items-center justify-center gap-1 font-bold">
            <Award className="w-4 h-4" />
            <span>الربح عند TP1 (نسبة {sizing.riskRewardRatio})</span>
          </div>
          <div className="font-mono text-xl font-black text-teal-300">
            +${sizing.tp1DollarProfit.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400">
            (إغلاق 50% بقيمة +${(sizing.tp1DollarProfit * 0.5).toFixed(2)} وحجز الستوب)
          </div>
        </div>
      </div>

      {/* Silver / Commodity Safety Notice */}
      <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <span className="font-bold text-white block">
            معيار SOP Pro V9.00 لمنع أخطاء عقود الفضة والسلع:
          </span>
          <span>
            يتم احتساب قيمة النقطة وسعر العقد بدقة 100% (مثال: لوت الفضة XAG = 5,000 أونصة مقابل 100 أونصة للذهب)، مما يضمن عدم تضخيم العقود أو تعريض الحساب لنداء الهامش، مع تطبيق سقف الخسارة الصارم ${hardCap} تلقائياً.
          </span>
        </div>
      </div>
    </div>
  );
};

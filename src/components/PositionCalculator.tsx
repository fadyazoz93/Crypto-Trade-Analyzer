import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calculator, 
  DollarSign, 
  Percent, 
  ShieldAlert, 
  Award, 
  ArrowUpRight, 
  ShieldCheck, 
  Zap, 
  Info, 
  Gem, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  Check, 
  RefreshCw, 
  Copy, 
  Layers, 
  Target 
} from 'lucide-react';
import { TradeSetup, SymbolInfo } from '../types';
import { calculateInstitutionalRiskSizing, getContractSpec } from '../utils/institutionalRiskEngine';
import { getStrategySettings } from '../utils/settingsStore';
import { fetchOkxTicker, fetchOkxTopVolumeTickers } from '../utils/okxApi';

// قائمة العملات الماسية الـ 8 المعتمدة حصراً (The 8 Diamond Tier Coins)
export const DIAMOND_TIER_COINS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', icon: '₿', category: 'Major', defaultPrice: 83500, decimals: 2 },
  { symbol: 'ETHUSDT', name: 'Ethereum', icon: 'Ξ', category: 'Major', defaultPrice: 2650, decimals: 2 },
  { symbol: 'SOLUSDT', name: 'Solana', icon: '◎', category: 'Layer1', defaultPrice: 118, decimals: 2 },
  { symbol: 'BNBUSDT', name: 'BNB', icon: '🟡', category: 'Major', defaultPrice: 580, decimals: 2 },
  { symbol: 'XRPUSDT', name: 'XRP', icon: '✕', category: 'Major', defaultPrice: 0.585, decimals: 4 },
  { symbol: 'AVAXUSDT', name: 'Avalanche', icon: '🔺', category: 'Layer1', defaultPrice: 28.5, decimals: 2 },
  { symbol: 'LINKUSDT', name: 'Chainlink', icon: '🔗', category: 'DeFi', defaultPrice: 14.8, decimals: 3 },
  { symbol: 'NEARUSDT', name: 'NEAR Protocol', icon: 'Ⓝ', category: 'Layer1', defaultPrice: 4.85, decimals: 3 },
];

interface PositionCalculatorProps {
  tradeSetup?: TradeSetup;
  price: number;
  symbol?: string;
  symbols?: SymbolInfo[];
}

export const PositionCalculator: React.FC<PositionCalculatorProps> = ({ 
  tradeSetup, 
  price, 
  symbol = 'BTCUSDT'
}) => {
  const settings = getStrategySettings();

  // Mode switcher: Diamond Profit Calculator vs Diamond Institutional Risk Sizing
  const [calculatorTab, setCalculatorTab] = useState<'diamond' | 'risk'>('diamond');

  // Unified Real-Time Live Prices for the 8 Diamond Coins
  const [livePrices, setLivePrices] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    DIAMOND_TIER_COINS.forEach(c => { initial[c.symbol] = c.defaultPrice; });
    const cleanSym = symbol ? symbol.toUpperCase().replace(/[^A-Z]/g, '') : 'BTCUSDT';
    if (cleanSym && price > 0 && DIAMOND_TIER_COINS.some(c => c.symbol === cleanSym)) {
      initial[cleanSym] = price;
    }
    return initial;
  });

  const [priceChanges, setPriceChanges] = useState<Record<string, number>>({});
  const [isLoadingPrices, setIsLoadingPrices] = useState<boolean>(false);
  const [lastPriceUpdateTime, setLastPriceUpdateTime] = useState<string>('');

  // --- Real-time Price Polling Engine for the 8 Diamond Coins from OKX ---
  const refreshLivePrices = useCallback(async () => {
    setIsLoadingPrices(true);
    try {
      const updatedPrices: Record<string, number> = {};
      const updatedChanges: Record<string, number> = {};

      // 1. Fetch top volume tickers directly in a batch for efficiency
      try {
        const topTickers = await fetchOkxTopVolumeTickers(50);
        if (Array.isArray(topTickers) && topTickers.length > 0) {
          topTickers.forEach(t => {
            const sym = t.symbol.replace(/-/g, '').toUpperCase();
            if (DIAMOND_TIER_COINS.some(c => c.symbol === sym) && t.lastPrice > 0) {
              updatedPrices[sym] = t.lastPrice;
              updatedChanges[sym] = t.priceChangePercent;
            }
          });
        }
      } catch {
        // Fallback to individual calls
      }

      // 2. Fetch any missing Diamond coins individually
      await Promise.all(
        DIAMOND_TIER_COINS.map(async (coin) => {
          if (!updatedPrices[coin.symbol]) {
            try {
              const ticker = await fetchOkxTicker(coin.symbol);
              if (ticker && ticker.lastPrice > 0) {
                updatedPrices[coin.symbol] = ticker.lastPrice;
                updatedChanges[coin.symbol] = ticker.priceChangePercent;
              }
            } catch {
              // Retain
            }
          }
        })
      );

      // 3. Commit state
      setLivePrices(prev => ({ ...prev, ...updatedPrices }));
      setPriceChanges(prev => ({ ...prev, ...updatedChanges }));
      setLastPriceUpdateTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } finally {
      setIsLoadingPrices(false);
    }
  }, []);

  // Poll live prices every 4 seconds continuously
  useEffect(() => {
    refreshLivePrices();
    const interval = setInterval(() => {
      refreshLivePrices();
    }, 4000);
    return () => clearInterval(interval);
  }, [refreshLivePrices]);

  // =========================================================================
  // TAB 1: DIAMOND PROFIT CALCULATOR STATE & LOGIC
  // =========================================================================
  const [selectedDiamondSym, setSelectedDiamondSym] = useState<string>(() => {
    const cleanSym = symbol ? symbol.toUpperCase().replace(/[^A-Z]/g, '') : 'BTCUSDT';
    const exists = DIAMOND_TIER_COINS.some(c => c.symbol === cleanSym);
    return exists ? cleanSym : 'BTCUSDT';
  });

  const [copiedTarget, setCopiedTarget] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // Direction: BUY (Long) vs SELL (Short)
  const [diamondDirection, setDiamondDirection] = useState<'BUY' | 'SELL'>('BUY');

  // Calculation mode: By Target % or By Target $
  const [calcMode, setCalcMode] = useState<'BY_PERCENT' | 'BY_DOLLARS'>('BY_PERCENT');

  // Core Inputs
  const [customEntryPrice, setCustomEntryPrice] = useState<number>(() => {
    return price > 0 ? price : (DIAMOND_TIER_COINS.find(c => c.symbol === selectedDiamondSym)?.defaultPrice || 83500);
  });
  const [targetProfitPercent, setTargetProfitPercent] = useState<number>(5.0); // +5.0%
  const [desiredProfitDollars, setDesiredProfitDollars] = useState<number>(100); // $100
  const [investmentMargin, setInvestmentMargin] = useState<number>(500); // $500 margin
  const [diamondLeverage, setDiamondLeverage] = useState<number>(1); // Default: 1x Spot for maximum safety

  // Active Diamond Coin definition
  const activeDiamondCoin = useMemo(() => {
    return DIAMOND_TIER_COINS.find(c => c.symbol === selectedDiamondSym) || DIAMOND_TIER_COINS[0];
  }, [selectedDiamondSym]);

  // Current real-time price of active diamond coin
  const activeDiamondLivePrice = livePrices[selectedDiamondSym] || activeDiamondCoin.defaultPrice;

  // Sync customEntryPrice when user switches coins or resets to live price
  const handleSelectDiamondCoin = (coinSym: string) => {
    setSelectedDiamondSym(coinSym);
    const liveP = livePrices[coinSym] || DIAMOND_TIER_COINS.find(c => c.symbol === coinSym)?.defaultPrice || 100;
    setCustomEntryPrice(liveP);
  };

  const handleResetToDiamondLivePrice = () => {
    setCustomEntryPrice(activeDiamondLivePrice);
  };

  // Calculations for Active Diamond Coin
  const diamondMetrics = useMemo(() => {
    const margin = Math.max(1, investmentMargin);
    const lev = Math.max(1, diamondLeverage);
    const positionNotional = margin * lev; // Total Position Value ($)
    const entryP = Math.max(0.00000001, customEntryPrice > 0 ? customEntryPrice : activeDiamondLivePrice);

    let effectiveProfitPercent = targetProfitPercent;
    let profitAmountUsdt = 0;

    if (calcMode === 'BY_PERCENT') {
      effectiveProfitPercent = targetProfitPercent;
      // Formula: Dollar Profit = (Investment Margin * Leverage) * (Profit % / 100)
      profitAmountUsdt = positionNotional * (effectiveProfitPercent / 100);
    } else {
      // By target dollars:
      profitAmountUsdt = Math.max(0, desiredProfitDollars);
      effectiveProfitPercent = positionNotional > 0 ? (profitAmountUsdt / positionNotional) * 100 : 0;
    }

    // Return on Equity (ROE % on Margin)
    const roePercent = effectiveProfitPercent * lev;

    // Target Exit Price (Take Profit)
    let targetExitPrice = 0;
    if (diamondDirection === 'BUY') {
      targetExitPrice = entryP * (1 + effectiveProfitPercent / 100);
    } else {
      targetExitPrice = entryP * (1 - effectiveProfitPercent / 100);
    }

    // Units of crypto bought/sold
    const coinUnits = entryP > 0 ? positionNotional / entryP : 0;

    // Total account return upon target exit
    const totalReturnUsdt = margin + profitAmountUsdt;

    return {
      margin,
      leverage: lev,
      positionNotional,
      entryPrice: entryP,
      profitPercent: effectiveProfitPercent,
      profitAmountUsdt,
      roePercent,
      targetExitPrice,
      coinUnits,
      totalReturnUsdt,
      isSpot: lev === 1,
    };
  }, [
    investmentMargin,
    diamondLeverage,
    customEntryPrice,
    activeDiamondLivePrice,
    targetProfitPercent,
    desiredProfitDollars,
    calcMode,
    diamondDirection,
  ]);

  const handleCopyTargetPrice = () => {
    navigator.clipboard.writeText(diamondMetrics.targetExitPrice.toFixed(activeDiamondCoin.decimals));
    setCopiedTarget(true);
    setTimeout(() => setCopiedTarget(false), 2000);
  };

  const handleCopyFullPlan = () => {
    const text = `📊 خطة تداول الأرباح الماسية (${activeDiamondCoin.name} - ${activeDiamondCoin.symbol}):\n` +
      `• اتجاه الصفقة: ${diamondDirection === 'BUY' ? 'شراء (LONG 🟢)' : 'بيع (SHORT 🔴)'}\n` +
      `• سعر الدخول: $${diamondMetrics.entryPrice.toFixed(activeDiamondCoin.decimals)}\n` +
      `• نسبة الربح المطلوبة: +${diamondMetrics.profitPercent.toFixed(2)}%\n` +
      `• سعر الهدف (TP): $${diamondMetrics.targetExitPrice.toFixed(activeDiamondCoin.decimals)}\n` +
      `• رأس المال / الهامش: $${diamondMetrics.margin.toFixed(2)} USDT\n` +
      `• الرافعة المالية: ${diamondMetrics.leverage}x (${diamondMetrics.isSpot ? 'تداول فوري Spot' : 'عقود آجلة Futures'})\n` +
      `• صافي مبلغ الربح: +$${diamondMetrics.profitAmountUsdt.toFixed(2)} USDT\n` +
      `• إجمالي المبلغ عند الخروج: $${diamondMetrics.totalReturnUsdt.toFixed(2)} USDT\n` +
      `• كمية العملة: ${diamondMetrics.coinUnits.toFixed(diamondMetrics.coinUnits < 1 ? 4 : 2)} ${activeDiamondCoin.symbol.replace('USDT', '')}`;
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  // =========================================================================
  // TAB 2: DIAMOND INSTITUTIONAL RISK SIZING & POSITION SIZING (Exclusively Diamond Tier)
  // =========================================================================
  const [selectedRiskSym, setSelectedRiskSym] = useState<string>(() => {
    const clean = symbol ? symbol.toUpperCase().replace(/[^A-Z]/g, '') : 'BTCUSDT';
    return DIAMOND_TIER_COINS.some(c => c.symbol === clean) ? clean : 'BTCUSDT';
  });

  const [riskDirection, setRiskDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [accountBalance, setAccountBalance] = useState<number>(settings.defaultAccountBalance || 10000);
  const [riskPercent, setRiskPercent] = useState<number>(settings.riskPerTradePercent || 1.0);
  const [hardCap, setHardCap] = useState<number>(settings.hardRiskCapUsdt || 1000);
  const [riskLeverage, setRiskLeverage] = useState<number>(settings.accountLeverage || 10);

  // Active Diamond Coin in Risk Tab
  const activeRiskCoin = useMemo(() => {
    return DIAMOND_TIER_COINS.find(c => c.symbol === selectedRiskSym) || DIAMOND_TIER_COINS[0];
  }, [selectedRiskSym]);

  const activeRiskLivePrice = livePrices[selectedRiskSym] || activeRiskCoin.defaultPrice;

  // Custom risk entry, SL and TP prices
  const [riskEntryPrice, setRiskEntryPrice] = useState<number>(() => {
    return price > 0 && DIAMOND_TIER_COINS.some(c => c.symbol === symbol) ? price : activeRiskLivePrice;
  });

  const [riskStopLoss, setRiskStopLoss] = useState<number>(() => {
    const base = price > 0 && DIAMOND_TIER_COINS.some(c => c.symbol === symbol) ? price : activeRiskLivePrice;
    return Number((base * 0.985).toFixed(getContractSpec(selectedRiskSym, base).digits));
  });

  const [riskTakeProfit1, setRiskTakeProfit1] = useState<number>(() => {
    const base = price > 0 && DIAMOND_TIER_COINS.some(c => c.symbol === symbol) ? price : activeRiskLivePrice;
    return Number((base * 1.015).toFixed(getContractSpec(selectedRiskSym, base).digits));
  });

  const [riskTakeProfit2, setRiskTakeProfit2] = useState<number>(() => {
    const base = price > 0 && DIAMOND_TIER_COINS.some(c => c.symbol === symbol) ? price : activeRiskLivePrice;
    return Number((base * 1.035).toFixed(getContractSpec(selectedRiskSym, base).digits));
  });

  // When selected Diamond coin changes in Risk Tab, sync with its REAL-TIME price
  const handleSelectRiskSymbol = (sym: string) => {
    const cleanSym = sym.toUpperCase();
    setSelectedRiskSym(cleanSym);
    const liveP = livePrices[cleanSym] || DIAMOND_TIER_COINS.find(c => c.symbol === cleanSym)?.defaultPrice || 100;
    const spec = getContractSpec(cleanSym, liveP);
    setRiskEntryPrice(liveP);

    if (riskDirection === 'BUY') {
      setRiskStopLoss(Number((liveP * 0.985).toFixed(spec.digits)));
      setRiskTakeProfit1(Number((liveP * 1.015).toFixed(spec.digits)));
      setRiskTakeProfit2(Number((liveP * 1.035).toFixed(spec.digits)));
    } else {
      setRiskStopLoss(Number((liveP * 1.015).toFixed(spec.digits)));
      setRiskTakeProfit1(Number((liveP * 0.985).toFixed(spec.digits)));
      setRiskTakeProfit2(Number((liveP * 0.965).toFixed(spec.digits)));
    }
  };

  // Reset risk entry to live real-time price
  const handleResetRiskToLivePrice = () => {
    const liveP = activeRiskLivePrice;
    const spec = getContractSpec(selectedRiskSym, liveP);
    setRiskEntryPrice(liveP);
    if (riskDirection === 'BUY') {
      setRiskStopLoss(Number((liveP * 0.985).toFixed(spec.digits)));
      setRiskTakeProfit1(Number((liveP * 1.015).toFixed(spec.digits)));
      setRiskTakeProfit2(Number((liveP * 1.035).toFixed(spec.digits)));
    } else {
      setRiskStopLoss(Number((liveP * 1.015).toFixed(spec.digits)));
      setRiskTakeProfit1(Number((liveP * 0.985).toFixed(spec.digits)));
      setRiskTakeProfit2(Number((liveP * 0.965).toFixed(spec.digits)));
    }
  };

  // Quick SL and TP percentage offset buttons
  const applyQuickSL = (percent: number) => {
    const spec = getContractSpec(selectedRiskSym, riskEntryPrice);
    if (riskDirection === 'BUY') {
      setRiskStopLoss(Number((riskEntryPrice * (1 - percent / 100)).toFixed(spec.digits)));
    } else {
      setRiskStopLoss(Number((riskEntryPrice * (1 + percent / 100)).toFixed(spec.digits)));
    }
  };

  const applyQuickTP = (tp1Pct: number, tp2Pct: number) => {
    const spec = getContractSpec(selectedRiskSym, riskEntryPrice);
    if (riskDirection === 'BUY') {
      setRiskTakeProfit1(Number((riskEntryPrice * (1 + tp1Pct / 100)).toFixed(spec.digits)));
      setRiskTakeProfit2(Number((riskEntryPrice * (1 + tp2Pct / 100)).toFixed(spec.digits)));
    } else {
      setRiskTakeProfit1(Number((riskEntryPrice * (1 - tp1Pct / 100)).toFixed(spec.digits)));
      setRiskTakeProfit2(Number((riskEntryPrice * (1 - tp2Pct / 100)).toFixed(spec.digits)));
    }
  };

  // Direction toggle in risk tab
  const handleToggleRiskDirection = (dir: 'BUY' | 'SELL') => {
    setRiskDirection(dir);
    const spec = getContractSpec(selectedRiskSym, riskEntryPrice);
    if (dir === 'BUY') {
      setRiskStopLoss(Number((riskEntryPrice * 0.985).toFixed(spec.digits)));
      setRiskTakeProfit1(Number((riskEntryPrice * 1.015).toFixed(spec.digits)));
      setRiskTakeProfit2(Number((riskEntryPrice * 1.035).toFixed(spec.digits)));
    } else {
      setRiskStopLoss(Number((riskEntryPrice * 1.015).toFixed(spec.digits)));
      setRiskTakeProfit1(Number((riskEntryPrice * 0.985).toFixed(spec.digits)));
      setRiskTakeProfit2(Number((riskEntryPrice * 0.965).toFixed(spec.digits)));
    }
  };

  // Calculate Institutional Position Sizing via Engine
  const riskCalculation = useMemo(() => {
    return calculateInstitutionalRiskSizing(
      selectedRiskSym,
      riskDirection,
      riskEntryPrice,
      riskStopLoss,
      riskTakeProfit1,
      riskTakeProfit2,
      accountBalance,
      riskPercent,
      hardCap,
      riskLeverage
    );
  }, [
    selectedRiskSym,
    riskDirection,
    riskEntryPrice,
    riskStopLoss,
    riskTakeProfit1,
    riskTakeProfit2,
    accountBalance,
    riskPercent,
    hardCap,
    riskLeverage
  ]);

  return (
    <div className="bg-slate-900 p-3.5 sm:p-5 md:p-6 rounded-2xl border border-slate-800 space-y-6 shadow-2xl text-right">
      {/* ========================================================================= */}
      {/* MAIN TOP HEADER & REAL-TIME STATUS BAR                                    */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between border-b border-slate-800/90 pb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-amber-500/20 via-emerald-500/20 to-cyan-500/20 border border-emerald-500/60 flex items-center justify-center text-emerald-400 font-bold shadow-lg">
            <Gem className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg md:text-xl font-black text-white flex items-center gap-2 flex-wrap">
              <span>حاسبة العملات الماسية والأرباح اللحظية</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/60 text-emerald-300 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
                The 8 Diamond Coins Only
              </span>
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
              <span>مخصصة حصراً للعملات الماسية الـ 8 الأكثر استقراراً وسيولة: حساب الأرباح بنسبة الربح المستهدفة + إدارة حجم العقد والمخاطر</span>
              {lastPriceUpdateTime && (
                <span className="text-[11px] text-emerald-400 font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                  آخر تحديث لحظي من OKX: {lastPriceUpdateTime}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Global Tab Navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 shadow-inner">
          <button
            type="button"
            onClick={() => setCalculatorTab('diamond')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-black transition cursor-pointer ${
              calculatorTab === 'diamond'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Gem className="w-3.5 h-3.5 text-emerald-300" />
            <span>💎 أرباح العملات الماسية (% الربح)</span>
          </button>

          <button
            type="button"
            onClick={() => setCalculatorTab('risk')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-black transition cursor-pointer ${
              calculatorTab === 'risk'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Calculator className="w-3.5 h-3.5 text-cyan-300" />
            <span>🛡️ حجم العقد والمخاطرة الماسية</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DIAMOND COINS TARGET PROFIT CALCULATOR                              */}
      {/* ========================================================================= */}
      {calculatorTab === 'diamond' && (
        <div className="space-y-6">
          {/* 1. Live Real-Time Banner & Diamond Coins Selector */}
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>اختر إحدى العملات الماسية الـ 8 المعتمدة:</span>
                <span className="text-[11px] text-emerald-400 font-mono">
                  (أسعار لحظية مباشرة من OKX)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={refreshLivePrices}
                  disabled={isLoadingPrices}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-700 transition cursor-pointer disabled:opacity-50"
                  title="تحديث فوري لأسعار العملات الماسية"
                >
                  <RefreshCw className={`w-3 h-3 text-emerald-400 ${isLoadingPrices ? 'animate-spin' : ''}`} />
                  <span>تحديث لحظي</span>
                </button>
              </div>
            </div>

            {/* 8 Diamond Coin Cards with Real-time Prices */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {DIAMOND_TIER_COINS.map((coin) => {
                const isSelected = selectedDiamondSym === coin.symbol;
                const currentP = livePrices[coin.symbol] || coin.defaultPrice;
                const chg = priceChanges[coin.symbol] || 0;
                const isPositive = chg >= 0;

                return (
                  <button
                    key={coin.symbol}
                    type="button"
                    onClick={() => handleSelectDiamondCoin(coin.symbol)}
                    className={`p-2.5 rounded-xl border transition text-center cursor-pointer relative overflow-hidden group ${
                      isSelected
                        ? 'bg-gradient-to-b from-emerald-950/90 to-slate-900 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-1 left-1 bg-emerald-500 text-slate-950 rounded-full p-0.5">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                    <div className="text-lg mb-0.5">{coin.icon}</div>
                    <div className="font-mono font-bold text-white text-xs">{coin.symbol.replace('USDT', '')}</div>
                    <div className="text-[10px] text-slate-400 truncate">{coin.name}</div>
                    <div className="mt-1 font-mono text-[11px] font-black text-emerald-300">
                      ${currentP.toLocaleString('en-US', { minimumFractionDigits: coin.decimals, maximumFractionDigits: coin.decimals })}
                    </div>
                    {chg !== 0 && (
                      <div className={`text-[9px] font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? '+' : ''}{chg.toFixed(1)}%
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Interactive Input Panel: Target Profit %, Investment Margin & Direction */}
          <div className="bg-slate-950/70 p-4 md:p-5 rounded-2xl border border-slate-800 space-y-5">
            {/* Top Bar: Direction and Calculation Mode */}
            <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">اتجاه التداول:</span>
                <div className="inline-flex p-1 bg-slate-900 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDiamondDirection('BUY')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                      diamondDirection === 'BUY'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>🟢 صعود / شراء (LONG / Spot)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiamondDirection('SELL')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                      diamondDirection === 'SELL'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>🔴 هبوط / بيع (SHORT Futures)</span>
                  </button>
                </div>
              </div>

              {/* Mode Toggle: By % vs By $ */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-bold">نمط الإدخال:</span>
                <div className="inline-flex p-1 bg-slate-900 rounded-lg border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setCalcMode('BY_PERCENT')}
                    className={`px-3 py-1 rounded font-bold transition cursor-pointer ${
                      calcMode === 'BY_PERCENT'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    أحدد نسبة الربح المطلوبة (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcMode('BY_DOLLARS')}
                    className={`px-3 py-1 rounded font-bold transition cursor-pointer ${
                      calcMode === 'BY_DOLLARS'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    أحدد مبلغ الربح بالدولار ($)
                  </button>
                </div>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Real-time Entry Price */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">سعر الدخول ($ Entry):</label>
                  <button
                    type="button"
                    onClick={handleResetToDiamondLivePrice}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer flex items-center gap-1"
                    title="استرجاع السعر اللحظي الحالي من بورصة OKX"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>السعر اللحظي (${activeDiamondLivePrice.toLocaleString()})</span>
                  </button>
                </div>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="number"
                    step="any"
                    value={customEntryPrice}
                    onChange={(e) => setCustomEntryPrice(Math.max(0.000001, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 text-white pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-emerald-500 outline-none text-left"
                    dir="ltr"
                  />
                </div>
                <span className="text-[10px] text-slate-400 block truncate">
                  العملة المحددة: {activeDiamondCoin.name} ({activeDiamondCoin.symbol})
                </span>
              </div>

              {/* 2. Target Profit % OR Target Profit $ */}
              {calcMode === 'BY_PERCENT' ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-300">نسبة الربح المستهدفة (%):</label>
                    <span className="text-[11px] text-emerald-400 font-mono font-black">
                      +{targetProfitPercent}%
                    </span>
                  </div>
                  <div className="relative">
                    <Percent className="w-4 h-4 text-emerald-400 absolute right-3 top-3" />
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      max="1000"
                      value={targetProfitPercent}
                      onChange={(e) => setTargetProfitPercent(Math.max(0.05, Number(e.target.value)))}
                      className="w-full bg-slate-950 border border-emerald-500/80 text-emerald-300 pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-emerald-400 outline-none text-left"
                      dir="ltr"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    يمكنك كتابة أي نسبة تريدها (+5%, +12%, +25%...)
                  </span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-300">مبلغ الربح المطلوب ($):</label>
                    <span className="text-[11px] text-emerald-400 font-mono font-black">
                      +${desiredProfitDollars} USDT
                    </span>
                  </div>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-emerald-400 absolute right-3 top-3" />
                    <input
                      type="number"
                      step="10"
                      min="1"
                      value={desiredProfitDollars}
                      onChange={(e) => setDesiredProfitDollars(Math.max(1, Number(e.target.value)))}
                      className="w-full bg-slate-950 border border-emerald-500/80 text-emerald-300 pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-emerald-400 outline-none text-left"
                      dir="ltr"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    صافي الدولارات المراد جنيها كربح
                  </span>
                </div>
              )}

              {/* 3. Investment Margin ($) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">مبلغ الاستثمار / الهامش ($):</label>
                  <span className="text-[11px] text-cyan-400 font-mono font-bold">${investmentMargin} USDT</span>
                </div>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="number"
                    step="50"
                    min="10"
                    value={investmentMargin}
                    onChange={(e) => setInvestmentMargin(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 text-white pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-cyan-500 outline-none text-left"
                    dir="ltr"
                  />
                </div>
                <span className="text-[10px] text-slate-400 block">
                  رأس المال المخصص للدخول
                </span>
              </div>

              {/* 4. Leverage Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">نوع الصفقة والرافعة:</label>
                  <span className="text-[11px] text-amber-400 font-mono font-bold">
                    {diamondLeverage === 1 ? 'Spot (فوري 1x)' : `${diamondLeverage}x (Futures)`}
                  </span>
                </div>
                <select
                  value={diamondLeverage}
                  onChange={(e) => setDiamondLeverage(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-xl font-bold font-mono focus:border-amber-500 outline-none cursor-pointer"
                >
                  <option value={1}>1x (Spot / تداول فوري بدون رافعة - أمان 100%)</option>
                  <option value={2}>2x (عقود آجلة - رافعة منخفضة وآمنة)</option>
                  <option value={3}>3x (عقود آجلة - موصى بها)</option>
                  <option value={5}>5x (عقود آجلة - قياسية)</option>
                  <option value={10}>10x (عقود آجلة - محترفين)</option>
                  <option value={20}>20x (عقود آجلة - مخاطرة مرتفعة)</option>
                </select>
                <span className="text-[10px] text-slate-400 block">
                  القيمة الكلية للمركز: ${(investmentMargin * diamondLeverage).toLocaleString()} USDT
                </span>
              </div>
            </div>

            {/* Quick Profit % Presets */}
            {calcMode === 'BY_PERCENT' && (
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>نسب سريعة شائعة لجني الأرباح (اختر بنقرة واحدة):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[2, 3, 5, 7.5, 10, 15, 20, 25, 30, 50, 100].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTargetProfitPercent(p)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                        targetProfitPercent === p
                          ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      +{p}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Investment Margin Presets */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="font-bold">مبالغ استثمار شائعة:</span>
              {[100, 250, 500, 1000, 2500, 5000].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setInvestmentMargin(m)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition cursor-pointer ${
                    investmentMargin === m
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500 font-bold'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  ${m}
                </button>
              ))}
            </div>
          </div>

          {/* 3. CALCULATED METRICS CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: NET PROFIT IN DOLLARS ($ USDT) */}
            <div className="bg-gradient-to-b from-emerald-950/60 to-slate-950 p-5 rounded-2xl border-2 border-emerald-500/80 shadow-xl space-y-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
              <div className="text-xs text-emerald-400 font-black flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" />
                  <span>صافي مبلغ الربح بالدولار (Net Profit)</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 font-mono">
                  +{diamondMetrics.profitPercent.toFixed(1)}%
                </span>
              </div>
              <div className="font-mono text-3xl font-black text-emerald-400" dir="ltr">
                +${diamondMetrics.profitAmountUsdt.toFixed(2)}{' '}
                <span className="text-sm font-sans text-emerald-300">USDT</span>
              </div>
              <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800 flex items-center justify-between">
                <span>عائد رأس المال (ROE):</span>
                <span className="font-mono font-black text-emerald-300">
                  +{diamondMetrics.roePercent.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Card 2: TARGET EXIT PRICE (TAKE PROFIT) */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-md space-y-2 relative">
              <div className="text-xs text-cyan-300 font-bold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-cyan-400" />
                  <span>سعر الخروج المستهدف (Target TP)</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyTargetPrice}
                  className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title="نسخ سعر الهدف"
                >
                  {copiedTarget ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="font-mono text-2xl font-black text-cyan-300" dir="ltr">
                ${diamondMetrics.targetExitPrice.toLocaleString('en-US', {
                  minimumFractionDigits: activeDiamondCoin.decimals,
                  maximumFractionDigits: activeDiamondCoin.decimals,
                })}
              </div>
              <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800 flex items-center justify-between">
                <span>فارق السعر:</span>
                <span className="font-mono font-bold text-white">
                  {diamondDirection === 'BUY' ? '+' : '-'}{diamondMetrics.profitPercent.toFixed(2)}% من الدخول
                </span>
              </div>
            </div>

            {/* Card 3: POSITION QUANTITY & NOTIONAL */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-md space-y-2">
              <div className="text-xs text-amber-300 font-bold flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>كمية العملة والقيمة الإجمالية</span>
              </div>
              <div className="font-mono text-2xl font-black text-white" dir="ltr">
                {diamondMetrics.coinUnits.toFixed(diamondMetrics.coinUnits < 1 ? 4 : 2)}{' '}
                <span className="text-sm font-sans text-amber-400">{activeDiamondCoin.symbol.replace('USDT', '')}</span>
              </div>
              <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800 flex items-center justify-between">
                <span>القيمة بالدولار:</span>
                <span className="font-mono font-bold text-slate-200">
                  ${diamondMetrics.positionNotional.toLocaleString()} USDT
                </span>
              </div>
            </div>

            {/* Card 4: TOTAL ACCOUNT RETURN */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-teal-800/80 shadow-md space-y-2">
              <div className="text-xs text-teal-300 font-bold flex items-center gap-1.5">
                <Award className="w-4 h-4 text-teal-400" />
                <span>إجمالي المبلغ المسترد عند الهدف</span>
              </div>
              <div className="font-mono text-2xl font-black text-teal-300" dir="ltr">
                ${diamondMetrics.totalReturnUsdt.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800 flex items-center justify-between">
                <span>الهامش المسترد:</span>
                <span className="font-mono font-bold text-slate-300">
                  ${diamondMetrics.margin.toFixed(2)} + ${diamondMetrics.profitAmountUsdt.toFixed(2)} ربح
                </span>
              </div>
            </div>
          </div>

          {/* 4. Full Live Comparison Matrix for all 8 Diamond Coins */}
          <div className="bg-slate-950 p-4 md:p-5 rounded-2xl border border-slate-800 space-y-3 shadow-md">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <Gem className="w-4 h-4 text-amber-400" />
                <span>مصفوفة مقارنة أرباح العملات الماسية الـ 8 المباشرة (Diamond Live Matrix):</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400">
                  استثمار <strong className="text-white">${diamondMetrics.margin}</strong> بربح{' '}
                  <strong className="text-emerald-400">+{diamondMetrics.profitPercent.toFixed(1)}%</strong> ورافعة{' '}
                  <strong className="text-cyan-400">{diamondMetrics.leverage}x</strong>
                </span>
                <button
                  type="button"
                  onClick={handleCopyFullPlan}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-700 transition cursor-pointer"
                >
                  {copiedSummary ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>نسخ الخطة الكاملة</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-900/50">
                    <th className="p-3">العملة الماسية</th>
                    <th className="p-3">السعر اللحظي الحالي ($)</th>
                    <th className="p-3">سعر الهدف ({diamondDirection === 'BUY' ? 'TP ↗️' : 'TP ↘️'})</th>
                    <th className="p-3">كمية العملة (حبات)</th>
                    <th className="p-3 text-emerald-400">مبلغ الربح ($ USDT)</th>
                    <th className="p-3 text-cyan-400">العائد (ROE %)</th>
                    <th className="p-3">إجمالي الرصيد</th>
                    <th className="p-3 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {DIAMOND_TIER_COINS.map((coin) => {
                    const coinP = livePrices[coin.symbol] || coin.defaultPrice;
                    const coinTargetExit = diamondDirection === 'BUY'
                      ? coinP * (1 + diamondMetrics.profitPercent / 100)
                      : coinP * (1 - diamondMetrics.profitPercent / 100);
                    const coinUnits = coinP > 0 ? diamondMetrics.positionNotional / coinP : 0;
                    const isRowSelected = coin.symbol === selectedDiamondSym;

                    return (
                      <tr
                        key={coin.symbol}
                        className={`transition ${
                          isRowSelected
                            ? 'bg-emerald-950/40 font-bold'
                            : 'hover:bg-slate-900/60 text-slate-300'
                        }`}
                      >
                        <td className="p-3 font-sans flex items-center gap-2">
                          <span className="text-base">{coin.icon}</span>
                          <div>
                            <span className="text-white font-bold block">{coin.symbol.replace('USDT', '')}</span>
                            <span className="text-[10px] text-slate-500 font-normal">{coin.name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-200">
                          ${coinP.toLocaleString('en-US', { minimumFractionDigits: coin.decimals, maximumFractionDigits: coin.decimals })}
                        </td>
                        <td className="p-3 text-cyan-300 font-bold">
                          ${coinTargetExit.toLocaleString('en-US', { minimumFractionDigits: coin.decimals, maximumFractionDigits: coin.decimals })}
                        </td>
                        <td className="p-3 text-slate-300">
                          {coinUnits.toFixed(coinUnits < 1 ? 4 : 2)}
                        </td>
                        <td className="p-3 text-emerald-400 font-black text-sm">
                          +${diamondMetrics.profitAmountUsdt.toFixed(2)}
                        </td>
                        <td className="p-3 text-cyan-300 font-bold">
                          +{diamondMetrics.roePercent.toFixed(1)}%
                        </td>
                        <td className="p-3 text-teal-300 font-bold">
                          ${diamondMetrics.totalReturnUsdt.toFixed(2)}
                        </td>
                        <td className="p-3 text-center font-sans">
                          {isRowSelected ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/50">
                              <Check className="w-3 h-3" /> المحددة
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelectDiamondCoin(coin.symbol)}
                              className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 transition cursor-pointer"
                            >
                              تطبيق
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Practical Implementation Guide */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2">
            <div className="font-bold text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" />
              <span>كيف تنفذ هذه الأرقام في المنصة (Binance / OKX / Bybit)؟</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pr-1 leading-relaxed">
              <li>
                <strong className="text-white">أمر أخذ الربح (Take Profit - TP):</strong> ضع السعر المستهدف بدقة:{' '}
                <code className="text-cyan-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                  ${diamondMetrics.targetExitPrice.toFixed(activeDiamondCoin.decimals)}
                </code>
              </li>
              <li>
                <strong className="text-white">في خانة حجم المركز أو الهامش:</strong> أدخل مبلغ{' '}
                <code className="text-emerald-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                  ${diamondMetrics.margin} USDT
                </code>{' '}
                مع رافعة <code className="text-white font-mono">{diamondMetrics.leverage}x</code>.
              </li>
              <li>
                <strong className="text-white">التداول الفوري (Spot):</strong> اختر رافعة{' '}
                <code className="text-amber-300 font-mono">1x</code> لتحصل على أمان كامل ومبلغ ربح مؤكد عند وصول السعر للهدف بدون أي مخاطرة تصفية.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DIAMOND INSTITUTIONAL RISK SIZING & POSITION SIZING (Exclusively Diamond) */}
      {/* ========================================================================= */}
      {calculatorTab === 'risk' && (
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>حاسبة حجم العقد والمخاطرة للعملات الماسية</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-300 font-mono">
                  OKX Real-Time Live Feed ⚡
                </span>
              </h3>
              <span className="text-xs text-slate-400">
                أسعار العملات الماسية الـ 8 لحظية ومباشرة لحساب حجم اللوت، الهامش المطلوب، وسقف الخسارة الصارم (Hard Cap)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {riskCalculation.isHardCapApplied && (
                <div className="bg-rose-950/80 text-rose-300 border border-rose-600/80 px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>تفعيل سقف الخسارة الصارم (${hardCap})</span>
                </div>
              )}

              <button
                type="button"
                onClick={refreshLivePrices}
                disabled={isLoadingPrices}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 text-cyan-400 ${isLoadingPrices ? 'animate-spin' : ''}`} />
                <span>تحديث الأسعار اللحظية</span>
              </button>
            </div>
          </div>

          {/* 1. Diamond Coins Selector exclusively */}
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Gem className="w-4 h-4 text-emerald-400" />
                <span>اختر العملة الماسية لحساب حجم العقد:</span>
              </span>
              <span className="text-[11px] text-cyan-400 font-mono">
                العملة المحددة: {activeRiskCoin.name} ({activeRiskCoin.symbol})
              </span>
            </div>

            {/* The 8 Diamond Coins Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {DIAMOND_TIER_COINS.map((coin) => {
                const isSelected = selectedRiskSym === coin.symbol;
                const liveP = livePrices[coin.symbol] || coin.defaultPrice;
                const chg = priceChanges[coin.symbol] || 0;
                const isPositive = chg >= 0;

                return (
                  <button
                    key={coin.symbol}
                    type="button"
                    onClick={() => handleSelectRiskSymbol(coin.symbol)}
                    className={`p-2.5 rounded-xl border transition text-center cursor-pointer relative overflow-hidden group ${
                      isSelected
                        ? 'bg-cyan-950/80 border-cyan-500 shadow-md ring-1 ring-cyan-500/50'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-1 left-1 bg-cyan-500 text-slate-950 rounded-full p-0.5">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                    <div className="text-lg mb-0.5">{coin.icon}</div>
                    <div className="font-mono font-bold text-white text-xs">{coin.symbol.replace('USDT', '')}</div>
                    <div className="text-[10px] text-slate-400 truncate">{coin.name}</div>
                    <div className="mt-1 font-mono text-[11px] font-black text-cyan-300">
                      ${liveP.toLocaleString('en-US', { minimumFractionDigits: coin.decimals, maximumFractionDigits: coin.decimals })}
                    </div>
                    {chg !== 0 && (
                      <div className={`text-[9px] font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? '+' : ''}{chg.toFixed(1)}%
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Interactive Parameters & Direction */}
          <div className="bg-slate-950/70 p-4 md:p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">اتجاه الصفقة:</span>
                <div className="inline-flex p-1 bg-slate-900 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleToggleRiskDirection('BUY')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                      riskDirection === 'BUY'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>🟢 شراء (LONG)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleRiskDirection('SELL')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                      riskDirection === 'SELL'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>🔴 بيع (SHORT)</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">
                  العملة الماسية: <strong className="text-cyan-300 font-mono">{selectedRiskSym}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleResetRiskToLivePrice}
                  className="text-xs px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-850 text-cyan-400 border border-slate-700 transition cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>تحديث لسعر السوق اللحظي (${activeRiskLivePrice.toLocaleString()})</span>
                </button>
              </div>
            </div>

            {/* Input Grid 1: Price Levels (Entry, SL, TP1, TP2) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Entry Price */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">سعر الدخول ($ Entry):</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="number"
                    step="any"
                    value={riskEntryPrice}
                    onChange={(e) => setRiskEntryPrice(Math.max(0.000001, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 text-white pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-cyan-500 outline-none text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Stop Loss */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-rose-300">وقف الخسارة ($ Stop Loss):</label>
                  <span className="text-[10px] text-rose-400 font-mono">
                    {riskCalculation.slDistancePercent.toFixed(2)}% مسافة
                  </span>
                </div>
                <div className="relative">
                  <ShieldAlert className="w-4 h-4 text-rose-400 absolute right-3 top-3" />
                  <input
                    type="number"
                    step="any"
                    value={riskStopLoss}
                    onChange={(e) => setRiskStopLoss(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-rose-800/80 text-rose-300 pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-rose-500 outline-none text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Take Profit 1 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-emerald-300">الهدف الأول ($ TP1):</label>
                <div className="relative">
                  <Target className="w-4 h-4 text-emerald-400 absolute right-3 top-3" />
                  <input
                    type="number"
                    step="any"
                    value={riskTakeProfit1}
                    onChange={(e) => setRiskTakeProfit1(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-emerald-800/80 text-emerald-300 pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-emerald-500 outline-none text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Take Profit 2 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-teal-300">الهدف الثاني ($ TP2):</label>
                <div className="relative">
                  <Award className="w-4 h-4 text-teal-400 absolute right-3 top-3" />
                  <input
                    type="number"
                    step="any"
                    value={riskTakeProfit2}
                    onChange={(e) => setRiskTakeProfit2(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-teal-800/80 text-teal-300 pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-teal-500 outline-none text-left"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* Quick Offset Buttons */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400">مسافة الستوب السريعة:</span>
                {[1, 1.5, 2, 2.5, 3, 5].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyQuickSL(p)}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-rose-300 text-[10px] font-mono border border-slate-800 cursor-pointer"
                  >
                    -{p}%
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400">أهداف سريعة:</span>
                {[
                  { label: '1.5% / 3%', tp1: 1.5, tp2: 3 },
                  { label: '2% / 4%', tp1: 2, tp2: 4 },
                  { label: '3% / 6%', tp1: 3, tp2: 6 },
                  { label: '5% / 10%', tp1: 5, tp2: 10 },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => applyQuickTP(item.tp1, item.tp2)}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-emerald-300 text-[10px] font-mono border border-slate-800 cursor-pointer"
                  >
                    +{item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Grid 2: Capital, Risk %, Hard Cap & Leverage */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-800">
              {/* Account Balance */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">رأس المال الكلي ($ Balance):</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="number"
                    value={accountBalance}
                    onChange={(e) => setAccountBalance(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 text-white pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-cyan-500 outline-none text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Risk Percentage */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">نسبة المخاطرة (% Risk):</label>
                <div className="relative">
                  <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="number"
                    step="0.25"
                    min="0.1"
                    max="10"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(Math.max(0.1, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 text-white pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-cyan-500 outline-none text-left"
                    dir="ltr"
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
                  <DollarSign className="w-4 h-4 text-rose-400 absolute right-3 top-3" />
                  <input
                    type="number"
                    step="100"
                    min="50"
                    value={hardCap}
                    onChange={(e) => setHardCap(Math.max(10, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-rose-800/80 text-rose-300 pr-9 pl-3 py-2 rounded-xl font-bold font-mono focus:border-rose-500 outline-none text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Leverage Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">الرافعة المالية (Leverage):</label>
                <select
                  value={riskLeverage}
                  onChange={(e) => setRiskLeverage(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-xl font-bold font-mono focus:border-cyan-500 outline-none cursor-pointer"
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
          </div>

          {/* 3. Calculated Institutional Risk Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Exact Lot Size */}
            <div className="bg-slate-950 p-4 rounded-xl border border-cyan-800/60 text-center space-y-1 shadow-md">
              <div className="text-xs text-cyan-400 flex items-center justify-center gap-1 font-bold">
                <Award className="w-4 h-4" />
                <span>حجم العقد المقترح (Lot Size)</span>
              </div>
              <div className="font-mono text-xl md:text-2xl font-black text-white">
                {riskCalculation.roundedLots} <span className="text-xs text-cyan-400 font-sans">لوت / حبة</span>
              </div>
              <div className="text-[10px] text-slate-400">
                خطوة التقريب: {riskCalculation.spec.volumeStep} | العقد: {riskCalculation.spec.contractSize} وحدة
              </div>
            </div>

            {/* 2. Maximum Dollar Loss */}
            <div className="bg-slate-950 p-4 rounded-xl border border-rose-900/60 text-center space-y-1 shadow-md">
              <div className="text-xs text-rose-400 flex items-center justify-center gap-1 font-bold">
                <ShieldAlert className="w-4 h-4" />
                <span>الخسارة الفعلية عند الستوب</span>
              </div>
              <div className="font-mono text-xl md:text-2xl font-black text-rose-400">
                -${riskCalculation.maxDollarLoss.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400">
                {riskCalculation.isHardCapApplied ? `مقيد بالسقف ($${hardCap})` : `(${riskPercent}% من الرصيد)`}
              </div>
            </div>

            {/* 3. Margin Required */}
            <div className="bg-slate-950 p-4 rounded-xl border border-emerald-900/60 text-center space-y-1 shadow-md">
              <div className="text-xs text-emerald-400 flex items-center justify-center gap-1 font-bold">
                <ArrowUpRight className="w-4 h-4" />
                <span>الهامش المطلوب (Margin)</span>
              </div>
              <div className="font-mono text-xl md:text-2xl font-black text-emerald-300">
                ${riskCalculation.marginRequiredUsd.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400">
                القيمة الإجمالية: ${riskCalculation.positionNotionalUsd.toFixed(2)}
              </div>
            </div>

            {/* 4. TP1 Profit */}
            <div className="bg-slate-950 p-4 rounded-xl border border-teal-900/60 text-center space-y-1 shadow-md">
              <div className="text-xs text-teal-400 flex items-center justify-center gap-1 font-bold">
                <Award className="w-4 h-4" />
                <span>الربح عند TP1 (نسبة {riskCalculation.riskRewardRatio})</span>
              </div>
              <div className="font-mono text-xl md:text-2xl font-black text-teal-300">
                +${riskCalculation.tp1DollarProfit.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400">
                (إغلاق 50% بقيمة +${(riskCalculation.tp1DollarProfit * 0.5).toFixed(2)} وحجز الدخول)
              </div>
            </div>
          </div>

          {/* Institutional Order Summary Card */}
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-white flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>ملخص الأمر الجاهز للتنفيذ في منصات التداول (Order Ticket Summary):</span>
              </span>
              <span className="text-[11px] text-cyan-400 font-mono">
                {selectedRiskSym} | {riskDirection} | {riskLeverage}x
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">حجم العقد</span>
                <span className="text-white font-bold">{riskCalculation.roundedLots} {activeRiskCoin.symbol.replace('USDT', '')}</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">سعر الدخول</span>
                <span className="text-cyan-300 font-bold">${riskCalculation.entryPrice.toLocaleString()}</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">وقف الخسارة (SL)</span>
                <span className="text-rose-400 font-bold">${riskCalculation.stopLoss.toLocaleString()}</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">الهدف الأول (TP1)</span>
                <span className="text-emerald-400 font-bold">${riskCalculation.takeProfit1.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

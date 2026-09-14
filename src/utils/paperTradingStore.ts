import { savePortfolioToTurso, getPortfolioFromTurso } from './tursoSync';
import { getStrategySettings } from './settingsStore';
import { calculateInstitutionalRiskSizing, orderCalcProfit, getContractSpec } from './institutionalRiskEngine';
import { checkEconomicCalendarNewsLock } from './economicCalendarService';
import { AnalysisResult } from '../types';

/**
 * SOP 5/5 Pro V9.00 - Institutional Paper Trading & Virtual Portfolio Journal Store
 * 
 * 1. Institutional Risk Sizing & Hard Cap ($1,000 max loss)
 * 2. 50% Partial Scale-Out at 1:1 R:R (TP1) + Auto Break-Even
 * 3. Smart ATR Trailing Stop on runner 50%
 * 4. Safety Circuit Breakers:
 *    - Daily Max Loss (-3%) Auto Stop
 *    - Daily Target Lock (+4%) Gains Protector
 *    - Margin Guard (500% Minimum Level)
 *    - Correlated Asset Guard (XAU/XAG Metals)
 *    - Cooldown Period (45 Minutes)
 *    - NY Volatility Window (15:20 - 15:45 UTC)
 *    - Friday Weekend Gap Guard (Close Forex/Metals Friday 20:00 UTC)
 *    - Native Economic Calendar Filter (High Impact News Protection)
 *    - Max Deviation / Slippage Protection (20 points / 2 pips)
 */

export interface VirtualTrade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  orderType?: 'MARKET' | 'LIMIT' | 'STOP';
  entryPrice: number;
  currentPrice: number;
  initialMarketPriceAtCreation?: number;
  stopLoss: number;
  originalStopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3?: number;
  takeProfit4?: number;
  quantity: number; // current open lots/units
  initialQuantity: number;
  allocatedAmount: number; // USDT margin
  initialAllocatedAmount: number;
  positionSizeUsdt?: number; // Notional position size ($)
  leverage?: number;
  riskPercent?: number;
  riskUsdt?: number;
  hardRiskCapApplied?: boolean;
  maxDeviationPoints?: number;
  status: 'OPEN' | 'PENDING_ENTRY' | 'CLOSED_TP1' | 'CLOSED_TP2' | 'CLOSED_SL' | 'CLOSED_TRAILING' | 'CLOSED_BREAKEVEN' | 'CLOSED_MANUAL' | 'CLOSED_SCALE_OUT_RUNNER' | 'CLOSED_FRIDAY_GAP_GUARD' | 'CLOSED_CANCELLED';
  entryTime: string;
  createdTime?: string;
  filledTime?: string;
  closeTime?: string;
  exitPrice?: number;
  pnlUsdt: number; // unrealized or realized on current portion
  pnlPercent: number;
  sopScore?: number;
  highestPriceSeen?: number;
  lowestPriceSeen?: number;
  
  // 1. Partial Scale-Out (50% at TP1 / 1:1 R:R)
  isScaleOutDone?: boolean;
  scaleOutPrice?: number;
  scaleOutPnlUsdt?: number;
  scaleOutTime?: string;
  scaleOutRatioPercent?: number;

  // 2. Auto Break-Even
  isBreakEvenTriggered?: boolean;
  breakEvenPrice?: number;
  breakEvenTime?: string;

  // 3. Smart ATR Trailing Stop
  isTrailingActive?: boolean;
  atrValue?: number;
  atrMultiplier?: number;
  trailingStopLevel?: number;
}

export interface PaperPortfolio {
  initialBalance: number;
  cashBalance: number;
  dailyStartEquity: number;
  dailyDate: string; // YYYY-MM-DD
  openTrades: VirtualTrade[];
  closedTrades: VirtualTrade[];
  equityHistory: { time: string; equity: number }[];
}

export interface CircuitBreakerState {
  isTradingAllowed: boolean;
  botState: 'RUNNING' | 'DAILY_LOSS_LOCK' | 'DAILY_TARGET_LOCK' | 'MARGIN_GUARD_LOCK' | 'COOLDOWN' | 'NY_VOLATILITY_BLOCK' | 'CORRELATION_BLOCK' | 'FRIDAY_GAP_GUARD_BLOCK' | 'NEWS_CALENDAR_BLOCK';
  statusBadge: {
    label: string;
    description: string;
    variant: 'emerald' | 'rose' | 'amber' | 'cyan' | 'purple';
  };
  todayNetPnlUsdt: number;
  todayNetPnlPercent: number;
  marginLevelPercent: number;
  usedMarginUsdt: number;
  totalEquity: number;
  openTradesCount: number;
  isDailyLossHit: boolean;
  isDailyTargetHit: boolean;
  isMarginGuardHit: boolean;
  isNyVolatilityActive: boolean;
  isFridayGapGuardActive: boolean;
  isNewsCalendarActive: boolean;
}

const PORTFOLIO_KEY = 'crypto_analyzer_paper_portfolio_v9';

function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const INITIAL_PORTFOLIO: PaperPortfolio = {
  initialBalance: 10000,
  cashBalance: 10000,
  dailyStartEquity: 10000,
  dailyDate: getTodayDateString(),
  openTrades: [],
  closedTrades: [],
  equityHistory: [{ time: new Date().toLocaleTimeString('ar-EG'), equity: 10000 }],
};

export function getPaperPortfolio(): PaperPortfolio {
  if (typeof window === 'undefined') return INITIAL_PORTFOLIO;
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    if (!raw) return INITIAL_PORTFOLIO;
    const parsed = JSON.parse(raw);
    const today = getTodayDateString();

    const merged: PaperPortfolio = {
      ...INITIAL_PORTFOLIO,
      ...parsed,
    };

    // Roll over daily baseline if date changed
    if (merged.dailyDate !== today) {
      const openMargin = merged.openTrades.reduce((acc, t) => acc + t.allocatedAmount, 0);
      const openPnl = merged.openTrades.reduce((acc, t) => acc + t.pnlUsdt, 0);
      const currentEquity = merged.cashBalance + openMargin + openPnl;
      merged.dailyStartEquity = currentEquity;
      merged.dailyDate = today;
      try {
        localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(merged));
      } catch {}
    }

    return merged;
  } catch (err) {
    console.error('Error loading paper portfolio:', err);
    return INITIAL_PORTFOLIO;
  }
}

export function savePaperPortfolio(portfolio: PaperPortfolio): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio));
    // Asynchronously dispatch the event on next tick to avoid triggering React setState during another component's render
    setTimeout(() => {
      window.dispatchEvent(new Event('paper-portfolio-updated'));
    }, 0);
    savePortfolioToTurso(portfolio).catch((err) => {
      console.warn('Background save to Turso failed:', err);
    });
  } catch (err) {
    console.error('Error saving paper portfolio:', err);
  }
}

export async function fetchPaperPortfolioFromTurso(): Promise<PaperPortfolio | null> {
  try {
    const remote = await getPortfolioFromTurso();
    if (remote && typeof remote === 'object') {
      const today = getTodayDateString();
      const merged: PaperPortfolio = {
        initialBalance: Number(remote.initialBalance || 10000),
        cashBalance: Number(remote.cashBalance ?? remote.initialBalance ?? 10000),
        dailyStartEquity: Number(remote.dailyStartEquity || remote.initialBalance || 10000),
        dailyDate: remote.dailyDate || today,
        openTrades: Array.isArray(remote.openTrades) ? remote.openTrades : [],
        closedTrades: Array.isArray(remote.closedTrades) ? remote.closedTrades : [],
        equityHistory: Array.isArray(remote.equityHistory) && remote.equityHistory.length > 0
          ? remote.equityHistory
          : [{ time: new Date().toLocaleTimeString('ar-EG'), equity: Number(remote.initialBalance || 10000) }],
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(merged));
        window.dispatchEvent(new Event('paper-portfolio-updated'));
      }
      return merged;
    }
  } catch {
    // Silent fallback to local storage
  }
  return null;
}

/**
 * Evaluates Safety Circuit Breakers (Daily Loss, Daily Target, Margin Guard, Cooldown, NY Volatility)
 */
export function checkCircuitBreakersStatus(
  portfolio: PaperPortfolio,
  candidateSymbol?: string
): CircuitBreakerState {
  const settings = getStrategySettings();
  const today = getTodayDateString();

  const totalOpenAlloc = portfolio.openTrades.reduce((acc, t) => acc + t.allocatedAmount, 0);
  const totalOpenPnl = portfolio.openTrades.reduce((acc, t) => acc + t.pnlUsdt, 0);
  const totalEquity = portfolio.cashBalance + totalOpenAlloc + totalOpenPnl;

  const baselineEquity = portfolio.dailyDate === today && portfolio.dailyStartEquity > 0
    ? portfolio.dailyStartEquity
    : portfolio.initialBalance;

  const todayNetPnlUsdt = totalEquity - baselineEquity;
  const todayNetPnlPercent = baselineEquity > 0 ? (todayNetPnlUsdt / baselineEquity) * 100 : 0;

  // Margin Level % = (Total Equity / Used Margin) * 100
  const marginLevelPercent = totalOpenAlloc > 0 ? (totalEquity / totalOpenAlloc) * 100 : 9999;

  // 1. Daily Max Loss Check (-8%)
  const isDailyLossHit = settings.enableDailyMaxLossCircuitBreaker &&
    todayNetPnlPercent <= -(Math.abs(settings.dailyMaxLossPercent || 8.0));

  // 2. Daily Target Lock Check (+15%)
  const isDailyTargetHit = settings.enableDailyTargetLock &&
    todayNetPnlPercent >= (settings.dailyTargetLockPercent || 15.0);

  // 3. Margin Guard (< 500%)
  const isMarginGuardHit = settings.enableMarginGuard &&
    totalOpenAlloc > 0 &&
    marginLevelPercent < (settings.minMarginLevelPercent || 500);

  // 4. NY Volatility Window (15:20 - 15:45 UTC)
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcDay = now.getUTCDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
  const currentUtcMinuteOfDay = utcHours * 60 + utcMinutes;
  const isNyVolatilityActive = settings.enableNyVolatilityFilter &&
    (currentUtcMinuteOfDay >= 15 * 60 + 20 && currentUtcMinuteOfDay <= 15 * 60 + 45);

  // 5. Friday Weekend Gap Guard (Friday after 20:00 UTC or Weekends for Forex/Metals)
  const isFridayEvening = (utcDay === 5 && utcHours >= (settings.fridayCloseHourUtc || 20)) || utcDay === 6 || (utcDay === 0 && utcHours < 22);
  const isFridayGapGuardActive = settings.enableFridayWeekendGapGuard && isFridayEvening;

  // 6. Native Economic Calendar News Filter (15m buffer)
  let isNewsCalendarActive = false;
  let newsFilterMsg = '';
  if (settings.enableEconomicCalendarFilter) {
    const newsCheck = checkEconomicCalendarNewsLock(candidateSymbol || 'BTCUSDT', settings.calendarNewsBufferMinutes || 15);
    if (newsCheck.isNewsLockActive) {
      isNewsCalendarActive = true;
      newsFilterMsg = newsCheck.message;
    }
  }

  // Determine Bot State and Badges
  let botState: CircuitBreakerState['botState'] = 'RUNNING';
  let isTradingAllowed = true;
  let statusBadge: CircuitBreakerState['statusBadge'] = {
    label: '🟢 نشط وجاهز (Active Running)',
    description: 'كافة قواطع الأمان خضراء وجاهزة لتنفيذ الصفقات المؤكدة.',
    variant: 'emerald',
  };

  if (isDailyLossHit) {
    botState = 'DAILY_LOSS_LOCK';
    isTradingAllowed = false;
    statusBadge = {
      label: `🛑 قاطع الخسارة مفعل (${todayNetPnlPercent.toFixed(1)}%)`,
      description: `تم قفل البوت آلياً لبلوغ سقف الخسارة اليومية (-${settings.dailyMaxLossPercent}%). لحماية رأس المال.`,
      variant: 'rose',
    };
  } else if (isDailyTargetHit) {
    botState = 'DAILY_TARGET_LOCK';
    isTradingAllowed = false;
    statusBadge = {
      label: `🏆 قاطع الأرباح مفعل (+${todayNetPnlPercent.toFixed(1)}%)`,
      description: `تم حجز أرباح اليوم وتأمينها (+${settings.dailyTargetLockPercent}%). إيقاف مؤقت حتى الغد لمنع رد المكاسب.`,
      variant: 'amber',
    };
  } else if (isMarginGuardHit) {
    botState = 'MARGIN_GUARD_LOCK';
    isTradingAllowed = false;
    statusBadge = {
      label: `⚠️ حارس الهامش مفعل (${marginLevelPercent.toFixed(0)}%)`,
      description: `مستوى الهامش أقل من ${settings.minMarginLevelPercent}%. ممنوع فتح صفقات جديدة حتى يتم تحرير السيولة.`,
      variant: 'purple',
    };
  } else if (isFridayGapGuardActive && candidateSymbol && (!candidateSymbol.toUpperCase().endsWith('USDT') || candidateSymbol.toUpperCase().includes('XAU') || candidateSymbol.toUpperCase().includes('XAG') || candidateSymbol.toUpperCase().includes('GOLD') || candidateSymbol.toUpperCase().includes('SILVER'))) {
    botState = 'FRIDAY_GAP_GUARD_BLOCK';
    isTradingAllowed = false;
    statusBadge = {
      label: '🛡️ حماية فجوات عطلة نهاية الأسبوع (Weekend Gap Guard)',
      description: 'تم إغلاق وتجميد صفقات الفوركس والمعادن بعد 20:00 UTC مساء الجمعة لحمايتك من فجوات افتتاح الإثنين.',
      variant: 'purple',
    };
  } else if (isNewsCalendarActive) {
    botState = 'NEWS_CALENDAR_BLOCK';
    isTradingAllowed = false;
    statusBadge = {
      label: '📰 قاطع الأخبار الاقتصادية (High Impact News Lock)',
      description: newsFilterMsg || 'حظر مؤقت للتداول قبل/بعد الأخبار الاقتصادية عالية التأثير (CPI/NFP/FOMC) بـ 15 دقيقة.',
      variant: 'amber',
    };
  } else if (isNyVolatilityActive) {
    botState = 'NY_VOLATILITY_BLOCK';
    isTradingAllowed = false;
    statusBadge = {
      label: '🚫 نافذة ذبذبة نيويورك (15:20-15:45 UTC)',
      description: 'حظر مؤقت للصفقات خلال افتتاح البورصة الأمريكية لتفادي الفجوات والانزلاقات السعرية.',
      variant: 'cyan',
    };
  }

  // Candidate symbol specific checks (Cooldown & Metal Correlation)
  if (isTradingAllowed && candidateSymbol) {
    const cleanSym = candidateSymbol.toUpperCase();

    // 5. Cooldown Check (45 Minutes)
    if (settings.enableCooldownFilter) {
      const cooldownMs = (settings.cooldownMinutes || 45) * 60 * 1000;
      const recentClosed = portfolio.closedTrades
        .filter((t) => t.symbol.toUpperCase() === cleanSym && t.closeTime)
        .sort((a, b) => (b.id > a.id ? 1 : -1))[0];

      if (recentClosed) {
        // Attempt parsing timestamp
        const tradeTimestamp = parseInt(recentClosed.id.split('-')[1] || '0', 10);
        if (tradeTimestamp > 0 && Date.now() - tradeTimestamp < cooldownMs) {
          const remainingMins = Math.ceil((cooldownMs - (Date.now() - tradeTimestamp)) / (60 * 1000));
          botState = 'COOLDOWN';
          isTradingAllowed = false;
          statusBadge = {
            label: `⏳ فترة التهدئة نشطة (${cleanSym})`,
            description: `متبقي ${remainingMins} دقيقة من فترة التهدئة بعد آخر صفقة على هذا الأصل.`,
            variant: 'cyan',
          };
        }
      }
    }

    // 6. Metal Correlation Check (XAU / XAG)
    if (isTradingAllowed && settings.enableAssetCorrelationFilter) {
      const isMetal = cleanSym.includes('XAU') || cleanSym.includes('XAG') || cleanSym.includes('GOLD') || cleanSym.includes('SILVER') || cleanSym.includes('PAXG');
      if (isMetal) {
        const hasOpenMetal = portfolio.openTrades.some((t) => {
          const s = t.symbol.toUpperCase();
          return s.includes('XAU') || s.includes('XAG') || s.includes('GOLD') || s.includes('SILVER') || s.includes('PAXG');
        });
        if (hasOpenMetal) {
          botState = 'CORRELATION_BLOCK';
          isTradingAllowed = false;
          statusBadge = {
            label: '🛡️ فلتر ترابط المعادن مفعل (XAU/XAG)',
            description: 'يوجد صفقة معادن مفتوحة بالفعل. يُمنع فتح صفقة أخرى لتجنب مضاعفة المخاطرة.',
            variant: 'amber',
          };
        }
      }
    }
  }

  return {
    isTradingAllowed,
    botState,
    statusBadge,
    todayNetPnlUsdt,
    todayNetPnlPercent,
    marginLevelPercent,
    usedMarginUsdt: totalOpenAlloc,
    totalEquity,
    openTradesCount: portfolio.openTrades.length,
    isDailyLossHit,
    isDailyTargetHit,
    isMarginGuardHit,
    isNyVolatilityActive,
    isFridayGapGuardActive,
    isNewsCalendarActive,
  };
}

export interface OpenTradeOptions {
  riskPercent?: number;
  atrValue?: number;
  atrMultiplier?: number;
  leverage?: number;
  customAllocAmount?: number;
  orderType?: 'MARKET' | 'LIMIT' | 'STOP';
  isPending?: boolean;
  currentMarketPrice?: number;
  takeProfit3?: number;
  takeProfit4?: number;
  silent?: boolean;
}

export function openVirtualTrade(
  symbol: string,
  type: 'BUY' | 'SELL',
  entryPrice: number,
  stopLoss: number,
  takeProfit1: number,
  takeProfit2: number,
  allocationAmount = 1000,
  sopScore = 5,
  options?: OpenTradeOptions
): PaperPortfolio {
  const portfolio = getPaperPortfolio();
  const settings = getStrategySettings();

  // Run Safety Circuit Breakers
  const circuitCheck = checkCircuitBreakersStatus(portfolio, symbol);
  if (!circuitCheck.isTradingAllowed) {
    if (!options?.silent) {
      alert(`⚠️ تم حظر فتح الصفقة من قواطع الأمان (Circuit Breaker):\n${circuitCheck.statusBadge.label}\n${circuitCheck.statusBadge.description}`);
    }
    return portfolio;
  }

  const leverage = options?.leverage ?? settings.accountLeverage ?? 10;
  const riskPercent = options?.riskPercent ?? settings.riskPerTradePercent ?? 1.0;
  const hardRiskCapUsdt = settings.hardRiskCapUsdt || 1000;
  const totalEquity = circuitCheck.totalEquity;

  // Calculate Institutional Sizing using OrderCalcProfit & Hard Cap
  const sizing = calculateInstitutionalRiskSizing(
    symbol,
    type,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    totalEquity,
    riskPercent,
    hardRiskCapUsdt,
    leverage
  );

  const finalAllocAmount = options?.customAllocAmount ?? Math.max(10, Math.min(portfolio.cashBalance * 0.9, sizing.marginRequiredUsd || allocationAmount));

  if (portfolio.cashBalance < finalAllocAmount) {
    if (!options?.silent) {
      alert(`رصيد المحفظة الافتراضية المتاح غير كافٍ ($${portfolio.cashBalance.toFixed(2)} متاح، المطلوب هامش $${finalAllocAmount.toFixed(2)}).`);
    }
    return portfolio;
  }

  const finalPositionSize = finalAllocAmount * leverage;
  const quantity = sizing.roundedLots;

  const atrMultiplier = options?.atrMultiplier ?? settings.atrTrailingMultiplier ?? 1.5;
  const atrValue = options?.atrValue ?? Math.abs(entryPrice - stopLoss) / 1.5;

  const isPending = options?.isPending || options?.orderType === 'LIMIT';
  const currentMktPrice = options?.currentMarketPrice || entryPrice;

  const newTrade: VirtualTrade = {
    id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    symbol,
    type,
    orderType: isPending ? 'LIMIT' : 'MARKET',
    entryPrice,
    currentPrice: currentMktPrice,
    initialMarketPriceAtCreation: currentMktPrice,
    stopLoss,
    originalStopLoss: stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3: options?.takeProfit3,
    takeProfit4: options?.takeProfit4,
    quantity,
    initialQuantity: quantity,
    allocatedAmount: finalAllocAmount,
    initialAllocatedAmount: finalAllocAmount,
    positionSizeUsdt: finalPositionSize,
    leverage,
    riskPercent,
    riskUsdt: sizing.effectiveRiskUsdt,
    hardRiskCapApplied: sizing.isHardCapApplied,
    status: isPending ? 'PENDING_ENTRY' : 'OPEN',
    entryTime: isPending ? '⏳ بانتظار السعر' : new Date().toLocaleTimeString('ar-EG'),
    createdTime: new Date().toLocaleTimeString('ar-EG'),
    pnlUsdt: 0,
    pnlPercent: 0,
    sopScore,
    highestPriceSeen: currentMktPrice,
    lowestPriceSeen: currentMktPrice,
    isScaleOutDone: false,
    isBreakEvenTriggered: false,
    isTrailingActive: false,
    atrValue,
    atrMultiplier,
    trailingStopLevel: stopLoss,
  };

  const updatedCash = portfolio.cashBalance - finalAllocAmount;
  const updatedOpen = [newTrade, ...portfolio.openTrades];

  const updatedPortfolio: PaperPortfolio = {
    ...portfolio,
    cashBalance: updatedCash,
    openTrades: updatedOpen,
  };

  savePaperPortfolio(updatedPortfolio);
  return updatedPortfolio;
}

/**
 * Automatically executes a trade setup when an eligible signal is identified,
 * without requiring any manual confirmation from the user.
 */
export function autoExecuteSignalIfEligible(
  _analysis: AnalysisResult,
  _triggerSource = 'AUTO'
): { executed: boolean; trade?: VirtualTrade; reason?: string } {
  // Automatic trade entry is completely disabled - user requested manual execution only
  return { executed: false, reason: 'تم إلغاء دخول الصفقات التلقائي - التداول يتم يدوياً فقط' };
}

/**
 * Live Tick-by-Tick Evaluation with Pending Order Triggering, 50% Scale-Out at TP1, Auto Break-Even & ATR Trailing Stop
 */
export function updateTradeWithLiveTick(
  portfolio: PaperPortfolio,
  symbol: string,
  livePrice: number
): PaperPortfolio {
  if (!portfolio.openTrades.some((t) => t.symbol === symbol)) return portfolio;

  const settings = getStrategySettings();
  let changed = false;
  const newOpenTrades: VirtualTrade[] = [];
  const newlyClosedTrades: VirtualTrade[] = [];
  let addedCash = 0;

  for (const trade of portfolio.openTrades) {
    if (trade.symbol !== symbol) {
      newOpenTrades.push(trade);
      continue;
    }

    changed = true;
    const isBuy = trade.type === 'BUY';

    // ----------------------------------------------------
    // 0. HANDLE PENDING ORDERS (Waiting for Entry Price)
    // ----------------------------------------------------
    if (trade.status === 'PENDING_ENTRY') {
      const creationPrice = trade.initialMarketPriceAtCreation || trade.entryPrice;
      let isTriggered = false;

      if (isBuy) {
        // Buy Limit: Price pulled back down to or below entryPrice
        // Buy Stop: Price broke above entryPrice
        if (trade.entryPrice <= creationPrice) {
          if (livePrice <= trade.entryPrice) isTriggered = true;
        } else {
          if (livePrice >= trade.entryPrice) isTriggered = true;
        }
      } else {
        // Sell Limit: Price retraced up to or above entryPrice
        // Sell Stop: Price broke down below entryPrice
        if (trade.entryPrice >= creationPrice) {
          if (livePrice >= trade.entryPrice) isTriggered = true;
        } else {
          if (livePrice <= trade.entryPrice) isTriggered = true;
        }
      }

      if (isTriggered) {
        // Trigger and Fill Order!
        const triggeredTrade: VirtualTrade = {
          ...trade,
          status: 'OPEN',
          entryTime: new Date().toLocaleTimeString('ar-EG'),
          filledTime: new Date().toLocaleTimeString('ar-EG'),
          currentPrice: livePrice,
          highestPriceSeen: livePrice,
          lowestPriceSeen: livePrice,
        };
        newOpenTrades.push(triggeredTrade);

        try {
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('pending-order-filled', {
                detail: {
                  symbol: trade.symbol,
                  type: trade.type,
                  entryPrice: trade.entryPrice,
                  filledPrice: livePrice,
                  id: trade.id,
                },
              })
            );
          }, 0);
        } catch {
          // ignore in non-browser context
        }
      } else {
        // Still pending
        newOpenTrades.push({
          ...trade,
          currentPrice: livePrice,
          pnlUsdt: 0,
          pnlPercent: 0,
        });
      }
      continue;
    }

    // ----------------------------------------------------
    // ACTIVE OPEN TRADE EVALUATION
    // ----------------------------------------------------
    const high = Math.max(trade.highestPriceSeen || livePrice, livePrice);
    const low = Math.min(trade.lowestPriceSeen || livePrice, livePrice);

    // Current PnL on remaining open portion
    const priceDiff = isBuy ? livePrice - trade.entryPrice : trade.entryPrice - livePrice;
    const priceMovePercent = (priceDiff / trade.entryPrice) * 100;
    const effectivePositionSize = trade.positionSizeUsdt || (trade.allocatedAmount * (trade.leverage || 1));
    const pnlUsdt = (priceMovePercent / 100) * effectivePositionSize;
    const pnlPercent = trade.allocatedAmount > 0 ? (pnlUsdt / trade.allocatedAmount) * 100 : priceMovePercent;

    let currentStopLoss = trade.stopLoss;
    let isBreakEvenTriggered = trade.isBreakEvenTriggered || false;
    let breakEvenPrice = trade.breakEvenPrice;
    let breakEvenTime = trade.breakEvenTime;
    let isTrailingActive = trade.isTrailingActive || false;
    let trailingStopLevel = trade.trailingStopLevel || trade.stopLoss;
    let isScaleOutDone = trade.isScaleOutDone || false;
    let scaleOutPrice = trade.scaleOutPrice;
    let scaleOutPnlUsdt = trade.scaleOutPnlUsdt;
    let scaleOutTime = trade.scaleOutTime;
    let currentQuantity = trade.quantity;
    let currentAllocAmount = trade.allocatedAmount;
    let currentPositionSize = effectivePositionSize;

    // ----------------------------------------------------
    // 1. PARTIAL SCALE-OUT AT TP1 (50% Closed & Cash Credited)
    // ----------------------------------------------------
    const isTp1Reached = isBuy ? livePrice >= trade.takeProfit1 : livePrice <= trade.takeProfit1;

    if (settings.enablePartialScaleOut && !isScaleOutDone && isTp1Reached) {
      isScaleOutDone = true;
      scaleOutPrice = trade.takeProfit1;
      scaleOutTime = new Date().toLocaleTimeString('ar-EG');

      // Calculate 50% scale-out profit and return 50% margin
      const scaleOutRatio = (settings.partialScaleOutPercent || 50) / 100;
      const closedMarginPortion = trade.allocatedAmount * scaleOutRatio;
      const closedNotionalPortion = effectivePositionSize * scaleOutRatio;
      const tp1Diff = isBuy ? trade.takeProfit1 - trade.entryPrice : trade.entryPrice - trade.takeProfit1;
      const tp1MovePercent = (tp1Diff / trade.entryPrice) * 100;
      const realizedScaleOutPnl = (tp1MovePercent / 100) * closedNotionalPortion;

      scaleOutPnlUsdt = Number(realizedScaleOutPnl.toFixed(2));
      // Credit 50% margin + profit to Cash immediately
      addedCash += closedMarginPortion + realizedScaleOutPnl;

      // Reduce open trade position
      currentAllocAmount = trade.allocatedAmount * (1 - scaleOutRatio);
      currentPositionSize = effectivePositionSize * (1 - scaleOutRatio);
      currentQuantity = trade.quantity * (1 - scaleOutRatio);

      // Auto trigger Break-Even on remaining runner
      const buffer = (settings.breakEvenFeeBufferPercent || 0.05) / 100;
      const beLevel = isBuy ? trade.entryPrice * (1 + buffer) : trade.entryPrice * (1 - buffer);
      currentStopLoss = Number(beLevel.toFixed(trade.entryPrice < 1 ? 6 : 2));
      isBreakEvenTriggered = true;
      breakEvenPrice = currentStopLoss;
      breakEvenTime = scaleOutTime;
    }

    // ----------------------------------------------------
    // 2. AUTO BREAK-EVEN (1:1 R:R Threshold)
    // ----------------------------------------------------
    const riskDistance = Math.abs(trade.entryPrice - (trade.originalStopLoss || trade.stopLoss));
    const favorableDistance = isBuy ? high - trade.entryPrice : trade.entryPrice - low;
    const breakEvenThresholdDistance = riskDistance * (settings.breakEvenRatio || 1.0);

    if (settings.enableBreakEven && !isBreakEvenTriggered && favorableDistance >= breakEvenThresholdDistance) {
      const buffer = (settings.breakEvenFeeBufferPercent || 0.05) / 100;
      const beLevel = isBuy ? trade.entryPrice * (1 + buffer) : trade.entryPrice * (1 - buffer);
      if ((isBuy && beLevel > currentStopLoss) || (!isBuy && beLevel < currentStopLoss)) {
        currentStopLoss = Number(beLevel.toFixed(trade.entryPrice < 1 ? 6 : 2));
        isBreakEvenTriggered = true;
        breakEvenPrice = currentStopLoss;
        breakEvenTime = new Date().toLocaleTimeString('ar-EG');
      }
    }

    // ----------------------------------------------------
    // 3. SMART ATR TRAILING STOP (1.5x ATR)
    // ----------------------------------------------------
    if (settings.enableAtrTrailingStop && trade.atrValue && trade.atrValue > 0) {
      const mult = trade.atrMultiplier || settings.atrTrailingMultiplier || 1.5;
      const trailBuffer = trade.atrValue * mult;

      if (isBuy) {
        const candidateTrail = high - trailBuffer;
        if (candidateTrail > currentStopLoss) {
          currentStopLoss = Number(candidateTrail.toFixed(trade.entryPrice < 1 ? 6 : 2));
          isTrailingActive = true;
          trailingStopLevel = currentStopLoss;
        }
      } else {
        const candidateTrail = low + trailBuffer;
        if (candidateTrail < currentStopLoss) {
          currentStopLoss = Number(candidateTrail.toFixed(trade.entryPrice < 1 ? 6 : 2));
          isTrailingActive = true;
          trailingStopLevel = currentStopLoss;
        }
      }
    }

    // ----------------------------------------------------
    // CHECK EXIT / HIT CONDITIONS
    // ----------------------------------------------------
    let hitStatus: VirtualTrade['status'] | null = null;
    let exitPrice = livePrice;

    // A. Friday Gap Guard: Auto close forex/metals at Friday 20:00 UTC
    const tickNow = new Date();
    const tickDay = tickNow.getUTCDay();
    const tickHour = tickNow.getUTCHours();
    const isTradeForexOrMetal = !trade.symbol.toUpperCase().endsWith('USDT') || trade.symbol.toUpperCase().includes('XAU') || trade.symbol.toUpperCase().includes('XAG') || trade.symbol.toUpperCase().includes('GOLD') || trade.symbol.toUpperCase().includes('SILVER');

    if (settings.enableFridayWeekendGapGuard && isTradeForexOrMetal && ((tickDay === 5 && tickHour >= (settings.fridayCloseHourUtc || 20)) || tickDay === 6 || (tickDay === 0 && tickHour < 22))) {
      hitStatus = 'CLOSED_FRIDAY_GAP_GUARD';
      exitPrice = livePrice;
    } else if (isBuy) {
      if (livePrice >= trade.takeProfit2) {
        hitStatus = 'CLOSED_TP2';
        exitPrice = trade.takeProfit2;
      } else if (!settings.enablePartialScaleOut && livePrice >= trade.takeProfit1) {
        hitStatus = 'CLOSED_TP1';
        exitPrice = trade.takeProfit1;
      } else if (livePrice <= currentStopLoss) {
        if (isScaleOutDone) {
          hitStatus = 'CLOSED_SCALE_OUT_RUNNER';
        } else if (isTrailingActive && currentStopLoss > trade.originalStopLoss) {
          hitStatus = 'CLOSED_TRAILING';
        } else if (isBreakEvenTriggered && Math.abs(currentStopLoss - trade.entryPrice) / trade.entryPrice < 0.005) {
          hitStatus = 'CLOSED_BREAKEVEN';
        } else {
          hitStatus = 'CLOSED_SL';
        }
        exitPrice = currentStopLoss;
      }
    } else {
      if (livePrice <= trade.takeProfit2) {
        hitStatus = 'CLOSED_TP2';
        exitPrice = trade.takeProfit2;
      } else if (!settings.enablePartialScaleOut && livePrice <= trade.takeProfit1) {
        hitStatus = 'CLOSED_TP1';
        exitPrice = trade.takeProfit1;
      } else if (livePrice >= currentStopLoss) {
        if (isScaleOutDone) {
          hitStatus = 'CLOSED_SCALE_OUT_RUNNER';
        } else if (isTrailingActive && currentStopLoss < trade.originalStopLoss) {
          hitStatus = 'CLOSED_TRAILING';
        } else if (isBreakEvenTriggered && Math.abs(currentStopLoss - trade.entryPrice) / trade.entryPrice < 0.005) {
          hitStatus = 'CLOSED_BREAKEVEN';
        } else {
          hitStatus = 'CLOSED_SL';
        }
        exitPrice = currentStopLoss;
      }
    }

    if (hitStatus) {
      const finalDiff = isBuy ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice;
      const finalMovePercent = (finalDiff / trade.entryPrice) * 100;
      const finalPnlUsdt = (finalMovePercent / 100) * currentPositionSize;
      const finalPnlPercent = currentAllocAmount > 0 ? (finalPnlUsdt / currentAllocAmount) * 100 : finalMovePercent;

      const totalTradePnlUsdt = finalPnlUsdt + (scaleOutPnlUsdt || 0);

      const closedTrade: VirtualTrade = {
        ...trade,
        quantity: currentQuantity,
        allocatedAmount: currentAllocAmount,
        positionSizeUsdt: currentPositionSize,
        stopLoss: currentStopLoss,
        currentPrice: exitPrice,
        status: hitStatus,
        closeTime: new Date().toLocaleTimeString('ar-EG'),
        exitPrice,
        pnlPercent: finalPnlPercent,
        pnlUsdt: totalTradePnlUsdt,
        highestPriceSeen: high,
        lowestPriceSeen: low,
        isScaleOutDone,
        scaleOutPrice,
        scaleOutPnlUsdt,
        scaleOutTime,
        isBreakEvenTriggered,
        breakEvenPrice,
        breakEvenTime,
        isTrailingActive,
        trailingStopLevel,
      };

      newlyClosedTrades.push(closedTrade);
      addedCash += currentAllocAmount + finalPnlUsdt;
    } else {
      newOpenTrades.push({
        ...trade,
        quantity: currentQuantity,
        allocatedAmount: currentAllocAmount,
        positionSizeUsdt: currentPositionSize,
        stopLoss: currentStopLoss,
        currentPrice: livePrice,
        pnlPercent,
        pnlUsdt,
        highestPriceSeen: high,
        lowestPriceSeen: low,
        isScaleOutDone,
        scaleOutPrice,
        scaleOutPnlUsdt,
        scaleOutTime,
        isBreakEvenTriggered,
        breakEvenPrice,
        breakEvenTime,
        isTrailingActive,
        trailingStopLevel,
      });
    }
  }

  if (!changed) return portfolio;

  const newCash = portfolio.cashBalance + addedCash;
  const newClosed = [...newlyClosedTrades, ...portfolio.closedTrades];

  const openEquity = newOpenTrades.reduce((acc, t) => acc + t.allocatedAmount + t.pnlUsdt, 0);
  const currentTotalEquity = newCash + openEquity;

  const newEquityHistory = [
    ...portfolio.equityHistory.slice(-29),
    { time: new Date().toLocaleTimeString('ar-EG'), equity: currentTotalEquity },
  ];

  const updated: PaperPortfolio = {
    ...portfolio,
    cashBalance: newCash,
    openTrades: newOpenTrades,
    closedTrades: newClosed,
    equityHistory: newEquityHistory,
  };

  savePaperPortfolio(updated);
  return updated;
}

export function closeTradeManually(portfolio: PaperPortfolio, tradeId: string): PaperPortfolio {
  const trade = portfolio.openTrades.find((t) => t.id === tradeId);
  if (!trade) return portfolio;

  const isBuy = trade.type === 'BUY';
  const priceDiff = isBuy ? trade.currentPrice - trade.entryPrice : trade.entryPrice - trade.currentPrice;
  const priceMovePercent = (priceDiff / trade.entryPrice) * 100;
  const effectivePositionSize = trade.positionSizeUsdt || (trade.allocatedAmount * (trade.leverage || 1));
  const finalPnlUsdt = (priceMovePercent / 100) * effectivePositionSize;
  const finalPnlPercent = trade.allocatedAmount > 0 ? (finalPnlUsdt / trade.allocatedAmount) * 100 : priceMovePercent;

  const totalTradePnlUsdt = finalPnlUsdt + (trade.scaleOutPnlUsdt || 0);

  const closedTrade: VirtualTrade = {
    ...trade,
    status: 'CLOSED_MANUAL',
    closeTime: new Date().toLocaleTimeString('ar-EG'),
    exitPrice: trade.currentPrice,
    pnlPercent: finalPnlPercent,
    pnlUsdt: totalTradePnlUsdt,
  };

  const newOpen = portfolio.openTrades.filter((t) => t.id !== tradeId);
  const newClosed = [closedTrade, ...portfolio.closedTrades];
  const newCash = portfolio.cashBalance + trade.allocatedAmount + finalPnlUsdt;

  const openEquity = newOpen.reduce((acc, t) => acc + t.allocatedAmount + t.pnlUsdt, 0);
  const currentTotalEquity = newCash + openEquity;

  const updated: PaperPortfolio = {
    ...portfolio,
    cashBalance: newCash,
    openTrades: newOpen,
    closedTrades: newClosed,
    equityHistory: [
      ...portfolio.equityHistory.slice(-29),
      { time: new Date().toLocaleTimeString('ar-EG'), equity: currentTotalEquity },
    ],
  };

  savePaperPortfolio(updated);
  return updated;
}

export function cancelPendingOrder(portfolio: PaperPortfolio, tradeId: string): PaperPortfolio {
  const trade = portfolio.openTrades.find((t) => t.id === tradeId);
  if (!trade) return portfolio;

  // Refund reserved margin
  const newCash = portfolio.cashBalance + trade.allocatedAmount;
  const newOpen = portfolio.openTrades.filter((t) => t.id !== tradeId);
  
  const cancelledTrade: VirtualTrade = {
    ...trade,
    status: 'CLOSED_CANCELLED',
    closeTime: new Date().toLocaleTimeString('ar-EG'),
    pnlPercent: 0,
    pnlUsdt: 0,
    exitPrice: trade.currentPrice,
  };

  const newClosed = [cancelledTrade, ...portfolio.closedTrades];

  const updated: PaperPortfolio = {
    ...portfolio,
    cashBalance: newCash,
    openTrades: newOpen,
    closedTrades: newClosed,
  };

  savePaperPortfolio(updated);
  return updated;
}

export function executePendingNowAtMarket(
  portfolio: PaperPortfolio,
  tradeId: string,
  currentLivePrice?: number
): PaperPortfolio {
  const tradeIndex = portfolio.openTrades.findIndex((t) => t.id === tradeId);
  if (tradeIndex === -1) return portfolio;

  const trade = portfolio.openTrades[tradeIndex];
  const fillPrice = currentLivePrice && currentLivePrice > 0 ? currentLivePrice : trade.currentPrice;

  const updatedTrade: VirtualTrade = {
    ...trade,
    status: 'OPEN',
    entryPrice: fillPrice,
    currentPrice: fillPrice,
    entryTime: new Date().toLocaleTimeString('ar-EG'),
    filledTime: new Date().toLocaleTimeString('ar-EG'),
    highestPriceSeen: fillPrice,
    lowestPriceSeen: fillPrice,
  };

  const updatedOpen = [...portfolio.openTrades];
  updatedOpen[tradeIndex] = updatedTrade;

  const updated: PaperPortfolio = {
    ...portfolio,
    openTrades: updatedOpen,
  };

  savePaperPortfolio(updated);
  return updated;
}

export function resetPaperPortfolio(initialBalance = 10000): PaperPortfolio {
  const reset: PaperPortfolio = {
    initialBalance,
    cashBalance: initialBalance,
    dailyStartEquity: initialBalance,
    dailyDate: getTodayDateString(),
    openTrades: [],
    closedTrades: [],
    equityHistory: [{ time: new Date().toLocaleTimeString('ar-EG'), equity: initialBalance }],
  };
  savePaperPortfolio(reset);
  return reset;
}

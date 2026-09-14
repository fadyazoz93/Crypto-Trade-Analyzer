/**
 * Strategy & App Settings Storage (localStorage)
 */

export interface StrategySettings {
  emaLength: number; // default: 200 (1H EMA 200)
  adxThreshold: number; // default: 22 (1H ADX 14 threshold)
  rsiLowerThreshold: number; // default: 40 (5M RSI Oversold)
  rsiUpperThreshold: number; // default: 60 (5M RSI Overbought)
  flexibleMode: boolean; // default: false (allow 4/5 SOP signals)
  enableBtcGuard: boolean; // default: true (warn or reject altcoin buys on BTC dump)

  // 0. Daily Macro Trend Bias (1D 50 EMA Filter)
  enableDailyMacroBias: boolean; // default: true (Prev Daily Close > 50 EMA: BUY only, < 50 EMA: SELL only)
  dailyEmaPeriod: number; // default: 50 (Daily 50 EMA)

  // 1. Fibonacci & Swing Points Settings (5SOP V2.00 EA)
  swingLeftBars: number; // default: 5 (Left Bars for 1H Swing High/Low)
  swingRightBars: number; // default: 2 (Right Bars for 1H Swing High/Low)
  atrMultiplier: number; // default: 1.5 (ATR Multiplier for Swings validity)
  minAdxH1: number; // default: 22.0
  minRRR: number; // default: 2.0 (1:2.0 Min Risk Reward Ratio to TP2)
  magicNumber: number; // default: 550057
  
  // 2. Dynamic Risk Management & Institutional Hard Cap
  riskPerTradePercent: number; // default: 1.0%
  hardRiskCapUsdt: number; // default: 1000 USD (Institutional Hard Cap)
  defaultAccountBalance: number; // default: 10000 USDT
  accountLeverage: number; // default: 10x

  // 3. Multi-Scale Trade Management (Partial Close & Auto Break-Even & Trailing)
  enablePartialScaleOut: boolean; // default: true (Close 50% at TP1 / Swing Target)
  partialScaleOutPercent: number; // default: 50%
  enableBreakEven: boolean; // default: true (Move SL to Entry + Offset at 1:1 R:R or TP1)
  breakEvenRatio: number; // default: 1.0 (1:1 R:R)
  breakEvenFeeBufferPercent: number; // default: 0.05%
  beOffsetPoints: number; // default: 30 points (Slippage / Fee offset in points)

  // 4. Smart Trailing Stop (Points / ATR based)
  enableAtrTrailingStop: boolean; // default: true
  atrTrailingMultiplier: number; // default: 1.5 (1.5x ATR)
  trailingStartPoints: number; // default: 150 points (Start trailing after 150 pts profit)
  trailingDistancePoints: number; // default: 100 points
  trailingStepPoints: number; // default: 20 points

  // 4. Safety Circuit Breakers & Account Protections
  enableDailyMaxLossCircuitBreaker: boolean; // default: true
  dailyMaxLossPercent: number; // default: 8.0 (-8% daily stop)
  enableDailyTargetLock: boolean; // default: true
  dailyTargetLockPercent: number; // default: 15.0 (+15% daily target lock)
  enableMarginGuard: boolean; // default: true
  minMarginLevelPercent: number; // default: 500 (500% min margin level)
  enableAssetCorrelationFilter: boolean; // default: false (Crypto pairs trade 24/7 without metal correlations)
  enableCooldownFilter: boolean; // default: true
  cooldownMinutes: number; // default: 45 (45 min cooldown after closing a trade on same asset)
  enableNyVolatilityFilter: boolean; // default: false (Crypto trades 24/7)

  // 5. Max Spread & Slippage / Deviation Filter
  enableSpreadFilter: boolean; // default: true
  maxSpreadPercent: number; // default: 0.15%
  maxDeviationPoints: number; // default: 20 points (Max Slippage / Deviation in MT5/Order Execution)
  enableDeviationProtection: boolean; // default: true

  // 6. 24/7 Continuous Crypto Trading Engine (No Session Blocks)
  enableTradingTimeFilter: boolean; // default: false (Crypto trades continuously 24/7/365)
  tradingStartHour: number; // default: 0 (00:00 UTC)
  tradingEndHour: number; // default: 24 (24:00 UTC)
  allowedSessions: string[]; // default: ['LONDON', 'NEW_YORK', 'OVERLAP', 'ASIA', 'OFF_HOURS']
  timeZoneMode: 'UTC' | 'LOCAL'; // default: 'UTC'
  enableFridayWeekendGapGuard: boolean; // default: false (Crypto does not close on weekends)
  fridayCloseHourUtc: number; // default: 20 (20:00 UTC)

  // 7. Native Economic Calendar Filter (High Impact News Protection)
  enableEconomicCalendarFilter: boolean; // default: true (15m before/after High Impact News)
  calendarNewsBufferMinutes: number; // default: 15 minutes
  blockHighImpactNews: boolean; // default: true (CPI, NFP, Fed Rate, FOMC, ECB)

  // 8. Wyckoff Matrix Engine (V49.00 Enterprise Core)
  enableWyckoffEngine: boolean; // default: true
  wyckoffVolMAPeriod: number; // default: 20
  springVolMultiplier: number; // default: 1.30 (1.30x absorption volume)
  lpsVolMultiplier: number; // default: 0.85 (0.85x test volume)
  minWickRatio: number; // default: 0.35 (35% rejection wick)

  // 9. Institutional Confirmation Layers (6 SOP V49.00 Enterprise Clean Filters)
  enableVolumeFilter: boolean; // default: true (Volume > 1.15x SMA14)
  volumeMultiplierThreshold: number; // default: 1.15x
  enablePriceActionRejection: boolean; // default: true (>= 20% rejection wick)
  wickRejectionThresholdPercent: number; // default: 20%
  enableMicroBOS: boolean; // default: true (Break of Structure last 2 candles)
  enableEma50Guard: boolean; // default: true (1H Price > 50 EMA alignment)
  enableBandwidthFilter: boolean; // default: true (Bollinger Bandwidth Expansion)
  minBandwidthPercent: number; // default: 0.8%
  requireClosedCandleConfirm: boolean; // default: true (prevents mid-candle signal flickering/reversal)
  enableAntiStopHuntBuffer: boolean; // default: true (places SL beyond liquidity sweep zones)
  antiStopHuntMultiplier: number; // default: 1.0 (ATR multiplier for SL safety margin)
  maxEntryProximityPercent: number; // default: 0.8% (max allowed gap between live price and limit entry to prevent confusing premature signals)
  includeBinancePrice: boolean; // default: true (display parallel Binance ticker price in Telegram alerts)

  // 10. V49.00 Dual-Engine & Gann Square of 9 Parameters
  sopScoreNeeded: number; // default: 5 (5 of 6 SOP gates required)
  minEmaSlopePoints: number; // default: 2.0 points
  limitExpirationHours: number; // default: 4 hours
  angleStepTolerance: number; // default: 0.15 (15% dynamic tolerance)
  gannSwingStrength: number; // default: 2 (2-bar swing pivot)
  gannMaxLookbackBars: number; // default: 120 bars
  generalCooldownMin: number; // default: 20 min
  orderThrottleSec: number; // default: 10 sec
  tp1Ratio: number; // default: 0.5 R
  tp2Ratio: number; // default: 1.0 R
  tp3Ratio: number; // default: 1.5 R
  tp4Ratio: number; // default: 2.0 R (Hard Cap)
  maxTotalLots: number; // default: 5.0 lots
  maxLotPerTrade: number; // default: 2.0 lots

  // 11. Autonomous Auto-Trade Execution Engine
  enableAutoTradeExecution: boolean; // default: false (trades are entered manually by default)

  // 12. Trade Signal Notification Cooldown (Anti-Spam Filter)
  signalCooldownMinutes: number; // default: 30 minutes cooldown between duplicate alerts for same symbol
}

const SETTINGS_KEY = 'crypto_analyzer_strategy_settings_v41';

export const DEFAULT_SETTINGS: StrategySettings = {
  emaLength: 200,
  adxThreshold: 22,
  rsiLowerThreshold: 40,
  rsiUpperThreshold: 60,
  flexibleMode: true,
  enableBtcGuard: true,

  // 0. Daily Macro Trend Bias (1D 50 EMA Filter)
  enableDailyMacroBias: true,
  dailyEmaPeriod: 50,

  // 1. Fibonacci & Swing Points Settings (SOP Gann V49.00)
  swingLeftBars: 5,
  swingRightBars: 2,
  atrMultiplier: 1.5,
  minAdxH1: 22.0,
  minRRR: 2.0,
  magicNumber: 1001, // 1001 Intraday, 2002 Scalp
  
  // 2. Dynamic Risk & Hard Cap (V49.00 Risk Engine)
  riskPerTradePercent: 1.0, // 1.0% per trade (V49.00)
  hardRiskCapUsdt: 1000, // $1000 Hard Cap
  defaultAccountBalance: 10000,
  accountLeverage: 10,

  // 3. Multi-Scale Trade Management (Quad Scale-Out 25% each & Auto Break-Even & Trailing)
  enablePartialScaleOut: true,
  partialScaleOutPercent: 25,
  enableBreakEven: true,
  breakEvenRatio: 0.5, // Move to BE at TP1 (0.5R)
  breakEvenFeeBufferPercent: 0.05,
  beOffsetPoints: 5, // 5 points buffer on BE

  // 4. Smart Trailing Stop
  enableAtrTrailingStop: true,
  atrTrailingMultiplier: 1.0, // 1.0 ATR trailing after TP3
  trailingStartPoints: 150,
  trailingDistancePoints: 100,
  trailingStepPoints: 10,

  // 5. Safety Circuit Breakers & Account Protections (V49.00 Prop-Firm)
  enableDailyMaxLossCircuitBreaker: true,
  dailyMaxLossPercent: 5.0, // -5.0% Daily Max Loss Limit (V49.00 Prop Firm Cap)
  enableDailyTargetLock: true,
  dailyTargetLockPercent: 10.0, // +10.0% Daily Profit Target (V49.00)
  enableMarginGuard: true,
  minMarginLevelPercent: 300, // 300% Min Margin Level
  enableAssetCorrelationFilter: false,
  enableCooldownFilter: true,
  cooldownMinutes: 45, // 45 min freeze after loss
  generalCooldownMin: 20, // 20 min general cooldown
  orderThrottleSec: 10, // 10 sec execution throttle
  enableNyVolatilityFilter: false,

  // 6. Max Spread & Slippage / Deviation Filter
  enableSpreadFilter: true,
  maxSpreadPercent: 0.15,
  maxDeviationPoints: 20, // 20 points execution tolerance
  enableDeviationProtection: true,

  // 7. 24/7 Continuous Crypto Trading Engine (No Session Blocks)
  enableTradingTimeFilter: false,
  tradingStartHour: 0,
  tradingEndHour: 24,
  allowedSessions: ['LONDON', 'NEW_YORK', 'OVERLAP', 'ASIA', 'OFF_HOURS'],
  timeZoneMode: 'UTC',
  enableFridayWeekendGapGuard: false,
  fridayCloseHourUtc: 20,

  // 8. Native Economic Calendar Filter (High Impact News Protection)
  enableEconomicCalendarFilter: true,
  calendarNewsBufferMinutes: 30, // 30m before / 15m after
  blockHighImpactNews: true,

  // 9. Wyckoff Matrix Engine (V49.00)
  enableWyckoffEngine: true,
  wyckoffVolMAPeriod: 20,
  springVolMultiplier: 1.30,
  lpsVolMultiplier: 0.85,
  minWickRatio: 0.35,

  // 10. Institutional Confirmation Layers (6 SOP Clean Filters)
  enableVolumeFilter: true,
  volumeMultiplierThreshold: 1.15, // 1.15x SMA14
  enablePriceActionRejection: true,
  wickRejectionThresholdPercent: 20, // 20% wick
  enableMicroBOS: true,
  enableEma50Guard: true,
  enableBandwidthFilter: true,
  minBandwidthPercent: 0.8,
  requireClosedCandleConfirm: true, // Closed-candle confirmation prevents false mid-candle reversal
  enableAntiStopHuntBuffer: true, // Places SL safely beyond liquidity hunt wicks
  antiStopHuntMultiplier: 1.0,
  maxEntryProximityPercent: 0.8, // 0.8% max gap to avoid confusing premature limit alerts
  includeBinancePrice: true, // Parallel Binance reference price in alerts

  // 11. V41.00 Dual-Engine & Gann Square of 9 Parameters
  sopScoreNeeded: 4, // 4 of 5 SOP gates required (V41.00 Enterprise Protection Shield)
  minEmaSlopePoints: 2.0,
  limitExpirationHours: 4,
  angleStepTolerance: 0.15, // 15% tolerance
  gannSwingStrength: 2,
  gannMaxLookbackBars: 120,
  tp1Ratio: 0.5, // 0.5 R (Quad Exit Scale-Out 25% + BE)
  tp2Ratio: 1.0, // 1.0 R (Quad Exit Scale-Out 25% + Lock +0.5R)
  tp3Ratio: 1.5, // 1.5 R (Quad Exit Scale-Out 25% + Trailing 1.0 ATR)
  tp4Ratio: 2.0, // 2.0 R (Quad Exit Scale-Out 25% Final Hard Cap 1:2 R:R)
  maxTotalLots: 5.0,
  maxLotPerTrade: 2.0,

  // 12. Autonomous Auto-Trade Execution Engine
  enableAutoTradeExecution: false, // default: false (disabled by user request)

  // 13. Trade Signal Notification Cooldown (Anti-Spam Filter)
  signalCooldownMinutes: 30, // default: 30 minutes
};

let serverSettings: StrategySettings = {
  ...DEFAULT_SETTINGS,
  flexibleMode: true,
  sopScoreNeeded: 4,
};

export function setServerStrategySettings(updates: Partial<StrategySettings>): void {
  serverSettings = { ...serverSettings, ...updates };
}

export function getStrategySettings(): StrategySettings {
  if (typeof window === 'undefined') return serverSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      // Save default settings if not initialized yet
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    const settings: StrategySettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      flexibleMode: parsed.flexibleMode !== undefined ? Boolean(parsed.flexibleMode) : true,
      enableDailyMacroBias: parsed.enableDailyMacroBias !== undefined ? Boolean(parsed.enableDailyMacroBias) : true,
      dailyEmaPeriod: parsed.dailyEmaPeriod !== undefined && Number(parsed.dailyEmaPeriod) > 0 ? Number(parsed.dailyEmaPeriod) : 50,
      enableAutoTradeExecution: false, // Permanently disabled by user request
      enableDailyMaxLossCircuitBreaker: parsed.enableDailyMaxLossCircuitBreaker !== undefined ? Boolean(parsed.enableDailyMaxLossCircuitBreaker) : true,
      dailyMaxLossPercent: parsed.dailyMaxLossPercent !== undefined && Number(parsed.dailyMaxLossPercent) > 0 ? Number(parsed.dailyMaxLossPercent) : 5.0,
      enableDailyTargetLock: parsed.enableDailyTargetLock !== undefined ? Boolean(parsed.enableDailyTargetLock) : true,
      dailyTargetLockPercent: parsed.dailyTargetLockPercent !== undefined && Number(parsed.dailyTargetLockPercent) > 0 ? Number(parsed.dailyTargetLockPercent) : 10.0,
      requireClosedCandleConfirm: parsed.requireClosedCandleConfirm !== undefined ? Boolean(parsed.requireClosedCandleConfirm) : true,
      enableAntiStopHuntBuffer: parsed.enableAntiStopHuntBuffer !== undefined ? Boolean(parsed.enableAntiStopHuntBuffer) : true,
      antiStopHuntMultiplier: parsed.antiStopHuntMultiplier !== undefined && Number(parsed.antiStopHuntMultiplier) > 0 ? Number(parsed.antiStopHuntMultiplier) : 1.0,
      maxEntryProximityPercent: parsed.maxEntryProximityPercent !== undefined && Number(parsed.maxEntryProximityPercent) > 0 ? Number(parsed.maxEntryProximityPercent) : 0.8,
      includeBinancePrice: parsed.includeBinancePrice !== undefined ? Boolean(parsed.includeBinancePrice) : true,
      sopScoreNeeded: parsed.sopScoreNeeded === 5 ? 5 : 4,
      tp1Ratio: 0.5,
      tp2Ratio: 1.0,
      tp3Ratio: 1.5,
      tp4Ratio: 2.0,
      signalCooldownMinutes: parsed.signalCooldownMinutes !== undefined && Number(parsed.signalCooldownMinutes) > 0 ? Number(parsed.signalCooldownMinutes) : 45,
    };
    return settings;
  } catch (err) {
    console.error('Error loading strategy settings:', err);
    return DEFAULT_SETTINGS;
  }
}


export function saveStrategySettings(settings: StrategySettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('strategy-settings-updated', { detail: settings }));
    }, 0);
  } catch (err) {
    console.error('Error saving strategy settings:', err);
  }
}

export function toggleAutoTradeExecution(): boolean {
  const current = getStrategySettings();
  const updated: StrategySettings = {
    ...current,
    enableAutoTradeExecution: !current.enableAutoTradeExecution,
  };
  saveStrategySettings(updated);
  return updated.enableAutoTradeExecution;
}

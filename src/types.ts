export type TradingMode = 'INTRADAY' | 'SCALP';

export interface SwingPoint {
  price: number;
  time: number;
  barIndex?: number;
  isValid: boolean;
}

export interface GannLevel {
  angle: number; // 45, 90, 135, 180, 225, 270, 315, 360, 540, 720
  angleName: string;
  price: number;
  isSupport: boolean;
  isResistance: boolean;
  distancePercent: number;
}

export interface MajorPivot {
  type: 'HIGH' | 'LOW';
  price: number;
  time: number;
  formattedTime?: string;
  barIndex4h: number;
  barIndex5m?: number;
  isConfirmed: boolean;
  atr4h?: number;
}

export interface AnchorPointsResult {
  startAnchor: MajorPivot;
  endAnchor: MajorPivot;
  waveDirection: 'BULLISH' | 'BEARISH';
  waveRange: number;
  atrMultiplier: number;
  atr4h: number;
  atrFilterPassed: boolean;
  barsElapsed5m: number;
  exactZeroCoordinate: {
    price: number;
    timestamp: number;
    barIndex5m: number;
  };
}

export interface GannGeometryData {
  refPivotPrice: number;
  refPivotType: 'SWING_HIGH' | 'SWING_LOW';
  refPivotTime: number;
  refPivotBarIndex: number;
  levels: GannLevel[];
  nearestGannSupport: GannLevel;
  nearestGannResistance: GannLevel;
  isLevelInteraction: boolean;
  activeInteractionLevel?: GannLevel;
  levelTolerancePercent: number;
  timeCycleTargetBars: number;
  barsElapsed: number;
  activeTimeAngle: string;
  isTimeHarmonicAligned: boolean;
  timeHarmonicCycleName: string;
  anchorSync?: AnchorPointsResult;
}

export interface GannSlopeData {
  dynamicSlope: number; // ATR(4H) / 48.0
  expectedDynamic1x1: number;
  currentDeviationPercent: number;
  isHolding1x1: boolean;
  atr4h: number;
  barsElapsed: number;
  anchorPrice: number;
  anchorTime: number;
  anchorType: 'LOW' | 'HIGH';
  rule49Remainder: number;
  sqrtRemainder: number;
  isRule49Aligned: boolean;
  isSqrtAligned: boolean;
}

export interface ReversalBarData {
  isReversalBar: boolean;
  isVolumeConfirmed: boolean;
  lastClose: number;
  prevHigh: number;
  prevLow: number;
  volume: number;
  volumeSMA20: number;
  volumeRatio: number;
  description: string;
}

export interface QuadScaleOutSetup {
  tp1_0_5r: number;
  tp2_1_0r: number;
  tp3_1_5r: number;
  tp4_2_0r: number;
  riskDistance: number;
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  tp4Percent: number;
  beOffsetPoints?: number;
  trailingMultiplier?: number;
}

export type WyckoffPattern = 'WYCKOFF_NONE' | 'WYCKOFF_SPRING' | 'WYCKOFF_LPS' | 'WYCKOFF_UTAD' | 'WYCKOFF_LPSY';

export interface WyckoffSignalData {
  signal: WyckoffPattern;
  patternName: string;
  extremePrice: number;
  isConfirmed: boolean;
  volumeRatio: number;
  wickRatio: number;
  gannLevel?: number;
  description: string;
}

export interface ConfluenceItem {
  category: 'MACRO_TREND' | 'PRICE_LEVEL' | 'GANN_SLOPE' | 'TIME_CYCLE' | 'MOMENTUM' | 'WYCKOFF' | 'VOLUME' | 'RISK_REWARD';
  name: string;
  nameAr: string;
  gateNumber?: number; // 1, 2, 3, 4, 5, 6
  score: number;
  maxScore: number;
  passed: boolean;
  timeframe: '4H' | '1H' | '15M' | '5M' | '1M' | '4H / 5M' | '1H / 1M' | '1D / 4H' | '1D / 1H' | '1D';
  description: string;
  details: string;
}

export interface ConfluenceScoringMatrix {
  totalScore: number; // 0 - 100
  threshold: number; // 80 (4 of 5 gates)
  sopScore: number; // 0 - 5 (Count of passed gates out of 5)
  sopScoreNeeded: number; // 4 (SOP requirement: 4 of 5)
  engineType: 'INTRADAY_1001' | 'SCALPING_2002' | 'Gann Intraday (1001)' | 'Gann Scalp (2002)';
  version: string; // 'V41.00 Enterprise Protection Shield'
  minRiskReward?: number; // 2.0
  riskRewardPassed?: boolean;
  grade?: string;
  passed?: boolean;
  isExecutionTrigger: boolean;
  direction: 'BUY' | 'SELL' | 'NO_TRADE';
  macroTrend: ConfluenceItem; // Gate 1: 4H/1H 200 EMA & Healthy Slope
  gannPriceLevel: ConfluenceItem; // Gate 2: Multi-Cycle Square of 9 (45° - 720°)
  gannSlope?: ConfluenceItem; // Gate 3: Dynamic 1x1 Slope & Time Cycle (144 & √P)
  gannTimeCycle: ConfluenceItem;
  microMomentum: ConfluenceItem; // Gate 4: Clean RSI Momentum Zone
  wyckoffMatrix?: ConfluenceItem; // Optional / Legacy reference
  volumeConfirmation: ConfluenceItem; // Gate 5: Volume Surge + 20% Wick + Micro-BOS
  riskRewardRatio: ConfluenceItem; // Quad Scale-Out R:R validation (1:2 R:R Hard Cap)
  items: ConfluenceItem[];
  wyckoffData?: WyckoffSignalData;
  gann: GannGeometryData;
  gannSlopeData?: GannSlopeData;
  reversalBarData?: ReversalBarData;
  sq9Levels?: Record<number, number> | { angle: number; price: number; name: string }[];
  quadTargets?: {
    tp1: number;
    tp2: number;
    tp3: number;
    tp4: number;
    tp1Percent: number;
    tp2Percent: number;
    tp3Percent: number;
    tp4Percent: number;
  };
  structuralSLType?: 'WYCKOFF_EXTREME' | 'GANN_SWING_ANCHOR' | 'ATR_FALLBACK';
  rsiDivergence: {
    hasDivergence: boolean;
    type: 'BULLISH' | 'BEARISH' | 'NONE';
    description: string;
  };
  macdSignal: {
    isCrossover: boolean;
    type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    histTurn: boolean;
    description: string;
  };
}

export interface FibonacciLevels {
  swingHigh: SwingPoint;
  swingLow: SwingPoint;
  fibRange: number;
  level0_0: number;
  level236: number;
  level382: number;
  level500: number;
  level618: number;
  level786: number;
  level100: number;
  extension1618: number;
  isRetracementZoneActive: boolean;
  zoneRangeDescription: string;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  icon: string;
  category?: 'Major' | 'DeFi' | 'Layer1' | 'Meme' | 'Top Volume' | 'Trending' | 'Custom';
  price24h?: number;
  change24h?: number;
  volume24h?: string;
}

export interface SafeExecutionMatrix {
  orderTypeDecision: {
    recommendedOrder: 'LIMIT' | 'STOP_LIMIT';
    rationale: string;
    suggestedLimitPrice: number;
    stopTriggerPrice?: number;
    distancePercent: number;
  };
  stopLossGuidance: {
    structuralLevelPrice: number;
    atrBuffer1_5x: number;
    finalStopLoss: number;
    timeframe: '1H' | '15M';
    rationale: string;
  };
  entryTimingGuidance: {
    isCandleClosed: boolean;
    mssConfirmed: boolean;
    activeSessionName: string;
    isNewsBufferClear: boolean;
    rationale: string;
  };
  trendAlignmentGuidance: {
    h4Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    dailyBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    is4HAligned: boolean;
    rationale: string;
  };
}

export interface IntradayProtectionShield {
  // أولاً: تفادي الانزلاق السعري (Slippage Prevention)
  slippageGuard: {
    limitOrderEntry: {
      isPrePositioned: boolean;
      entryType: 'LIMIT' | 'STOP_LIMIT';
      entryPrice: number;
      zoneName: string; // e.g. "مستوى فيبوناتشي 61.8% الذهبي" / "منطقة طلب مؤسسية" / "إعادة اختبار كسر 15M"
      note: string;
    };
    stopLimitProtection: {
      useStopLimit: boolean;
      stopPrice: number;
      limitPrice: number;
      maxGapBufferPercent: number;
      note: string;
    };
    economicNewsGuard: {
      isSafeFromNews: boolean;
      upcomingEventName?: string;
      minutesUntilEvent?: number;
      status: 'SAFE' | 'NEWS_RESTRICTED';
      note: string;
    };
    tier1LiquidityFocus: {
      isTier1Symbol: boolean;
      category: string;
      orderbookQuality: 'HIGH_LIQUIDITY' | 'MEDIUM_LIQUIDITY' | 'THIN_ORDERBOOK_WARN';
      note: string;
    };
  };

  // ثانياً: تفادي الانعكاسات المفاجئة (Trend Reversal Prevention)
  reversalGuard: {
    liquiditySweep: {
      detected: boolean;
      type: 'PDH_SWEEP' | 'PDL_SWEEP' | 'ASIA_HIGH_SWEEP' | 'ASIA_LOW_SWEEP' | 'NONE';
      sweptLevelName: string;
      sweptPrice: number;
      failedToHold: boolean;
      note: string;
    };
    marketStructureShift: {
      confirmed: boolean;
      timeframe: '15M' | '1H';
      brokenSwingPrice: number;
      breakType: 'BODY_CLOSE' | 'WICK_ONLY' | 'NONE';
      note: string;
    };
    fourHourTrendAlignment: {
      aligned: boolean;
      h4Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      h4Ema200: number;
      currentPrice: number;
      note: string;
    };
    divergenceVolumeExhaustion: {
      hasExhaustion: boolean;
      rsiDivergenceType: 'BULLISH' | 'BEARISH' | 'NONE';
      volumeDivergence: boolean;
      note: string;
    };
  };

  // مصفوفة التنفيذ الآمن في التداول اليومي
  executionMatrix: SafeExecutionMatrix;
}

export interface TradeSetup {
  entry_price: number;
  current_price?: number;
  entry_type?: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_LIMIT';
  entryDistancePercent?: number;
  stop_limit_trigger?: number; // سعر تفعيل Stop-Limit
  stop_loss: number;
  take_profit?: number; // Gann & Wyckoff Single Target (الهدف الموحد لجان ووايكوف)
  take_profit_1: number; // Backward-compatible alias to single TP
  take_profit_2?: number; // Legacy alias pointing to same target
  take_profit_3?: number;
  take_profit_4?: number;
  risk_reward_ratio: string;
  stopLossPercent: number;
  tpPercent?: number; // Single Target profit percentage
  tp1Percent: number;
  tp2Percent?: number;
  tp3Percent?: number;
  tp4Percent?: number;
  targetType?: 'GANN_SQ9_HARMONIC' | 'WYCKOFF_EXPANSION_1_5R' | 'WYCKOFF_EXPANSION_2_0R' | 'WYCKOFF_EXPANSION_2_5R';
  targetAngleName?: string;
  atr15m?: number;
  atr5m?: number;
  atr1h?: number;
  riskDistance?: number;
  breakEvenPrice?: number;
  trailingStopInitial?: number;
  target50PercentPrice?: number; // مستوى 50% من مشوار الصفقة للهدف
  trigger1_5AtrPrice?: number; // مستوى تفعيل تحريك الوقف عند وصول السعر إلى 1.5 ATR
  atrValue?: number;
  suggestedLotUnits?: number;
  suggestedPositionUsdt?: number;
  maxRiskUsdt?: number;
  engineType?: string; // 'Gann Intraday' | 'Gann Scalp'
  sopScore?: number; // 4/5 or 5/5 (V41.00 Enterprise Protection Shield)
  wyckoffPattern?: string; // 'Spring/Shakeout' | 'LPS (No Supply)' | 'UTAD/Upthrust' | 'LPSY (No Demand)' | 'Standard Gann'
  wyckoffData?: WyckoffSignalData;
  structuralSLType?: 'WYCKOFF_EXTREME' | 'GANN_SWING_ANCHOR' | 'ATR_FALLBACK';
  wyckoffExtremePrice?: number;
  quadScaleOut?: QuadScaleOutSetup;
  // Multi-Scale EA Parameters
  partialClosePercent?: number; // 25% per stage
  beTriggerRR?: number; // 0.5 R:R
  beOffsetPoints?: number; // +5 to +30 points
  trailingStartPoints?: number;
  trailingDistancePoints?: number;
  trailingStepPoints?: number;
  fibonacciLevels?: FibonacciLevels;
  fibLevels?: FibonacciLevels;
  swingHigh?: SwingPoint;
  swingLow?: SwingPoint;
}

export interface DailyMacroBiasStatus {
  enabled: boolean;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  isMacroBullish: boolean;
  isMacroBearish: boolean;
  prevDailyOpen: number;
  prevDailyClose: number;
  prevDailyHigh: number; // قمة الأمس (PDH) - مستوى مقاومة أقصى
  prevDailyLow: number;  // قاع الأمس (PDL) - مستوى دعم أقصى
  dailyEma50: number;
  diffPercent: number;
  yesterdayCandleType: 'BULLISH' | 'BEARISH' | 'DOJI';
  yesterdayBodyPercent: number;
  isNearDailyHighResistance: boolean; // السعر يلامس سقف قمة الأمس مباشرة
  isNearDailyLowSupport: boolean;      // السعر يلامس أرضية قاع الأمس مباشرة
  distToDailyHighPercent: number;
  distToDailyLowPercent: number;
  allowedDirection: 'BUY_ONLY' | 'SELL_ONLY' | 'ALL';
  message: string;
  details: string;
}

export interface SingleStepStatus {
  passed: boolean;
  message: string;
  details: string;
  gateName?: string;
}

export interface StepStatus {
  step0_dailyMacro?: SingleStepStatus; // Gate 0: Daily Macro Trend Bias (1D 50 EMA)
  gate0_adx: SingleStepStatus; // Gate 1: 4H/1H 200 EMA & Trend Regime
  step1_4h: SingleStepStatus;  // Gate 2: Square of 9 (45°-720°)
  step2_1h: SingleStepStatus;  // Gate 3: Gann Dynamic 1x1 & Time Cycle 144
  step3_15m: SingleStepStatus; // Gate 4: Clean Momentum Zone & Wyckoff
  step4_5m?: SingleStepStatus;
  gate5_wyckoff?: SingleStepStatus;
  step5_volume?: SingleStepStatus; // Gate 5: Volume Surge & Price Action Micro-BOS
}

export interface ConfirmationLayerInfo {
  volumeFilter: {
    passed: boolean;
    ratio: number;
    volume: number;
    volumeSMA: number;
    message: string;
  };
  priceAction: {
    passed: boolean;
    wickPercent: number;
    candleType: 'BULLISH' | 'BEARISH' | 'DOJI';
    isEngulfingOrHammer: boolean;
    message: string;
  };
  microBOS: {
    passed: boolean;
    breakPrice: number;
    brokenLevel: number;
    message: string;
  };
  ema50Guard: {
    passed: boolean;
    ema50: number;
    price: number;
    message: string;
  };
  bbExpansion: {
    passed: boolean;
    bandwidth: number;
    isExpanding: boolean;
    message: string;
  };
  totalConfirmed: number;
  allConfirmed: boolean;
}

export interface MarketIndicators {
  price: number;
  adx_1h: number;
  ema200_4h: number;
  ema50_1h?: number;
  macd_hist_1h: number;
  bb_lower_15m: number;
  bb_upper_15m: number;
  rsi_5m: number;
  rsi_5m_prev: number;
  rsi_15m: number;
  atr_15m: number;
  pivot_4h_P: number;
  pivot_4h_S1: number;
  pivot_4h_R1: number;
  pivot_15m_S1: number;
  pivot_15m_R1: number;
  macd_5m_cross: 'BUY' | 'SELL' | 'NEUTRAL';
  sopScore: number;
  price24hChange?: number;
  // Scalp specific optional indicators
  adx_15m?: number;
  ema200_1h?: number;
  ema50_15m?: number;
  macd_hist_15m?: number;
  bb_lower_1m?: number;
  bb_upper_1m?: number;
  pivot_1h_P?: number;
  pivot_1h_S1?: number;
  pivot_1h_R1?: number;
  pivot_5m_S1?: number;
  pivot_5m_R1?: number;
  atr_5m?: number;
  tradingMode?: TradingMode;
  macd_line_1h?: number;
  macd_sig_1h?: number;
  bb_upper_1h?: number;
  bb_lower_1h?: number;
  bb_bandwidth_1h?: number;
  bb_bandwidth_15m?: number;
  macd_line_15m?: number;
  macd_sig_15m?: number;
  bb_upper_5m?: number;
  bb_lower_5m?: number;
  bb_bandwidth_5m?: number;
  macd_line_5m?: number;
  macd_sig_5m?: number;
  macd_line_1m?: number;
  macd_sig_1m?: number;
  bb_bandwidth_1m?: number;
  // 5 Confirmation Layers metrics
  volume_5m?: number;
  volume_sma20_5m?: number;
  volume_ratio_5m?: number;
  rejection_wick_percent?: number;
  micro_bos_broken_level?: number;
  confirmation_score?: number;
  // 5SOP Fibonacci & Multi-Scale Engine metrics
  atr_1h?: number;
  swing_high_price?: number;
  swing_high_time?: number;
  swing_low_price?: number;
  swing_low_time?: number;
  swingHighPrice?: number;
  swingLowPrice?: number;
  fib_500?: number;
  fib_786?: number;
  fib500?: number;
  fib786?: number;
  fib_range?: number;
  fib_1618_tp2?: number;
  fibExtension1618?: number;
  is_in_fib_zone?: boolean;
  isFibGoldenZone?: boolean;
  ema200_1h_trend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  daily_macro_bias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  daily_prev_close?: number;
  daily_ema50?: number;
  daily_ema50_dist_percent?: number;
  // Dynamic Volatility & Safety Metrics
  choppiness_15m?: number;
  isChoppyMarket?: boolean;
  volatilitySpikeActive?: boolean;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SpreadGuardStatus {
  isSpreadSafe: boolean;
  bidPrice: number;
  askPrice: number;
  spreadValue: number;
  spreadPercent: number;
  maxAllowedSpread: number;
  message: string;
}

export interface TradingSessionInfo {
  activeSession: 'LONDON' | 'NEW_YORK' | 'OVERLAP' | 'ASIA' | 'OFF_HOURS';
  sessionName: string;
  isWithinTradingHours: boolean;
  isAllowedSession: boolean;
  utcTime: string;
  localTime: string;
  activeSessionsList: string[];
}

export interface TimeGuardStatus {
  isSafe: boolean;
  reason?: string;
  utcTime: string;
  windowName?: string;
  nextSafeTime?: string;
  sessionInfo?: TradingSessionInfo;
}

export interface BtcGuardStatus {
  isBtcSafe: boolean;
  btcTrend: 'BULLISH' | 'NEUTRAL' | 'BEARISH_DUMP';
  btcPrice: number;
  btc24hChange: number;
  message: string;
}

export interface AnalysisResult {
  symbol: string;
  timestamp: Date;
  decision: 'BUY' | 'SELL' | 'NO_TRADE';
  rejected_at_step?: string;
  reason: string;
  steps: StepStatus;
  indicators: MarketIndicators;
  dailyMacroBias?: DailyMacroBiasStatus;
  confluenceMatrix?: ConfluenceScoringMatrix;
  gannData?: GannGeometryData;
  confirmationLayers?: ConfirmationLayerInfo;
  trade_setup?: TradeSetup;
  intradayProtection?: IntradayProtectionShield;
  timeGuard?: TimeGuardStatus;
  btcGuard?: BtcGuardStatus;
  spreadGuard?: SpreadGuardStatus;
  sessionInfo?: TradingSessionInfo;
  candles15m?: CandleData[];
  tradingMode?: TradingMode;
  circuitBreaker?: {
    isSpikeActive: boolean;
    volumeMultiplier: number;
    rangeMultiplier: number;
    message?: string;
  };
}

export interface ScanItemResult {
  symbol: string;
  name: string;
  icon: string;
  price: number;
  decision: 'BUY' | 'SELL' | 'NO_TRADE';
  reason: string;
  rsi_5m: number;
  adx_1h?: number;
  ema200_4h: number;
  timestamp: string;
  analysis?: AnalysisResult;
}

export interface SignalHistoryItem extends Omit<Partial<AnalysisResult>, 'timestamp' | 'indicators'> {
  id: string;
  symbol: string;
  decision: 'BUY' | 'SELL' | 'NO_TRADE';
  reason: string;
  indicators: Partial<MarketIndicators> & { price: number; sopScore?: number };
  timestamp: string;
  source?: 'DAEMON' | 'MANUAL' | 'SCANNER' | 'TURSO';
  telegramSent?: boolean;
  sopScore?: number;
}

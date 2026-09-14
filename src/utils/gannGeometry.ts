import { GannLevel, GannGeometryData, CandleData } from '../types';
import { calcRSI, calcMACD } from './technicalAnalysis';

/**
 * Scale factor normalization for Gann Square of Nine (V38.00 Enterprise Master)
 * Adapts across Forex, Silver, JPY, Gold, and Crypto/Indices
 */
export function getUniversalScaleFactor(price: number): number {
  if (price <= 0) return 1.0;
  if (price < 5.0) return 10000.0; // أزواج الفوركس 1.0850 -> 10850
  if (price < 50.0) return 1000.0; // الفضة 29.50 -> 29500
  if (price < 500.0) return 100.0; // أزواج الين 155.00 -> 15500
  if (price < 5000.0) return 10.0; // الذهب 2500 -> 25000
  return 1.0; // البيتكوين والمؤشرات والأسهم 40000+
}

export const getGannScaleFactor = getUniversalScaleFactor;

/**
 * Multi-Cycle Square of 9 calculation matching MQL5 V38.00 Enterprise Master
 */
export const GANN_SQ9_ANGLES = [
  45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0, 360.0,
  405.0, 450.0, 495.0, 540.0, 585.0, 630.0, 675.0, 720.0
];

export function calculateSquareOf9Target(basePrice: number, angleDeg: number, isResistance: boolean): number {
  if (basePrice <= 0) return 0.0;
  const factor = getUniversalScaleFactor(basePrice);
  const normPrice = basePrice * factor;
  const sqrtP = Math.sqrt(normPrice);
  const angleFactor = angleDeg / 180.0;
  const targetNorm = isResistance ? (sqrtP + angleFactor) : (sqrtP - angleFactor);
  if (targetNorm <= 0) return 0.0;
  return (targetNorm * targetNorm) / factor;
}

export function checkSquareOf9Confluence(
  currentPrice: number,
  anchorPrice: number,
  isLong: boolean,
  toleranceFactor = 0.15
): { isConfluent: boolean; matchedAngle?: number; matchedTarget?: number; dynamicTolerance?: number; distancePercent?: number } {
  if (anchorPrice <= 0 || currentPrice <= 0) return { isConfluent: false };

  const factor = getUniversalScaleFactor(anchorPrice);
  const normPrice = anchorPrice * factor;
  const sqrtP = Math.sqrt(normPrice);

  const nextAngleNorm = Math.pow(sqrtP + 0.25, 2);
  const stepDistance = Math.abs((nextAngleNorm - normPrice) / factor);
  const dynamicTolerance = stepDistance * toleranceFactor;

  let bestAngle: number | undefined;
  let bestTarget: number | undefined;
  let minDiff = Infinity;

  for (const angle of GANN_SQ9_ANGLES) {
    const target = calculateSquareOf9Target(anchorPrice, angle, isLong);
    const diff = Math.abs(currentPrice - target);
    if (diff <= dynamicTolerance) {
      if (diff < minDiff) {
        minDiff = diff;
        bestAngle = angle;
        bestTarget = target;
      }
    }
  }

  if (bestAngle !== undefined && bestTarget !== undefined) {
    const distancePercent = Number(((minDiff / currentPrice) * 100).toFixed(3));
    return { isConfluent: true, matchedAngle: bestAngle, matchedTarget: bestTarget, dynamicTolerance, distancePercent };
  }

  return { isConfluent: false, dynamicTolerance };
}

/**
 * Exact Square of 9 calculation for key angles
 */
export function calculateSq9Exact(basePrice: number): Record<number, number> {
  const safeBase = Math.max(0.000001, basePrice);
  const result: Record<number, number> = {};

  for (const deg of GANN_SQ9_ANGLES) {
    result[deg] = calculateSquareOf9Target(safeBase, deg, true);
  }
  return result;
}

/**
 * Dynamic Gann Fan Slope calculation (V38.00)
 * Intraday: dynamicSlope = ATR(4H) / 48.0 (rate of price change per 5M candle in a 4H cycle)
 * Scalp: dynamicSlope = ATR(15M) / 15.0 (rate of price change per 1M candle in a 15M cycle)
 */
export function calculateGannDynamicSlope(atr: number, isScalp = false): number {
  const safeAtr = Math.max(0.000001, atr);
  return isScalp ? safeAtr / 15.0 : safeAtr / 48.0;
}

/**
 * 1. حساب مستويات مربع التسعة (Gann Square of Nine Levels)
 * Formulas:
 * Target Resistance Level (Angle θ) = (sqrt(Price * Scale) + θ / 180)^2 / Scale
 * Target Support Level (Angle θ) = (sqrt(Price * Scale) - θ / 180)^2 / Scale
 */
export function calculateSquareOfNineLevels(
  refPrice: number,
  currentPrice: number
): {
  levels: GannLevel[];
  nearestSupport: GannLevel;
  nearestResistance: GannLevel;
  nextGannResistanceTarget: GannLevel;
  nextGannSupportTarget: GannLevel;
} {
  const safeRef = Math.max(0.000001, refPrice);
  const safeCurrent = Math.max(0.000001, currentPrice);
  const scale = getGannScaleFactor(safeRef);
  const scaledRef = safeRef * scale;
  const root = Math.sqrt(scaledRef);

  const angles = [
    { angle: 45, name: '45° (Angle 1/8)' },
    { angle: 90, name: '90° (Cardinal Cross)' },
    { angle: 135, name: '135° (Fixed Cross)' },
    { angle: 180, name: '180° (Opposition Half-Cycle)' },
    { angle: 225, name: '225° (Angle 5/8)' },
    { angle: 270, name: '270° (Cardinal Cross 3/4)' },
    { angle: 315, name: '315° (Angle 7/8)' },
    { angle: 360, name: '360° (Full Master Cycle)' },
    { angle: 540, name: '540° (Cycle 1.5x)' },
    { angle: 720, name: '720° (Double Cycle 2.0x)' },
  ];

  const levels: GannLevel[] = [];

  // 1. Reference Pivot Level (0°)
  levels.push({
    angle: 0,
    angleName: '0° (Pivot Origin)',
    price: Number(safeRef.toFixed(safeRef < 1 ? 6 : 2)),
    isSupport: safeRef <= safeCurrent,
    isResistance: safeRef > safeCurrent,
    distancePercent: Number(((Math.abs(safeRef - safeCurrent) / safeCurrent) * 100).toFixed(3)),
  });

  // 2. Upward Resistance Angles
  angles.forEach(({ angle, name }) => {
    const delta = angle / 180;
    const targetScaled = Math.pow(root + delta, 2);
    const targetPrice = targetScaled / scale;
    levels.push({
      angle,
      angleName: `+${name}`,
      price: Number(targetPrice.toFixed(targetPrice < 1 ? 6 : 2)),
      isSupport: targetPrice <= safeCurrent,
      isResistance: targetPrice > safeCurrent,
      distancePercent: Number(((Math.abs(targetPrice - safeCurrent) / safeCurrent) * 100).toFixed(3)),
    });
  });

  // 3. Downward Support Angles
  angles.forEach(({ angle, name }) => {
    const delta = angle / 180;
    const targetRoot = Math.max(0.001, root - delta);
    const targetScaled = Math.pow(targetRoot, 2);
    const targetPrice = targetScaled / scale;
    if (targetPrice > 0) {
      levels.push({
        angle: -angle,
        angleName: `-${name}`,
        price: Number(targetPrice.toFixed(targetPrice < 1 ? 6 : 2)),
        isSupport: targetPrice <= safeCurrent,
        isResistance: targetPrice > safeCurrent,
        distancePercent: Number(((Math.abs(targetPrice - safeCurrent) / safeCurrent) * 100).toFixed(3)),
      });
    }
  });

  // Sort levels by price ascending
  levels.sort((a, b) => a.price - b.price);

  // Find nearest support (highest level <= currentPrice)
  const supports = levels.filter((l) => l.price <= safeCurrent);
  const nearestSupport: GannLevel = supports.length > 0
    ? supports[supports.length - 1]
    : {
        angle: -45,
        angleName: '-45° Support',
        price: Number((safeCurrent * 0.985).toFixed(safeCurrent < 1 ? 6 : 2)),
        isSupport: true,
        isResistance: false,
        distancePercent: 1.5,
      };

  // Find nearest resistance (lowest level > currentPrice)
  const resistances = levels.filter((l) => l.price > safeCurrent);
  const nearestResistance: GannLevel = resistances.length > 0
    ? resistances[0]
    : {
        angle: 45,
        angleName: '+45° Resistance',
        price: Number((safeCurrent * 1.015).toFixed(safeCurrent < 1 ? 6 : 2)),
        isSupport: false,
        isResistance: true,
        distancePercent: 1.5,
      };

  // Next target resistance for long setup (e.g. 2nd resistance or 90°/180° level)
  const nextGannResistanceTarget: GannLevel = resistances.length > 1
    ? resistances[1]
    : {
        angle: 90,
        angleName: '+90° Target Resistance',
        price: Number((nearestResistance.price * 1.025).toFixed(safeCurrent < 1 ? 6 : 2)),
        isSupport: false,
        isResistance: true,
        distancePercent: 3.5,
      };

  // Next target support for short setup
  const nextGannSupportTarget: GannLevel = supports.length > 1
    ? supports[supports.length - 2]
    : {
        angle: -90,
        angleName: '-90° Target Support',
        price: Number((nearestSupport.price * 0.975).toFixed(safeCurrent < 1 ? 6 : 2)),
        isSupport: true,
        isResistance: false,
        distancePercent: 3.5,
      };

  return {
    levels,
    nearestSupport,
    nearestResistance,
    nextGannResistanceTarget,
    nextGannSupportTarget,
  };
}

/**
 * 2. حساب الدورات والتوافق الزمني لجـان (Gann Time Cycles - V38.00 Enterprise Master)
 * Modulo 144 Harmonic Master Nodes: 21, 35, 49, 90, 144 + Sqrt(P0 * Factor)
 */
export function calculateGannTimeCycles(
  refPrice: number,
  barsElapsed: number
): {
  timeCycleTargetBars: number;
  isHarmonic: boolean;
  activeTimeAngle: string;
  timeHarmonicCycleName: string;
  isRule49Aligned: boolean;
  rule49Remainder: number;
  isSqrtAligned: boolean;
  sqrtRemainder: number;
  sqrtCycle: number;
  cycleBar144: number;
} {
  const safeRef = Math.max(0.000001, refPrice);
  const factor = getUniversalScaleFactor(safeRef);
  const sqrtCycle = Math.max(2, Math.round(Math.sqrt(safeRef * factor)));

  const cycleBar144 = barsElapsed > 0 ? (barsElapsed % 144) : 0;

  // Harmonic Node checks matching CheckGannTimeCycle in MQL5 V38.00
  const is21 = Math.abs(cycleBar144 - 21) <= 1;
  const is35 = Math.abs(cycleBar144 - 35) <= 1;
  const is49 = Math.abs(cycleBar144 - 49) <= 1;
  const is90 = Math.abs(cycleBar144 - 90) <= 2;
  const is144 = Math.abs(cycleBar144 - 144) <= 2 || (cycleBar144 <= 2 && barsElapsed >= 142);
  const isSqrt = sqrtCycle > 0 && (barsElapsed % sqrtCycle <= 1 || barsElapsed % sqrtCycle >= (sqrtCycle - 1));

  const isRule49Aligned = is49 || (barsElapsed % 49 <= 1 || barsElapsed % 49 >= 48);
  const rule49Remainder = barsElapsed % 49;
  const sqrtRemainder = barsElapsed % sqrtCycle;
  const isSqrtAligned = isSqrt;

  const isHarmonic = is21 || is35 || is49 || is90 || is144 || isSqrt;

  let activeTimeAngle = '0° Neutral';
  let timeHarmonicCycleName = 'بانتظار دورة جان الزمنية القادمة';

  if (is144) {
    activeTimeAngle = 'Full 144 Master Cycle';
    timeHarmonicCycleName = `🌟 اكتمال دورة جان الكبرى 144 شمعة (شمعة ${barsElapsed}، دورة 144)`;
  } else if (is90) {
    activeTimeAngle = '90 Cardinal Node (144/4)';
    timeHarmonicCycleName = `📐 عقدة 90 شمعة التوافقية (شمعة ${barsElapsed}، المتبقي ${cycleBar144})`;
  } else if (is49 || isRule49Aligned) {
    activeTimeAngle = 'Rule of 49 Master Node';
    timeHarmonicCycleName = `⚡ توافق قاعدة 49 شمعة لجان (شمعة ${barsElapsed}، دورة 49)`;
  } else if (is35) {
    activeTimeAngle = '35 Harmonic Node';
    timeHarmonicCycleName = `⏱️ عقدة 35 شمعة التوافقية (شمعة ${barsElapsed})`;
  } else if (is21) {
    activeTimeAngle = '21 Fibonacci/Gann Node';
    timeHarmonicCycleName = `⏱️ عقدة 21 شمعة التوافقية لجان (شمعة ${barsElapsed})`;
  } else if (isSqrt) {
    activeTimeAngle = `√P (${sqrtCycle} Bars) Cycle`;
    timeHarmonicCycleName = `📐 توافق دورة جذر السعر √P=${sqrtCycle} شمعة (شمعة ${barsElapsed})`;
  } else {
    activeTimeAngle = `${Math.round((cycleBar144 / 144) * 360)}° Gann Wheel`;
    timeHarmonicCycleName = `الشموع المنقضية: ${barsElapsed} (دورة 144: ${cycleBar144}/144 | دورة √P: باقي ${sqrtRemainder})`;
  }

  return {
    timeCycleTargetBars: 144,
    isHarmonic,
    activeTimeAngle,
    timeHarmonicCycleName,
    isRule49Aligned,
    rule49Remainder,
    isSqrtAligned,
    sqrtRemainder,
    sqrtCycle,
    cycleBar144,
  };
}

/**
 * 3. فحص الانفراج السعري لمؤشر القوة النسبية (RSI Divergence Detection)
 * Regular Bullish: Lower Low in Price vs Higher Low in RSI
 * Regular Bearish: Higher High in Price vs Lower High in RSI
 * Hidden Bullish: Higher Low in Price vs Lower Low in RSI
 * Hidden Bearish: Lower High in Price vs Higher High in RSI
 */
export function checkRsiDivergence(
  candles: CandleData[],
  rsiValues: number[]
): {
  bullishDiv: boolean;
  bearishDiv: boolean;
  type: 'BULLISH' | 'BEARISH' | 'NONE';
  description: string;
} {
  const n = candles.length;
  if (n < 15 || rsiValues.length < 15) {
    return { bullishDiv: false, bearishDiv: false, type: 'NONE', description: 'بيانات غير كافية لفحص الدايفرجنس' };
  }

  const lookback = Math.min(25, n - 2);
  const currentLow = candles[n - 1].low;
  const currentHigh = candles[n - 1].high;
  const currentRsi = rsiValues[rsiValues.length - 1];

  let prevTroughPrice = Infinity;
  let prevTroughRsi = Infinity;
  let prevPeakPrice = -Infinity;
  let prevPeakRsi = -Infinity;

  for (let i = n - 4; i >= n - lookback; i--) {
    // Check local trough (low)
    if (candles[i].low < candles[i - 1]?.low && candles[i].low < candles[i + 1]?.low) {
      if (candles[i].low < prevTroughPrice) {
        prevTroughPrice = candles[i].low;
        prevTroughRsi = rsiValues[i];
      }
    }
    // Check local peak (high)
    if (candles[i].high > candles[i - 1]?.high && candles[i].high > candles[i + 1]?.high) {
      if (candles[i].high > prevPeakPrice) {
        prevPeakPrice = candles[i].high;
        prevPeakRsi = rsiValues[i];
      }
    }
  }

  // Bullish Divergence check
  const isRegularBullish = currentLow <= prevTroughPrice * 1.002 && currentRsi > prevTroughRsi + 2.0 && currentRsi < 48;
  const isHiddenBullish = currentLow > prevTroughPrice && currentRsi < prevTroughRsi - 2.0 && currentRsi < 45;
  const bullishDiv = isRegularBullish || isHiddenBullish;

  // Bearish Divergence check
  const isRegularBearish = currentHigh >= prevPeakPrice * 0.998 && currentRsi < prevPeakRsi - 2.0 && currentRsi > 52;
  const isHiddenBearish = currentHigh < prevPeakPrice && currentRsi > prevPeakRsi + 2.0 && currentRsi > 55;
  const bearishDiv = isRegularBearish || isHiddenBearish;

  if (bullishDiv) {
    return {
      bullishDiv: true,
      bearishDiv: false,
      type: 'BULLISH',
      description: isRegularBullish
        ? `🔥 انفراج إيجابي كلاسيكي صاعد (Bullish Divergence) - قاع سعري أدنى مع قاع RSI أعلى (${currentRsi.toFixed(1)} > ${prevTroughRsi.toFixed(1)})`
        : `🔥 انفراج إيجابي مخفي (Hidden Bullish Divergence) - استمرار الزخم الصاعد`,
    };
  }

  if (bearishDiv) {
    return {
      bullishDiv: false,
      bearishDiv: true,
      type: 'BEARISH',
      description: isRegularBearish
        ? `❄️ انفراج سلبي كلاسيكي هابط (Bearish Divergence) - قمة سعرية أعلى مع قمة RSI أدنى (${currentRsi.toFixed(1)} < ${prevPeakRsi.toFixed(1)})`
        : `❄️ انفراج سلبي مخفي (Hidden Bearish Divergence) - استمرار الزخم الهابط`,
    };
  }

  return {
    bullishDiv: false,
    bearishDiv: false,
    type: 'NONE',
    description: 'لا يوجد انفراج سعري نشط (RSI يواكب حركة السعر بشكل طبيعي)',
  };
}

/**
 * 4. فحص تقاطع وتأكيد زخم الماكد اللحظي (5M MACD Signal Confirmation)
 */
export function checkMacdSignal(closes: number[]): {
  isCrossover: boolean;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  histTurn: boolean;
  description: string;
} {
  const macd = calcMACD(closes);
  const n = macd.macdLine.length;
  if (n < 3) {
    return { isCrossover: false, type: 'NEUTRAL', histTurn: false, description: 'بيانات غير كافية للماكد' };
  }

  const macdCurr = macd.macdLine[n - 1];
  const macdPrev = macd.macdLine[n - 2];
  const sigCurr = macd.signalLine[n - 1];
  const sigPrev = macd.signalLine[n - 2];
  const histCurr = macd.histogram[n - 1];
  const histPrev = macd.histogram[n - 2];

  const isBullishCross = (macdCurr >= sigCurr && macdPrev < sigPrev) || (histCurr > 0 && histPrev <= 0);
  const isBearishCross = (macdCurr <= sigCurr && macdPrev > sigPrev) || (histCurr < 0 && histPrev >= 0);
  const isBullishMomentum = histCurr > histPrev && histCurr > 0;
  const isBearishMomentum = histCurr < histPrev && histCurr < 0;

  if (isBullishCross || isBullishMomentum) {
    return {
      isCrossover: isBullishCross,
      type: 'BULLISH',
      histTurn: histCurr > histPrev,
      description: isBullishCross
        ? '🚀 تقاطع إيجابي صاعد مؤكد لخط الماكد أعلى خط الإشارة (Bullish MACD Cross)'
        : '📈 تصاعد مستمر في أعمدة هيستوجرام الماكد الصاعدة',
    };
  }

  if (isBearishCross || isBearishMomentum) {
    return {
      isCrossover: isBearishCross,
      type: 'BEARISH',
      histTurn: histCurr < histPrev,
      description: isBearishCross
        ? '📉 تقاطع سلبي هابط مؤكد لخط الماكد أسفل خط الإشارة (Bearish MACD Cross)'
        : '📉 تراجع مستمر في أعمدة هيستوجرام الماكد الهابطة',
    };
  }

  return {
    isCrossover: false,
    type: 'NEUTRAL',
    histTurn: false,
    description: 'خطوط الماكد في حالة استقرار نسبي بدون تقاطع جديد',
  };
}

/**
 * 5. محرك مصفوفة وايكوف للسيولة والسلوك (Wyckoff Matrix Engine V41.00 Enterprise Protection Shield)
 * Spring, LPS, UTAD, LPSY Detection against Gann Square of 9 Confluence Levels
 */
export function checkWyckoffSignal(
  candles: CandleData[],
  gannLevel: number,
  isBullishTarget: boolean,
  atrVal: number,
  volMAPeriod: number = 20,
  springVolMultiplier: number = 1.30,
  lpsVolMultiplier: number = 0.85,
  minWickRatio: number = 0.35
): {
  signal: 'WYCKOFF_NONE' | 'WYCKOFF_SPRING' | 'WYCKOFF_LPS' | 'WYCKOFF_UTAD' | 'WYCKOFF_LPSY';
  patternName: string;
  extremePrice: number;
  isConfirmed: boolean;
  volumeRatio: number;
  wickRatio: number;
  description: string;
} {
  const n = candles.length;
  const requiredBars = volMAPeriod + 3;
  if (n < requiredBars || gannLevel <= 0) {
    return {
      signal: 'WYCKOFF_NONE',
      patternName: 'لا يوجد نمط وايكوف نشط',
      extremePrice: 0,
      isConfirmed: false,
      volumeRatio: 1.0,
      wickRatio: 0,
      description: 'بيانات غير كافية لمحرك وايكوف',
    };
  }

  const evalBar = candles[n - 1];
  let sumVol = 0;
  for (let i = n - 1 - volMAPeriod; i < n - 1; i++) {
    sumVol += (candles[i].volume || 1);
  }
  const avgVol = Math.max(1, sumVol / volMAPeriod);

  const high1 = evalBar.high;
  const low1 = evalBar.low;
  const open1 = evalBar.open;
  const close1 = evalBar.close;
  const spread1 = high1 - low1;
  const vol1 = evalBar.volume || 1;
  const volRatio = Number((vol1 / avgVol).toFixed(2));

  if (spread1 <= 0 || (atrVal > 0 && spread1 > atrVal * 2.5)) {
    return {
      signal: 'WYCKOFF_NONE',
      patternName: 'لا يوجد نمط وايكوف نشط',
      extremePrice: 0,
      isConfirmed: false,
      volumeRatio: volRatio,
      wickRatio: 0,
      description: 'فارق السعر للشمعة غير متوافق مع معايير وايكوف',
    };
  }

  const lowerWick1 = Math.min(open1, close1) - low1;
  const upperWick1 = high1 - Math.max(open1, close1);
  const lowerWickRatio = spread1 > 0 ? Number((lowerWick1 / spread1).toFixed(2)) : 0;
  const upperWickRatio = spread1 > 0 ? Number((upperWick1 / spread1).toFixed(2)) : 0;
  const tolerance = gannLevel * 0.0015;

  if (isBullishTarget) {
    // 1. Wyckoff Spring: Price dipped below Gann level then closed back up, High absorption volume (>= 1.30x), Lower rejection wick >= 35%
    const isSpringPrice = low1 < (gannLevel - tolerance) && close1 >= (gannLevel - (tolerance * 0.5));
    const isSpringVol = vol1 >= avgVol * springVolMultiplier;
    const isSpringWick = lowerWickRatio >= minWickRatio;

    if (isSpringPrice && isSpringVol && isSpringWick) {
      return {
        signal: 'WYCKOFF_SPRING',
        patternName: '⚡ وايكوف سبرينغ (Wyckoff Spring - كسر كاذب وامتصاص عالي)',
        extremePrice: low1,
        isConfirmed: true,
        volumeRatio: volRatio,
        wickRatio: lowerWickRatio,
        description: `امتصاص سيولة صاعد عند مستوى جان $${gannLevel.toFixed(gannLevel < 1 ? 6 : 2)} - فوليوم امتصاص ${volRatio}x (≥ ${springVolMultiplier}x) وذيل رفض ${(lowerWickRatio * 100).toFixed(0)}%`,
      };
    }

    // 2. Wyckoff LPS (Last Point of Support / No Supply Test): Tested near Gann level, Low Volume (<= 0.85x), Bullish close
    const isLPSPrice = low1 <= (gannLevel + tolerance) && close1 >= gannLevel;
    const isLPSVol = vol1 <= avgVol * lpsVolMultiplier;
    const isLPSClose = close1 >= open1;

    if (isLPSPrice && isLPSVol && isLPSClose) {
      return {
        signal: 'WYCKOFF_LPS',
        patternName: '🛡️ نقطة دعم أخيرة وايكوف (Wyckoff LPS - اختبار جفاف العرض No Supply)',
        extremePrice: low1,
        isConfirmed: true,
        volumeRatio: volRatio,
        wickRatio: lowerWickRatio,
        description: `اختبار جفاف معروض البيع (No Supply) عند مستوى جان $${gannLevel.toFixed(gannLevel < 1 ? 6 : 2)} - فوليوم منخفض ${volRatio}x (≤ ${lpsVolMultiplier}x) وإغلاق صاعد`,
      };
    }
  } else {
    // 3. Wyckoff UTAD (Upthrust After Distribution): Price pushed above Gann level then closed back down, High volume (>= 1.30x), Upper wick >= 35%
    const isUTADPrice = high1 > (gannLevel + tolerance) && close1 <= (gannLevel + (tolerance * 0.5));
    const isUTADVol = vol1 >= avgVol * springVolMultiplier;
    const isUTADWick = upperWickRatio >= minWickRatio;

    if (isUTADPrice && isUTADVol && isUTADWick) {
      return {
        signal: 'WYCKOFF_UTAD',
        patternName: '💥 وايكوف يو-تاد (Wyckoff UTAD - اختراق كاذب وتصريف مؤسسي)',
        extremePrice: high1,
        isConfirmed: true,
        volumeRatio: volRatio,
        wickRatio: upperWickRatio,
        description: `توزيع وتصريف سيولة هابط عند مستوى جان $${gannLevel.toFixed(gannLevel < 1 ? 6 : 2)} - فوليوم بيع عالي ${volRatio}x وذيل علوي ${(upperWickRatio * 100).toFixed(0)}%`,
      };
    }

    // 4. Wyckoff LPSY (Last Point of Supply / No Demand Test): Tested near Gann level, Low volume (<= 0.85x), Bearish close
    const isLPSYPrice = high1 >= (gannLevel - tolerance) && close1 <= gannLevel;
    const isLPSYVol = vol1 <= avgVol * lpsVolMultiplier;
    const isLPSYClose = close1 <= open1;

    if (isLPSYPrice && isLPSYVol && isLPSYClose) {
      return {
        signal: 'WYCKOFF_LPSY',
        patternName: '🛡️ نقطة عرض أخيرة وايكوف (Wyckoff LPSY - اختبار جفاف الطلب No Demand)',
        extremePrice: high1,
        isConfirmed: true,
        volumeRatio: volRatio,
        wickRatio: upperWickRatio,
        description: `اختبار جفاف قوى الشراء (No Demand) عند مستوى جان $${gannLevel.toFixed(gannLevel < 1 ? 6 : 2)} - فوليوم جفاف ${volRatio}x (≤ ${lpsVolMultiplier}x) وإغلاق هابط`,
      };
    }
  }

  return {
    signal: 'WYCKOFF_NONE',
    patternName: 'مستوى جان عادي (Standard Gann Level)',
    extremePrice: 0,
    isConfirmed: false,
    volumeRatio: volRatio,
    wickRatio: Math.max(lowerWickRatio, upperWickRatio),
    description: 'لا يتطابق السلوك الحالي مع أنماط وايكوف الحصرية الأربعة (Spring/LPS/UTAD/LPSY)',
  };
}

/**
 * 6. فحص ميل المتوسط المتحرك 200 EMA (IsTrendSlopeHealthy)
 * Matching MQL5 V41.00 Enterprise Protection Shield Core
 */
export function isTrendSlopeHealthy(
  emaValues: number[],
  isLong: boolean,
  price: number,
  minSlopePoints: number = 2.0
): {
  isHealthy: boolean;
  slopePoints: number;
  directionOk: boolean;
  description: string;
} {
  const n = emaValues.length;
  if (n < 5) return { isHealthy: true, slopePoints: 0, directionOk: true, description: 'بيانات غير كافية لفحص ميل EMA' };

  const currentEma = emaValues[n - 1]; // bar[0]
  const prevEma5 = emaValues[n - 5];   // bar[4] (5 bars ago)
  const diff = currentEma - prevEma5;

  const pointUnit = price > 500 ? 1.0 : price > 5 ? 0.01 : 0.0001;
  const slopeDistance = Math.abs(diff) / pointUnit;

  const directionOk = isLong ? (currentEma > prevEma5) : (currentEma < prevEma5);
  const isHealthy = slopeDistance >= minSlopePoints && directionOk;

  const description = directionOk
    ? (isHealthy
        ? `ميل اتجاهي صحي قوي (${isLong ? 'صاعد ↗' : 'هابط ↘'} بمقدار ${slopeDistance.toFixed(1)} نقطة ≥ ${minSlopePoints})`
        : `ميل أفقي ضعيف (${slopeDistance.toFixed(1)} نقطة < الحد الأدنى ${minSlopePoints})`)
    : `ميل معاكس لاتجاه الصفقة (${isLong ? 'EMA هابط للأسفل' : 'EMA صاعد للأعلى'})`;

  return { isHealthy, slopePoints: slopeDistance, directionOk, description };
}

/**
 * 7. حساب وقف الخسارة الهيكلي المؤسسي (CalculateStructuralSL)
 * Priority: Wyckoff Extreme Point -> Gann Swing Anchor -> ATR Fallback
 * Enhanced with Anti-Stop-Hunt Liquidity Buffer to protect against wick sweeps
 */
export function calculateStructuralSL(
  isLong: boolean,
  entryPrice: number,
  riskDistFallback: number,
  symbolATR: number,
  anchorPrice?: number,
  wyckoffExtremePrice: number = 0,
  atrBufferMult: number = 1.0,
  enableAntiStopHunt: boolean = true
): {
  stopLoss: number;
  type: 'WYCKOFF_EXTREME' | 'GANN_SWING_ANCHOR' | 'ATR_FALLBACK';
  distance: number;
  description: string;
} {
  const minSafeRiskDist = Math.max(entryPrice * 0.005, symbolATR > 0 ? symbolATR * 1.0 : entryPrice * 0.005);
  const effectiveFallback = Math.max(minSafeRiskDist, riskDistFallback);
  const effectiveBufferMult = enableAntiStopHunt ? Math.max(1.0, atrBufferMult) : atrBufferMult;
  const atrBufferDist = symbolATR > 0 ? (symbolATR * effectiveBufferMult) : (entryPrice * (enableAntiStopHunt ? 0.004 : 0.002));

  // 1. Wyckoff Extreme Structural SL with Anti-Stop-Hunt Buffer
  if (wyckoffExtremePrice > 0) {
    const huntBuffer = enableAntiStopHunt
      ? Math.max(entryPrice * 0.0025, symbolATR > 0 ? symbolATR * 0.6 : entryPrice * 0.0025)
      : (entryPrice * 0.0008);
    const wyckoffSL = isLong ? (wyckoffExtremePrice - huntBuffer) : (wyckoffExtremePrice + huntBuffer);
    // For Long: SL MUST be strictly below entryPrice. For Short: SL MUST be strictly above entryPrice.
    const isDirectionValid = isLong ? (wyckoffSL < entryPrice - minSafeRiskDist * 0.4) : (wyckoffSL > entryPrice + minSafeRiskDist * 0.4);
    const dist = Math.abs(entryPrice - wyckoffSL);
    
    if (isDirectionValid && dist >= (minSafeRiskDist * 0.4) && dist <= (effectiveFallback * 2.5)) {
      return {
        stopLoss: wyckoffSL,
        type: 'WYCKOFF_EXTREME',
        distance: dist,
        description: `وقف خسارة هيكلي محصّن ضد اصطياد السيولة أسفل قاع/قمة وايكوف $${wyckoffExtremePrice.toFixed(entryPrice < 1 ? 6 : 2)} (هامش أمان ${((huntBuffer / entryPrice) * 100).toFixed(2)}%)`,
      };
    }
  }

  // 2. Gann Swing Anchor Structural SL with Anti-Stop-Hunt Buffer
  if (anchorPrice && anchorPrice > 0) {
    const calculatedSL = isLong ? (anchorPrice - atrBufferDist) : (anchorPrice + atrBufferDist);
    const isDirectionValid = isLong ? (calculatedSL < entryPrice - minSafeRiskDist * 0.4) : (calculatedSL > entryPrice + minSafeRiskDist * 0.4);
    const dist = Math.abs(entryPrice - calculatedSL);
    
    if (isDirectionValid && dist >= (minSafeRiskDist * 0.5) && dist <= (effectiveFallback * 2.5)) {
      return {
        stopLoss: calculatedSL,
        type: 'GANN_SWING_ANCHOR',
        distance: dist,
        description: `وقف خسارة هيكلي حول مرتكز سوينغ جان $${anchorPrice.toFixed(entryPrice < 1 ? 6 : 2)} مع حاجز ATR ممتد (${effectiveBufferMult}x ATR)`,
      };
    }
  }

  // 3. Fallback to Dynamic ATR
  const fallbackSL = isLong ? (entryPrice - effectiveFallback) : (entryPrice + effectiveFallback);
  return {
    stopLoss: fallbackSL,
    type: 'ATR_FALLBACK',
    distance: effectiveFallback,
    description: `وقف خسارة ديناميكي قياسي (ATR Fallback) محصّن بمقدار ${((effectiveFallback / entryPrice) * 100).toFixed(2)}%`,
  };
}

export { findMajorPivots, getLatestAnchorPoints } from './pivotDetector';


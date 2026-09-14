import { CandleData, MajorPivot, AnchorPointsResult } from '../types';
import { calcATR } from './technicalAnalysis';

/**
 * 1. خوارزمية تحديد القمم والقيعان الرئيسية آلياً على إطار 4 ساعات (Swing High / Swing Low Algorithm)
 * High[i] > max(High[i-N ... i-1]) AND High[i] > max(High[i+1 ... i+N])
 * Low[i] < min(Low[i-N ... i-1]) AND Low[i] < min(Low[i+1 ... i+N])
 *
 * @param candles4h قائمة شموع إطار 4 ساعات
 * @param leftBars عدد الشموع السابقة (افتراضي 5 = 20 ساعة)
 * @param rightBars عدد الشموع اللاحقة لتأكيد عدم إعادة الرسم (افتراضي 5 = 20 ساعة)
 * @param atrMultiplier مضاعف ATR للفلترة (افتراضي 2.0)
 */
export function findMajorPivots(
  candles4h: CandleData[],
  leftBars = 5,
  rightBars = 5,
  atrMultiplier = 2.0
): { pivotHighs: MajorPivot[]; pivotLows: MajorPivot[] } {
  const n = candles4h.length;
  const pivotHighs: MajorPivot[] = [];
  const pivotLows: MajorPivot[] = [];

  if (n < leftBars + rightBars + 5) {
    // Fallback if data length is short
    const highs = candles4h.map((c) => c.high);
    const lows = candles4h.map((c) => c.low);
    const maxH = Math.max(...highs);
    const minL = Math.min(...lows);
    const maxIdx = highs.lastIndexOf(maxH);
    const minIdx = lows.lastIndexOf(minL);

    if (maxIdx >= 0) {
      pivotHighs.push({
        type: 'HIGH',
        price: maxH,
        time: candles4h[maxIdx].time,
        formattedTime: new Date(candles4h[maxIdx].time).toISOString(),
        barIndex4h: maxIdx,
        isConfirmed: true,
      });
    }
    if (minIdx >= 0) {
      pivotLows.push({
        type: 'LOW',
        price: minL,
        time: candles4h[minIdx].time,
        formattedTime: new Date(candles4h[minIdx].time).toISOString(),
        barIndex4h: minIdx,
        isConfirmed: true,
      });
    }
    return { pivotHighs, pivotLows };
  }

  const atrValues = calcATR(
    candles4h.map((c) => c.high),
    candles4h.map((c) => c.low),
    candles4h.map((c) => c.close),
    14
  );

  // Scan through candles respecting left_bars and right_bars (No Repaint buffer)
  for (let i = leftBars; i < n - rightBars; i++) {
    const currentHigh = candles4h[i].high;
    const currentLow = candles4h[i].low;
    const currentAtr = atrValues[i] || candles4h[i].close * 0.015;

    // Check Swing High
    let isHigh = true;
    for (let k = i - leftBars; k < i; k++) {
      if (candles4h[k].high >= currentHigh) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      for (let k = i + 1; k <= i + rightBars; k++) {
        if (candles4h[k].high >= currentHigh) {
          isHigh = false;
          break;
        }
      }
    }

    if (isHigh) {
      // 2. ATR Deviation Retracement Check:
      // Price must retrace down from Swing High by at least (k * ATR) within the right_bars window
      const rightLows = candles4h.slice(i + 1, i + rightBars + 1).map((c) => c.low);
      const minRightLow = Math.min(...rightLows);
      const retraceDist = currentHigh - minRightLow;

      if (retraceDist >= atrMultiplier * currentAtr || retraceDist / currentHigh >= 0.015) {
        pivotHighs.push({
          type: 'HIGH',
          price: currentHigh,
          time: candles4h[i].time,
          formattedTime: new Date(candles4h[i].time).toLocaleString('ar-EG', { timeZone: 'UTC' }),
          barIndex4h: i,
          isConfirmed: true,
          atr4h: currentAtr,
        });
      }
    }

    // Check Swing Low
    let isLow = true;
    for (let k = i - leftBars; k < i; k++) {
      if (candles4h[k].low <= currentLow) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      for (let k = i + 1; k <= i + rightBars; k++) {
        if (candles4h[k].low <= currentLow) {
          isLow = false;
          break;
        }
      }
    }

    if (isLow) {
      // 2. ATR Deviation Retracement Check:
      // Price must bounce up from Swing Low by at least (k * ATR) within the right_bars window
      const rightHighs = candles4h.slice(i + 1, i + rightBars + 1).map((c) => c.high);
      const maxRightHigh = Math.max(...rightHighs);
      const bounceDist = maxRightHigh - currentLow;

      if (bounceDist >= atrMultiplier * currentAtr || bounceDist / currentLow >= 0.015) {
        pivotLows.push({
          type: 'LOW',
          price: currentLow,
          time: candles4h[i].time,
          formattedTime: new Date(candles4h[i].time).toLocaleString('ar-EG', { timeZone: 'UTC' }),
          barIndex4h: i,
          isConfirmed: true,
          atr4h: currentAtr,
        });
      }
    }
  }

  // If no confirmed pivots found under strict settings, fallback to the absolute high/low
  if (pivotHighs.length === 0) {
    const highs = candles4h.map((c) => c.high);
    const maxH = Math.max(...highs);
    const idx = highs.lastIndexOf(maxH);
    pivotHighs.push({
      type: 'HIGH',
      price: maxH,
      time: candles4h[idx].time,
      formattedTime: new Date(candles4h[idx].time).toISOString(),
      barIndex4h: idx,
      isConfirmed: true,
    });
  }

  if (pivotLows.length === 0) {
    const lows = candles4h.map((c) => c.low);
    const minL = Math.min(...lows);
    const idx = lows.lastIndexOf(minL);
    pivotLows.push({
      type: 'LOW',
      price: minL,
      time: candles4h[idx].time,
      formattedTime: new Date(candles4h[idx].time).toISOString(),
      barIndex4h: idx,
      isConfirmed: true,
    });
  }

  return { pivotHighs, pivotLows };
}

/**
 * 3. آلية المزامنة الزمنية واقتناص نقطة الصفر (Timestamp Mapping & 4H-to-5M Synchronizer)
 * تقوم بمطابقة القمة والقاع من إطار 4H مع بيانات 5M لتحديد الإحداثي الدقيق (P_0, T_0)
 *
 * @param candles4h شموع إطار 4 ساعات
 * @param candles5m شموع إطار 5 دقائق
 * @param leftBars قوة الجانب الأيسر (5)
 * @param rightBars قوة الجانب الأيمن (5)
 * @param atrMultiplier مضاعف ATR للفلترة (2.0)
 */
export function getLatestAnchorPoints(
  candles4h: CandleData[],
  candles5m: CandleData[],
  leftBars = 5,
  rightBars = 5,
  atrMultiplier = 2.0
): AnchorPointsResult {
  const { pivotHighs, pivotLows } = findMajorPivots(candles4h, leftBars, rightBars, atrMultiplier);

  const lastHigh4h = pivotHighs[pivotHighs.length - 1];
  const lastLow4h = pivotLows[pivotLows.length - 1];

  let startPivot: MajorPivot;
  let endPivot: MajorPivot;
  let waveDirection: 'BULLISH' | 'BEARISH';

  // Determine the most recent impulse wave direction
  if (lastHigh4h.time > lastLow4h.time) {
    // Wave is BULLISH from Low to High
    startPivot = { ...lastLow4h };
    endPivot = { ...lastHigh4h };
    waveDirection = 'BULLISH';
  } else {
    // Wave is BEARISH from High to Low
    startPivot = { ...lastHigh4h };
    endPivot = { ...lastLow4h };
    waveDirection = 'BEARISH';
  }

  // 3.b Precise Timestamp Mapping: Search inside 5M candles (48 candles per 4H)
  // to pinpoint the exact sub-candle containing the extreme price (P_0, T_exact)
  const fourHoursMs = 4 * 60 * 60 * 1000;
  const targetTimeWindowStart = endPivot.time;
  const targetTimeWindowEnd = endPivot.time + fourHoursMs;

  const subCandles5m = candles5m.filter(
    (c) => c.time >= targetTimeWindowStart && c.time <= targetTimeWindowEnd
  );

  let exactPrice = endPivot.price;
  let exactTime = endPivot.time;
  let exactBarIndex5m = candles5m.length - 1;

  if (subCandles5m.length > 0) {
    if (endPivot.type === 'HIGH') {
      let maxSubHigh = -Infinity;
      let targetCandle = subCandles5m[0];
      for (const sc of subCandles5m) {
        if (sc.high >= maxSubHigh) {
          maxSubHigh = sc.high;
          targetCandle = sc;
        }
      }
      exactPrice = maxSubHigh;
      exactTime = targetCandle.time;
    } else {
      let minSubLow = Infinity;
      let targetCandle = subCandles5m[0];
      for (const sc of subCandles5m) {
        if (sc.low <= minSubLow) {
          minSubLow = sc.low;
          targetCandle = sc;
        }
      }
      exactPrice = minSubLow;
      exactTime = targetCandle.time;
    }

    const idx = candles5m.findIndex((c) => c.time === exactTime);
    if (idx >= 0) exactBarIndex5m = idx;
  } else {
    // If 5M candles don't reach back that far, find nearest 5m candle or extrapolate
    const nearest5mIdx = candles5m.findIndex((c) => c.time >= endPivot.time);
    if (nearest5mIdx >= 0) {
      exactBarIndex5m = nearest5mIdx;
      exactTime = candles5m[nearest5mIdx].time;
    }
  }

  // Update endPivot with the exact 5M coordinate
  endPivot.price = exactPrice;
  endPivot.time = exactTime;
  endPivot.barIndex5m = exactBarIndex5m;

  // Calculate elapsed 5M bars from end_pivot exact time
  const matching5mCandles = candles5m.filter((c) => c.time >= endPivot.time);
  let barsElapsed5m = matching5mCandles.length;

  if (barsElapsed5m === 0 && candles5m.length > 0) {
    // Time delta fallback
    const last5mTime = candles5m[candles5m.length - 1].time;
    const timeDiffMs = Math.max(0, last5mTime - endPivot.time);
    barsElapsed5m = Math.max(1, Math.round(timeDiffMs / (5 * 60 * 1000)));
  }

  const waveRange = Math.abs(endPivot.price - startPivot.price);
  const atr4h = endPivot.atr4h || startPivot.atr4h || endPivot.price * 0.015;
  const atrFilterPassed = waveRange >= atrMultiplier * atr4h;

  return {
    startAnchor: startPivot,
    endAnchor: endPivot,
    waveDirection,
    waveRange,
    atrMultiplier,
    atr4h,
    atrFilterPassed,
    barsElapsed5m,
    exactZeroCoordinate: {
      price: exactPrice,
      timestamp: exactTime,
      barIndex5m: exactBarIndex5m,
    },
  };
}

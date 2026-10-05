/**
 * Institutional SMC & Volume Profile Engine
 * 
 * 1. Volume Profile: Real-time Point of Control (POC), Value Area High (VAH), Value Area Low (VAL).
 * 2. Session VWAP: Volume Weighted Average Price benchmark for institutional flow.
 * 3. ICT Trigger Engine: Liquidity Sweep + Market Structure Shift (MSS) + Fair Value Gap (FVG).
 * 4. Dynamic ATR Stop Loss: SL anchored to Sweep Low minus ATR volatility buffer.
 */

import { CandleData, VolumeProfileData, VolumeProfileBin, SessionVwapData, FairValueGap, SweepMssFvgData } from '../types';

/**
 * 1. Calculate Volume Profile (POC, VAH, VAL) from Candlestick Data
 */
export function calculateVolumeProfile(
  candles: CandleData[],
  currentPrice: number,
  gannLevelPrice?: number,
  binsCount = 32,
  valueAreaRatio = 0.70
): VolumeProfileData {
  if (!candles || candles.length < 5) {
    const p = currentPrice || 100;
    return {
      pocPrice: p,
      vahPrice: p * 1.01,
      valPrice: p * 0.99,
      isNearPOC: false,
      isNearVAL: false,
      isNearVAH: false,
      totalVolume: 0,
      valueAreaPercent: 70,
      confluenceDescription: 'بيانات الحجم غير كافية لبروفايل السيولة',
      bins: [],
    };
  }

  // Find price bounds across the lookback period
  let minP = Infinity;
  let maxP = -Infinity;
  let totalVol = 0;

  for (const c of candles) {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
    totalVol += (c.volume || 1);
  }

  if (maxP <= minP) {
    maxP = minP * 1.02;
  }

  const rangeP = maxP - minP;
  const binWidth = rangeP / binsCount;

  // Initialize bins
  const bins: VolumeProfileBin[] = [];
  for (let i = 0; i < binsCount; i++) {
    const midPrice = minP + (i + 0.5) * binWidth;
    bins.push({ price: midPrice, volume: 0, isPOC: false });
  }

  // Distribute volume into bins proportionally across each candle's spread
  for (const c of candles) {
    const cVol = c.volume || 1;
    const cLow = Math.max(minP, c.low);
    const cHigh = Math.min(maxP, c.high);
    const cSpread = Math.max(0.000001, cHigh - cLow);

    const startBinIdx = Math.max(0, Math.min(binsCount - 1, Math.floor((cLow - minP) / binWidth)));
    const endBinIdx = Math.max(0, Math.min(binsCount - 1, Math.floor((cHigh - minP) / binWidth)));

    const binsTouched = Math.max(1, endBinIdx - startBinIdx + 1);
    const volPerBin = cVol / binsTouched;

    for (let b = startBinIdx; b <= endBinIdx; b++) {
      bins[b].volume += volPerBin;
    }
  }

  // Find Point of Control (POC) - Bin with maximum volume
  let maxBinVol = -1;
  let pocIdx = Math.floor(binsCount / 2);

  for (let i = 0; i < binsCount; i++) {
    if (bins[i].volume > maxBinVol) {
      maxBinVol = bins[i].volume;
      pocIdx = i;
    }
  }

  bins[pocIdx].isPOC = true;
  const pocPrice = Number(bins[pocIdx].price.toFixed(currentPrice < 1 ? 6 : 2));

  // Determine Value Area (70% of total volume centered around POC)
  const targetVAVol = totalVol * valueAreaRatio;
  let accumulatedVol = bins[pocIdx].volume;
  let upperIdx = pocIdx;
  let lowerIdx = pocIdx;

  while (accumulatedVol < targetVAVol && (upperIdx < binsCount - 1 || lowerIdx > 0)) {
    const nextUpVol = upperIdx < binsCount - 1 ? bins[upperIdx + 1].volume : -1;
    const nextDownVol = lowerIdx > 0 ? bins[lowerIdx - 1].volume : -1;

    if (nextUpVol >= nextDownVol && upperIdx < binsCount - 1) {
      upperIdx++;
      accumulatedVol += bins[upperIdx].volume;
    } else if (lowerIdx > 0) {
      lowerIdx--;
      accumulatedVol += bins[lowerIdx].volume;
    } else if (upperIdx < binsCount - 1) {
      upperIdx++;
      accumulatedVol += bins[upperIdx].volume;
    } else {
      break;
    }
  }

  const vahPrice = Number(bins[upperIdx].price.toFixed(currentPrice < 1 ? 6 : 2));
  const valPrice = Number(bins[lowerIdx].price.toFixed(currentPrice < 1 ? 6 : 2));

  // Confluence detection
  const toleranceRatio = 0.0035; // 0.35% proximity
  const isNearPOC = Math.abs(currentPrice - pocPrice) / currentPrice <= toleranceRatio;
  const isNearVAL = Math.abs(currentPrice - valPrice) / currentPrice <= toleranceRatio;
  const isNearVAH = Math.abs(currentPrice - vahPrice) / currentPrice <= toleranceRatio;

  let confluenceDescription = '';
  if (gannLevelPrice && gannLevelPrice > 0) {
    const distToGannPOC = Math.abs(gannLevelPrice - pocPrice) / gannLevelPrice;
    const distToGannVAL = Math.abs(gannLevelPrice - valPrice) / gannLevelPrice;
    if (distToGannPOC <= 0.004) {
      confluenceDescription = `🎯 تطابق حجمي فائق: زاوية جان ($${gannLevelPrice.toFixed(2)}) متطابقة مع أعلى حجم تداول POC ($${pocPrice})`;
    } else if (distToGannVAL <= 0.004) {
      confluenceDescription = `🛡️ جدار دعم حجمي: زاوية جان متطابقة مع قاع منطقة القيمة VAL ($${valPrice})`;
    } else {
      confluenceDescription = `بروفايل الحجم: POC عند $${pocPrice} | VAL عند $${valPrice} | VAH عند $${vahPrice}`;
    }
  } else {
    confluenceDescription = isNearPOC
      ? `السعر يرتكز مباشرة على خط أعلى حجم تداول POC ($${pocPrice})`
      : isNearVAL
      ? `السعر يرتكز على قاع منطقة القيمة الحجمية VAL ($${valPrice})`
      : `نطاق القيمة الحجمية 70%: من $${valPrice} إلى $${vahPrice}`;
  }

  return {
    pocPrice,
    vahPrice,
    valPrice,
    isNearPOC,
    isNearVAL,
    isNearVAH,
    totalVolume: Number(totalVol.toFixed(0)),
    valueAreaPercent: 70,
    confluenceDescription,
    bins,
  };
}

/**
 * 2. Calculate Session VWAP (Volume Weighted Average Price) & Standard Deviation Bands
 */
export function calculateSessionVwap(
  candles: CandleData[],
  currentPrice: number
): SessionVwapData {
  if (!candles || candles.length === 0) {
    const p = currentPrice || 100;
    return {
      vwap: p,
      upperBand1: p * 1.008,
      upperBand2: p * 1.016,
      lowerBand1: p * 0.992,
      lowerBand2: p * 0.984,
      isAboveVwap: true,
      isBelowVwap: false,
      distToVwapPercent: 0,
      flowDirection: 'BULLISH_INSTITUTIONAL',
      description: 'بيانات غير كافية لحساب VWAP',
    };
  }

  // Filter candles from current intraday session (last 24 hours / up to 96 x 15M candles)
  const sessionCandles = candles.slice(-Math.min(candles.length, 96));

  let cumVol = 0;
  let cumVolPrice = 0;

  for (const c of sessionCandles) {
    const typPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumVol += vol;
    cumVolPrice += (typPrice * vol);
  }

  const vwap = cumVol > 0 ? cumVolPrice / cumVol : currentPrice;

  // Calculate Variance & Standard Deviation
  let cumSquaredDiff = 0;
  for (const c of sessionCandles) {
    const typPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumSquaredDiff += vol * Math.pow(typPrice - vwap, 2);
  }

  const variance = cumVol > 0 ? cumSquaredDiff / cumVol : 0;
  const stdDev = Math.sqrt(Math.max(0, variance));

  const upperBand1 = Number((vwap + stdDev).toFixed(currentPrice < 1 ? 6 : 2));
  const upperBand2 = Number((vwap + (2 * stdDev)).toFixed(currentPrice < 1 ? 6 : 2));
  const lowerBand1 = Number((vwap - stdDev).toFixed(currentPrice < 1 ? 6 : 2));
  const lowerBand2 = Number((vwap - (2 * stdDev)).toFixed(currentPrice < 1 ? 6 : 2));

  const distToVwapPercent = Number((((currentPrice - vwap) / vwap) * 100).toFixed(2));
  const isAboveVwap = currentPrice >= (vwap * 0.9995);
  const isBelowVwap = currentPrice < (vwap * 0.9995);

  const flowDirection: 'BULLISH_INSTITUTIONAL' | 'BEARISH_INSTITUTIONAL' | 'NEUTRAL' = 
    isAboveVwap ? 'BULLISH_INSTITUTIONAL' : 'BEARISH_INSTITUTIONAL';

  const description = isAboveVwap
    ? `تدفق مؤسسي صاعد: السعر ($${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}) أعلى الـ VWAP اليومي ($${vwap.toFixed(currentPrice < 1 ? 4 : 2)}) بفارق +${Math.abs(distToVwapPercent)}%`
    : `تدفق مؤسسي هابط: السعر ($${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}) أسفل الـ VWAP اليومي ($${vwap.toFixed(currentPrice < 1 ? 4 : 2)}) بفارق -${Math.abs(distToVwapPercent)}%`;

  return {
    vwap: Number(vwap.toFixed(currentPrice < 1 ? 6 : 2)),
    upperBand1,
    upperBand2,
    lowerBand1,
    lowerBand2,
    isAboveVwap,
    isBelowVwap,
    distToVwapPercent,
    flowDirection,
    description,
  };
}

/**
 * 3. Detect ICT Trigger: Liquidity Sweep + Market Structure Shift (MSS) + Fair Value Gap (FVG)
 */
export function detectSweepMssFvg(
  candles5m: CandleData[],
  targetDir: 'BUY' | 'SELL',
  gannLevel: number,
  atr15m: number,
  currentPrice: number
): SweepMssFvgData {
  const n = candles5m.length;
  const decimalPlaces = currentPrice < 1 ? 6 : 2;

  if (n < 8) {
    return {
      hasSweep: false,
      sweepLevel: gannLevel,
      sweepWickRatio: 0,
      hasMSS: false,
      mssBrokenLevel: 0,
      hasFVG: false,
      fvg: { type: 'NONE', top: 0, bottom: 0, mid: 0, sizePercent: 0, isMitigated: false, barIndex: 0 },
      isPatternComplete: false,
      recommendedEntry: currentPrice,
      dynamicAtrStopLoss: Number((targetDir === 'BUY' ? gannLevel - 1.25 * atr15m : gannLevel + 1.25 * atr15m).toFixed(decimalPlaces)),
      patternDescription: 'بيانات غير كافية لنموذج كنس السيولة والـ MSS',
    };
  }

  // 1. Sweep Detection: Inspect candles in the last 10 bars around gannLevel
  let hasSweep = false;
  let sweepLevel = targetDir === 'BUY' ? Infinity : -Infinity;
  let sweepWickRatio = 0;
  let sweepBarIdx = -1;

  // Recent swing low or gann level test
  const lookbackStart = Math.max(0, n - 12);
  for (let i = lookbackStart; i < n - 1; i++) {
    const c = candles5m[i];
    const spread = Math.max(0.000001, c.high - c.low);

    if (targetDir === 'BUY') {
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const wickRatio = lowerWick / spread;

      // Swiped below Gann level or previous lows with long rejection tail
      if (c.low <= gannLevel * 1.002 && wickRatio >= 0.28) {
        hasSweep = true;
        if (c.low < sweepLevel) {
          sweepLevel = c.low;
          sweepWickRatio = Number(wickRatio.toFixed(2));
          sweepBarIdx = i;
        }
      }
    } else {
      const upperWick = c.high - Math.max(c.open, c.close);
      const wickRatio = upperWick / spread;

      if (c.high >= gannLevel * 0.998 && wickRatio >= 0.28) {
        hasSweep = true;
        if (c.high > sweepLevel) {
          sweepLevel = c.high;
          sweepWickRatio = Number(wickRatio.toFixed(2));
          sweepBarIdx = i;
        }
      }
    }
  }

  if (!hasSweep || sweepLevel === Infinity || sweepLevel === -Infinity) {
    sweepLevel = gannLevel;
  }

  // 2. Market Structure Shift (MSS) Detection
  // Following the sweep, search for displacement candle breaking prior structure
  let hasMSS = false;
  let mssBrokenLevel = 0;
  let mssBarIndex = -1;

  if (targetDir === 'BUY') {
    // Find prior minor swing high before sweep
    let priorHigh = 0;
    const refStart = Math.max(0, sweepBarIdx - 5);
    for (let i = refStart; i < Math.max(refStart + 1, sweepBarIdx); i++) {
      if (candles5m[i] && candles5m[i].high > priorHigh) {
        priorHigh = candles5m[i].high;
      }
    }

    if (priorHigh === 0) {
      priorHigh = candles5m[Math.max(0, sweepBarIdx - 1)]?.high || currentPrice;
    }

    // Did any candle after the sweep close above priorHigh?
    for (let i = Math.max(0, sweepBarIdx); i < n; i++) {
      if (candles5m[i].close > priorHigh) {
        hasMSS = true;
        mssBrokenLevel = priorHigh;
        mssBarIndex = i;
        break;
      }
    }
  } else {
    let priorLow = Infinity;
    const refStart = Math.max(0, sweepBarIdx - 5);
    for (let i = refStart; i < Math.max(refStart + 1, sweepBarIdx); i++) {
      if (candles5m[i] && candles5m[i].low < priorLow) {
        priorLow = candles5m[i].low;
      }
    }

    if (priorLow === Infinity) {
      priorLow = candles5m[Math.max(0, sweepBarIdx - 1)]?.low || currentPrice;
    }

    for (let i = Math.max(0, sweepBarIdx); i < n; i++) {
      if (candles5m[i].close < priorLow) {
        hasMSS = true;
        mssBrokenLevel = priorLow;
        mssBarIndex = i;
        break;
      }
    }
  }

  // 3. Fair Value Gap (FVG) Detection
  let hasFVG = false;
  let fvg: FairValueGap = {
    type: 'NONE',
    top: 0,
    bottom: 0,
    mid: 0,
    sizePercent: 0,
    isMitigated: false,
    barIndex: 0,
  };

  const fvgSearchStart = Math.max(2, n - 6);
  for (let i = fvgSearchStart; i < n; i++) {
    const cPrev = candles5m[i - 2];
    const cCurr = candles5m[i];

    if (targetDir === 'BUY') {
      // Bullish FVG: Candle 1 High < Candle 3 Low (Gap between cPrev.high and cCurr.low)
      if (cCurr.low > cPrev.high) {
        hasFVG = true;
        const bottom = cPrev.high;
        const top = cCurr.low;
        const mid = (top + bottom) / 2;
        const sizePercent = Number((((top - bottom) / mid) * 100).toFixed(2));
        const isMitigated = currentPrice <= top && currentPrice >= bottom;

        fvg = {
          type: 'BULLISH_FVG',
          top: Number(top.toFixed(decimalPlaces)),
          bottom: Number(bottom.toFixed(decimalPlaces)),
          mid: Number(mid.toFixed(decimalPlaces)),
          sizePercent,
          isMitigated,
          barIndex: i,
        };
        break;
      }
    } else {
      // Bearish FVG: Candle 1 Low > Candle 3 High
      if (cCurr.high < cPrev.low) {
        hasFVG = true;
        const top = cPrev.low;
        const bottom = cCurr.high;
        const mid = (top + bottom) / 2;
        const sizePercent = Number((((top - bottom) / mid) * 100).toFixed(2));
        const isMitigated = currentPrice >= bottom && currentPrice <= top;

        fvg = {
          type: 'BEARISH_FVG',
          top: Number(top.toFixed(decimalPlaces)),
          bottom: Number(bottom.toFixed(decimalPlaces)),
          mid: Number(mid.toFixed(decimalPlaces)),
          sizePercent,
          isMitigated,
          barIndex: i,
        };
        break;
      }
    }
  }

  // 4. Dynamic ATR Stop Loss:
  // SL anchored to Sweep Low minus (1.25 x ATR_15M) for safe breathing room
  let dynamicAtrStopLoss: number;
  if (targetDir === 'BUY') {
    dynamicAtrStopLoss = sweepLevel - (1.25 * atr15m);
    // Safety: ensure SL is below entry and sweep level
    if (dynamicAtrStopLoss >= currentPrice) {
      dynamicAtrStopLoss = currentPrice - (1.25 * atr15m);
    }
  } else {
    dynamicAtrStopLoss = sweepLevel + (1.25 * atr15m);
    if (dynamicAtrStopLoss <= currentPrice) {
      dynamicAtrStopLoss = currentPrice + (1.25 * atr15m);
    }
  }

  // 5. Recommended Entry Trigger:
  // If FVG is active, entry is optimal at FVG retest (or current live market price if breaking through)
  let recommendedEntry = currentPrice;
  if (hasFVG && fvg.mid > 0) {
    if (targetDir === 'BUY' && currentPrice >= fvg.bottom && currentPrice <= fvg.top * 1.002) {
      recommendedEntry = Number(fvg.mid.toFixed(decimalPlaces));
    }
  }

  const isPatternComplete = (hasSweep || hasMSS) && (hasFVG || hasMSS);

  let patternDescription = '';
  if (hasSweep && hasMSS && hasFVG) {
    patternDescription = `⚡ نموذج مؤسسي ثلاثي مكتمل (Sweep + MSS + FVG): كنس سيولة عند $${sweepLevel.toFixed(decimalPlaces)}، كسر بنية السوق MSS عند $${mssBrokenLevel.toFixed(decimalPlaces)}، وفجوة FVG عند $${fvg.bottom}-$${fvg.top}`;
  } else if (hasSweep && hasMSS) {
    patternDescription = `🛡️ كنس سيولة وكسر هيكل (Sweep + MSS): كنس قاع السيولة عند $${sweepLevel.toFixed(decimalPlaces)} وتأكيد اندفاع المشتري المؤسسي`;
  } else if (hasMSS) {
    patternDescription = `تحول هيكل السوق (MSS): شمعة دافعة ابتلعت القمة السابقة ($${mssBrokenLevel.toFixed(decimalPlaces)}) تأكيداً للزخم`;
  } else {
    patternDescription = `سلوك السيولة: بانتظار اكتمال شمعة كنس السيولة أو كسر بنية السوق MSS`;
  }

  return {
    hasSweep,
    sweepLevel: Number(sweepLevel.toFixed(decimalPlaces)),
    sweepWickRatio,
    hasMSS,
    mssBrokenLevel: Number(mssBrokenLevel.toFixed(decimalPlaces)),
    mssBarIndex,
    hasFVG,
    fvg,
    isPatternComplete,
    recommendedEntry: Number(recommendedEntry.toFixed(decimalPlaces)),
    dynamicAtrStopLoss: Number(dynamicAtrStopLoss.toFixed(decimalPlaces)),
    patternDescription,
  };
}

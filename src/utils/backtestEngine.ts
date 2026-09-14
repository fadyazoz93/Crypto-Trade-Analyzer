/**
 * Historical Backtesting Engine for SOP 5/5 Strategy - Powered by OKX Market Data
 */

import { calcEMA, calcADX, calcRSI, calcBollingerBands, calcATR, calcMACD } from './technicalAnalysis';
import { fetchOkxCandles, toOkxInstId } from './okxApi';

export interface BacktestTrade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  result: 'TP1' | 'TP2' | 'SL' | 'EXPIRED';
  pnlPercent: number;
  sopScore: number;
}

export interface BacktestReport {
  symbol: string;
  periodDays: number;
  initialCapital: number;
  finalCapital: number;
  netProfitUsdt: number;
  roiPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  equityCurve: { time: string; equity: number }[];
  trades: BacktestTrade[];
}

interface OkxKline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchOkxKlines(symbol: string, interval: string, limit = 300): Promise<OkxKline[]> {
  const result = await fetchOkxCandles(symbol, interval, limit);

  if (!result || !result.candles || result.candles.length === 0) {
    throw new Error(`OKX API error for ${interval}`);
  }

  return result.candles;
}

export async function runHistoricalBacktest(
  symbol: string,
  periodDays = 30,
  initialCapital = 10000,
  options = { emaLength: 200, adxThreshold: 20, flexibleMode: false }
): Promise<BacktestReport> {
  // Fetch historical klines from OKX for multiple timeframes
  const klines15m = await fetchOkxKlines(symbol, '15m', 300);
  const klines1h = await fetchOkxKlines(symbol, '1h', 200);
  const klines4h = await fetchOkxKlines(symbol, '4h', 150);

  if (klines15m.length < 50 || klines1h.length < 20 || klines4h.length < 20) {
    throw new Error('بيانات السعر التاريخية من OKX غير كافية لإجراء الاختبار الرجعي.');
  }

  const closes15m = klines15m.map((k) => k.close);
  const highs15m = klines15m.map((k) => k.high);
  const lows15m = klines15m.map((k) => k.low);

  const closes1h = klines1h.map((k) => k.close);
  const highs1h = klines1h.map((k) => k.high);
  const lows1h = klines1h.map((k) => k.low);

  const closes4h = klines4h.map((k) => k.close);

  // Pre-calculate full indicator series
  const ema4h = calcEMA(closes4h, options.emaLength);
  const adx1hSeries = calcADX(highs1h, lows1h, closes1h, 14);
  const macd1h = calcMACD(closes1h);

  const bb15m = calcBollingerBands(closes15m, 20, 2);
  const rsi15m = calcRSI(closes15m, 14);
  const atr15m = calcATR(highs15m, lows15m, closes15m, 14);

  const trades: BacktestTrade[] = [];
  let currentCapital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdownUsdt = 0;

  const equityCurve: { time: string; equity: number }[] = [
    { time: new Date(klines15m[200].time).toLocaleDateString('ar-EG'), equity: initialCapital },
  ];

  const tradeRiskAlloc = 1000; // $1,000 fixed allocation per trade
  let inTrade = false;

  // Step bar-by-bar through 15M candles from index 200 onwards
  for (let i = 200; i < klines15m.length - 10; i++) {
    if (inTrade) continue;

    const candle = klines15m[i];
    const price = candle.close;
    const timeStr = new Date(candle.time).toLocaleString('ar-EG', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Map 15M index to approximate 1H & 4H indices
    const idx1h = Math.min(Math.floor((i / klines15m.length) * klines1h.length), klines1h.length - 1);
    const idx4h = Math.min(Math.floor((i / klines15m.length) * klines4h.length), klines4h.length - 1);

    const emaVal4h = ema4h[idx4h] || price;
    const adxVal1h = adx1hSeries[idx1h] || 25;
    const macdHist1h = macd1h.histogram[idx1h] || 0;

    const lowerBb15m = bb15m.lower[i] || price * 0.98;
    const upperBb15m = bb15m.upper[i] || price * 1.02;
    const rsiVal15m = rsi15m[i] || 50;
    const atrVal15m = atr15m[i] || price * 0.01;

    // Check SOP gates
    const gate0 = adxVal1h >= options.adxThreshold;
    const is4hBullish = price > emaVal4h;
    const is4hBearish = price < emaVal4h;

    const is1hBullish = macdHist1h > 0;
    const is1hBearish = macdHist1h < 0;

    const is15mBuyPullback = price <= lowerBb15m * 1.008 || rsiVal15m <= 42;
    const is15mSellPullback = price >= upperBb15m * 0.992 || rsiVal15m >= 58;

    let sopScoreBuy = 0;
    if (gate0) sopScoreBuy++;
    if (is4hBullish) sopScoreBuy++;
    if (is1hBullish) sopScoreBuy++;
    if (is15mBuyPullback) sopScoreBuy++;
    if (rsiVal15m < 65) sopScoreBuy++;

    let sopScoreSell = 0;
    if (gate0) sopScoreSell++;
    if (is4hBearish) sopScoreSell++;
    if (is1hBearish) sopScoreSell++;
    if (is15mSellPullback) sopScoreSell++;
    if (rsiVal15m > 35) sopScoreSell++;

    const reqScore = options.flexibleMode ? 4 : 5;
    const isBuySignal = sopScoreBuy >= reqScore;
    const isSellSignal = sopScoreSell >= reqScore;

    if (!isBuySignal && !isSellSignal) continue;

    const tradeType: 'BUY' | 'SELL' = isBuySignal ? 'BUY' : 'SELL';
    const activeScore = isBuySignal ? sopScoreBuy : sopScoreSell;

    const riskDist = atrVal15m * 1.8;
    const stopLoss = tradeType === 'BUY' ? price - riskDist : price + riskDist;
    const tp1 = tradeType === 'BUY' ? price + riskDist * 2.0 : price - riskDist * 2.0;
    const tp2 = tradeType === 'BUY' ? price + riskDist * 3.0 : price - riskDist * 3.0;

    // Simulate future bars to find exit
    inTrade = true;
    let exitBarResult: 'TP1' | 'TP2' | 'SL' | 'EXPIRED' = 'EXPIRED';
    let exitPrice = price;
    let exitTimeStr = timeStr;

    for (let j = i + 1; j < Math.min(i + 40, klines15m.length); j++) {
      const futureCandle = klines15m[j];
      const futureTimeStr = new Date(futureCandle.time).toLocaleString('ar-EG', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      if (tradeType === 'BUY') {
        if (futureCandle.high >= tp2) {
          exitBarResult = 'TP2';
          exitPrice = tp2;
          exitTimeStr = futureTimeStr;
          break;
        } else if (futureCandle.high >= tp1) {
          exitBarResult = 'TP1';
          exitPrice = tp1;
          exitTimeStr = futureTimeStr;
          break;
        } else if (futureCandle.low <= stopLoss) {
          exitBarResult = 'SL';
          exitPrice = stopLoss;
          exitTimeStr = futureTimeStr;
          break;
        }
      } else {
        if (futureCandle.low <= tp2) {
          exitBarResult = 'TP2';
          exitPrice = tp2;
          exitTimeStr = futureTimeStr;
          break;
        } else if (futureCandle.low <= tp1) {
          exitBarResult = 'TP1';
          exitPrice = tp1;
          exitTimeStr = futureTimeStr;
          break;
        } else if (futureCandle.high >= stopLoss) {
          exitBarResult = 'SL';
          exitPrice = stopLoss;
          exitTimeStr = futureTimeStr;
          break;
        }
      }
    }

    const diff = tradeType === 'BUY' ? exitPrice - price : price - exitPrice;
    const pnlPercent = (diff / price) * 100;
    const pnlUsdt = (pnlPercent / 100) * tradeRiskAlloc;

    currentCapital += pnlUsdt;
    if (currentCapital > peakCapital) {
      peakCapital = currentCapital;
    } else {
      const dd = peakCapital - currentCapital;
      if (dd > maxDrawdownUsdt) maxDrawdownUsdt = dd;
    }

    equityCurve.push({ time: exitTimeStr, equity: currentCapital });

    trades.push({
      id: `bt-${i}`,
      symbol,
      type: tradeType,
      entryTime: timeStr,
      exitTime: exitTimeStr,
      entryPrice: price,
      exitPrice,
      stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      result: exitBarResult,
      pnlPercent,
      sopScore: activeScore,
    });

    inTrade = false;
  }

  const winningTrades = trades.filter((t) => t.pnlPercent > 0);
  const losingTrades = trades.filter((t) => t.pnlPercent <= 0);

  const totalWinsUsdt = winningTrades.reduce((acc, t) => acc + (t.pnlPercent / 100) * tradeRiskAlloc, 0);
  const totalLossesUsdt = Math.abs(losingTrades.reduce((acc, t) => acc + (t.pnlPercent / 100) * tradeRiskAlloc, 0));

  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const profitFactor = totalLossesUsdt > 0 ? totalWinsUsdt / totalLossesUsdt : totalWinsUsdt > 0 ? 99 : 0;
  const roiPercent = ((currentCapital - initialCapital) / initialCapital) * 100;
  const maxDrawdownPercent = (maxDrawdownUsdt / peakCapital) * 100;

  return {
    symbol,
    periodDays,
    initialCapital,
    finalCapital: currentCapital,
    netProfitUsdt: currentCapital - initialCapital,
    roiPercent,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    profitFactor,
    maxDrawdownPercent,
    equityCurve,
    trades,
  };
}

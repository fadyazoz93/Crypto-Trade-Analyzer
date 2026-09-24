/**
 * 24/7 Background Market Scanner Daemon
 * Autonomous Server-side worker that scans OKX candlestick data,
 * evaluates Gann + Wyckoff + Sq9 (5 SOP Gates V41.00), logs signals to Turso Cloud,
 * and sends instant alerts to Telegram 24/7 without needing an open browser.
 */

import { analyzeMarketData, POPULAR_SYMBOLS } from '../src/utils/technicalAnalysis';
import { sendTelegramSignalDirect, sendTelegramTrailingStopUpdate } from '../api/telegram';
import { recordSignalDirect } from '../api/turso';
import { TradingMode } from '../src/types';
import { setServerStrategySettings } from '../src/utils/settingsStore';
import { fetchOkxTicker } from '../src/utils/okxApi';

export interface TrackedActiveTrade {
  symbol: string;
  decision: 'BUY' | 'SELL';
  entryPrice: number;
  initialStopLoss: number;
  currentStopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp4: number;
  targetPrice: number; // الهدف الأساسي للصفقة (Single TP / TP4)
  target50Price: number; // نقطة منتصف الصفقة 50% من الهدف
  atr: number; // قيمة الـ ATR (15m أو 5m) لحساب 1.5 ATR
  trigger1_5AtrPrice: number; // مستوى السعر عند تحقيق 1.5 ATR في اتجاه الصفقة
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  tp4Hit: boolean;
  halfway50Hit: boolean;
  trigger1_5AtrHit: boolean;
  highestPrice: number;
  lowestPrice: number;
  stage: 'INITIAL' | 'BREAKEVEN' | 'LOCK_PROFIT_0_5R' | 'TRAILING_LOCK_1' | 'TRAILING_LOCK_2' | 'TRAILING_50_LOCK' | 'CLOSED';
  lastTrailingNotifyAt?: number;
  createdAt: number;
}

export interface ScannerDaemonStatus {
  isActive: boolean;
  isScanning: boolean;
  intervalSeconds: number;
  tradingMode: TradingMode;
  minSopScore: number;
  totalScans: number;
  signalsDispatched: number;
  lastScanTime: string | null;
  lastScanDurationMs: number;
  symbolsCount: number;
  symbols: string[];
  lastSignals: Array<{
    symbol: string;
    decision: 'BUY' | 'SELL';
    price: number;
    sopScore: number;
    timestamp: string;
    reason: string;
    trade_setup?: any;
    telegramSent: boolean;
  }>;
  lastError: string | null;
}

class BackgroundScannerDaemon {
  private isActive: boolean = true;
  private isScanning: boolean = false;
  private intervalSeconds: number = 60; // scan every 60 seconds
  private tradingMode: TradingMode = 'INTRADAY';
  private minSopScore: number = 4; // 4/5 and 5/5 SOP Gates supported (V41.00 Enterprise Protection Shield)
  private symbols: string[] = POPULAR_SYMBOLS.map((s) => s.symbol);
  private timerId: NodeJS.Timeout | null = null;
  private totalScans: number = 0;
  private signalsDispatched: number = 0;
  private lastScanTime: string | null = null;
  private lastScanDurationMs: number = 0;
  private lastSignals: Array<{
    symbol: string;
    decision: 'BUY' | 'SELL';
    price: number;
    sopScore: number;
    timestamp: string;
    reason: string;
    trade_setup?: any;
    telegramSent: boolean;
  }> = [];
  private activeTrades: Map<string, TrackedActiveTrade> = new Map();
  private lastError: string | null = null;

  constructor() {
    // Synchronize backend strategy settings to match daemon minSopScore (4/5 & 5/5)
    setServerStrategySettings({
      sopScoreNeeded: 4,
      flexibleMode: true,
    });

    // Ensure primary high-liquidity symbols are always in list
    if (this.symbols.length === 0) {
      this.symbols = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT',
        'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'BNBUSDT',
        'LINKUSDT', 'SUIUSDT', 'PEPEUSDT', 'NEARUSDT'
      ];
    }
  }

  public start() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    this.isActive = true;
    console.log(`\n=============================================================`);
    console.log(`🤖 [24/7 Scanner Daemon] Initialized & Active`);
    console.log(`⏱️ Scan Interval: ${this.intervalSeconds}s | Mode: ${this.tradingMode} | Symbols: ${this.symbols.length}`);
    console.log(`🎯 Min SOP Gate Threshold: ${this.minSopScore}/5 Gates`);
    console.log(`=============================================================\n`);

    // Run first scan after a short delay (10s) to allow server startup
    setTimeout(() => {
      if (this.isActive) {
        this.runScanCycle().catch((err) => {
          console.error(`[24/7 Scanner] Initial cycle error:`, err);
        });
      }
    }, 10000);

    // Schedule regular scan cycles
    this.timerId = setInterval(() => {
      if (this.isActive && !this.isScanning) {
        this.runScanCycle().catch((err) => {
          console.error(`[24/7 Scanner] Cycle error:`, err);
        });
      }
    }, this.intervalSeconds * 1000);
  }

  public stop() {
    this.isActive = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    console.log(`⏸️ [24/7 Scanner Daemon] Paused by user request.`);
  }

  public setIntervalSeconds(sec: number) {
    if (sec < 15) sec = 15;
    this.intervalSeconds = sec;
    if (this.isActive) {
      this.start(); // restart with new interval
    }
  }

  public setTradingMode(mode: TradingMode) {
    this.tradingMode = mode;
  }

  public setMinSopScore(score: number) {
    const validScore = score >= 5 ? 5 : 4;
    this.minSopScore = validScore;
    setServerStrategySettings({
      sopScoreNeeded: validScore,
      flexibleMode: validScore === 4,
    });
  }

  public setSymbols(newSymbols: string[]) {
    if (Array.isArray(newSymbols) && newSymbols.length > 0) {
      const unique = Array.from(
        new Set(newSymbols.map((s) => s.replace(/[-_ /]/g, '').trim().toUpperCase()))
      );
      this.symbols = unique;
    }
  }

  public async runScanCycle(): Promise<{ scanned: number; signals: number }> {
    if (this.isScanning) {
      return { scanned: 0, signals: 0 };
    }

    this.isScanning = true;
    const startTime = Date.now();
    let detectedSignals = 0;
    const symbolsToScan = Array.from(
      new Set(this.symbols.map((s) => s.replace(/[-_ /]/g, '').trim().toUpperCase()))
    );

    try {
      const nowStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      console.log(`[24/7 Scanner ${nowStr}] 🔍 Scanning ${symbolsToScan.length} pairs across 5 SOP Gates...`);

      // Process in batches of 3 to avoid OKX public rate limits
      const batchSize = 3;
      for (let i = 0; i < symbolsToScan.length; i += batchSize) {
        if (!this.isActive) break; // abort if stopped mid-cycle

        const batch = symbolsToScan.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (symbol) => {
            try {
              const analysis = await analyzeMarketData(symbol, this.tradingMode);
              const sop = analysis.confluenceMatrix?.sopScore 
                ?? analysis.indicators.sopScore 
                ?? (analysis.confluenceMatrix ? Math.round((analysis.confluenceMatrix.totalScore / 100) * 5) : 0);

              // Check if decision is actionable and meets minimum SOP confirmation gates
              if ((analysis.decision === 'BUY' || analysis.decision === 'SELL') && sop >= this.minSopScore) {
                // فلتر المسافة السعرية (Entry Proximity Gate): تجنب الإشارات التي يكون السعر الحالي فيها قد ابتعد كثيراً عن نقطة الدخول المحددة (> 1.2%)
                const entryDistPct = Math.abs(analysis.trade_setup?.entryDistancePercent ?? 0);
                if (analysis.trade_setup?.entry_type === 'LIMIT' && entryDistPct > 1.2) {
                  console.log(
                    `   ⏸️ [Entry Proximity Gate] ${symbol}: السعر الحالي يبتعد بنسبة ${entryDistPct}% عن نقطة الدخول المعلقة (المسموح <= 1.2%). تم تأجيل الإشعار لحين ارتداد السعر بالقرب من الدعم/المقاومة.`
                  );
                  return;
                }

                detectedSignals++;
                this.signalsDispatched++;

                console.log(
                  `\n🎯 [24/7 Scanner FOUND SIGNAL] ${analysis.decision === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${symbol} @ $${analysis.indicators.price} (SOP: ${sop}/5)`
                );

                // 1. Dispatch signal directly to Telegram bot with Quad Exit Ladder & Platform Clarity
                const teleRes = await sendTelegramSignalDirect({
                  symbol,
                  decision: analysis.decision,
                  price: analysis.indicators.price,
                  entryPrice: analysis.trade_setup?.entry_price,
                  entryType: analysis.trade_setup?.entry_type,
                  entryDistancePercent: analysis.trade_setup?.entryDistancePercent,
                  stopLoss: analysis.trade_setup?.stop_loss,
                  takeProfit: analysis.trade_setup?.take_profit || analysis.trade_setup?.take_profit_4,
                  takeProfit1: analysis.trade_setup?.take_profit_1,
                  takeProfit2: analysis.trade_setup?.take_profit_2,
                  takeProfit3: analysis.trade_setup?.take_profit_3,
                  takeProfit4: analysis.trade_setup?.take_profit_4,
                  target50PercentPrice: analysis.trade_setup?.target50PercentPrice,
                  riskRewardRatio: analysis.trade_setup?.risk_reward_ratio,
                  sopScore: sop,
                  reason: analysis.reason,
                  source: 'DAEMON_SCANNER',
                  timeframe: '15M / 1H',
                  force: false, // will deduplicate if sent within last 45 min
                });

                if (teleRes.duplicate) {
                  console.log(`   ℹ️ Telegram: Skipped duplicate notification (already sent recently).`);
                } else if (teleRes.success) {
                  console.log(`   ✈️ Telegram: Signal successfully delivered to Telegram Bot!`);
                } else {
                  console.warn(`   ⚠️ Telegram dispatch warning: ${teleRes.error}`);
                }

                // 2. Persist signal to Turso Cloud DB (skip if duplicate within notification window)
                if (!teleRes.duplicate) {
                  try {
                    await recordSignalDirect({
                      symbol,
                      decision: analysis.decision,
                      price: analysis.indicators.price,
                      reason: analysis.reason,
                      trade_setup: analysis.trade_setup,
                      sop_score: sop,
                    });
                    console.log(`   ☁️ Turso: Signal logged to Turso Cloud database.`);
                  } catch (dbErr) {
                    console.warn(`   ⚠️ Turso DB logging error:`, dbErr);
                  }
                }

                // 3. Keep in local circular history (deduplicate by symbol to avoid repeated cards for the same asset)
                this.lastSignals = this.lastSignals.filter((s) => s.symbol !== symbol);
                this.lastSignals.unshift({
                  symbol,
                  decision: analysis.decision,
                  price: analysis.indicators.price,
                  sopScore: sop,
                  timestamp: new Date().toISOString(),
                  reason: analysis.reason || 'إشارة فنية متطابقة مع مصفوفة جان ووايكوف',
                  trade_setup: analysis.trade_setup,
                  telegramSent: teleRes.success && !teleRes.duplicate,
                });

                if (this.lastSignals.length > 25) {
                  this.lastSignals.pop();
                }

                // 4. تسجيل الصفقة في مراقب التريلنج ستوب (Trailing Stop Monitor)
                if (analysis.trade_setup && analysis.trade_setup.entry_price && analysis.trade_setup.stop_loss) {
                  const ts = analysis.trade_setup;
                  const curPrice = analysis.indicators.price;
                  const tpVal = ts.take_profit || ts.take_profit_4 || ts.take_profit_1;
                  const isBuyTrade = analysis.decision === 'BUY';
                  const entryP = ts.entry_price;

                  // حساب نقطة الـ 50% من مشوار الصفقة نحو الهدف (Midpoint to Target)
                  const target50 = isBuyTrade
                    ? entryP + (tpVal - entryP) * 0.5
                    : entryP - (entryP - tpVal) * 0.5;

                  // حساب قيمة الـ ATR (15m أو 5m) لحساب 1.5 ATR بدقة
                  const atrVal = ts.atr15m || ts.atrValue || Math.abs(entryP - ts.stop_loss) * 0.5;
                  // نقطة انطلاق التنبيه والتحريك: عند وصول السعر إلى 1.5 ATR في اتجاه الصفقة
                  const trigger1_5Atr = isBuyTrade
                    ? entryP + (1.5 * atrVal)
                    : entryP - (1.5 * atrVal);

                  const decimalP = curPrice < 1 ? 6 : curPrice < 10 ? 3 : 2;

                  this.activeTrades.set(symbol, {
                    symbol,
                    decision: analysis.decision,
                    entryPrice: entryP,
                    initialStopLoss: ts.stop_loss,
                    currentStopLoss: ts.stop_loss,
                    tp1: ts.take_profit_1 || tpVal,
                    tp2: ts.take_profit_2 || tpVal,
                    tp3: ts.take_profit_3 || tpVal,
                    tp4: ts.take_profit_4 || ts.take_profit || tpVal,
                    targetPrice: tpVal,
                    target50Price: Number(target50.toFixed(decimalP)),
                    atr: atrVal,
                    trigger1_5AtrPrice: Number(trigger1_5Atr.toFixed(decimalP)),
                    tp1Hit: false,
                    tp2Hit: false,
                    tp3Hit: false,
                    tp4Hit: false,
                    halfway50Hit: false,
                    trigger1_5AtrHit: false,
                    highestPrice: curPrice,
                    lowestPrice: curPrice,
                    stage: 'INITIAL',
                    lastTrailingNotifyAt: 0,
                    createdAt: Date.now(),
                  });
                }
              }
            } catch (symErr: any) {
              // individual symbol error (e.g. temporary timeout) - don't crash whole cycle
            }
          })
        );

        // Friendly delay between batches (350ms)
        if (i + batchSize < symbolsToScan.length) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      // فحص وتحديث الصفقات المفتوحة لعمل Stop Trailing ونقل الوقف للدخول أو حجز الأرباح
      await this.processTrailingStopUpdates();

      this.totalScans++;
      this.lastScanTime = new Date().toISOString();
      this.lastScanDurationMs = Date.now() - startTime;
      this.lastError = null;

      console.log(
        `[24/7 Scanner] ✅ Cycle finished in ${(this.lastScanDurationMs / 1000).toFixed(1)}s. Total Scans: ${this.totalScans} | Signals Found: ${detectedSignals}`
      );
    } catch (err: any) {
      this.lastError = err.message || 'Unknown scanner error';
      console.error(`[24/7 Scanner] Cycle failed:`, err);
    } finally {
      this.isScanning = false;
    }

    return { scanned: symbolsToScan.length, signals: detectedSignals };
  }

  /**
   * محرك مراقبة وتحديث الوقف المتحرك (Automated Trailing Stop & Breakeven Engine)
   * يراقب حركة الأسعار اللحظية من OKX للصفقات النشطة، وعند وصول السعر إلى محطات الأهداف (TP1 / TP2 / TP3)،
   * يقوم فورياً بتحديث الوقف وإرسال إشعار تليجرام فوري للمتداول لتأمين الصفقة وحجز الأرباح.
   */
  private async processTrailingStopUpdates(): Promise<void> {
    if (this.activeTrades.size === 0) return;

    const now = Date.now();
    const maxAgeMs = 24 * 60 * 60 * 1000; // تنظيف الصفقات بعد 24 ساعة

    for (const [symbol, trade] of Array.from(this.activeTrades.entries())) {
      // إزالة الصفقات القديمة جداً
      if (now - trade.createdAt > maxAgeMs || trade.stage === 'CLOSED') {
        this.activeTrades.delete(symbol);
        continue;
      }

      try {
        const ticker = await fetchOkxTicker(symbol);
        if (!ticker || ticker.lastPrice <= 0) continue;

        const curPrice = ticker.lastPrice;
        const isBuy = trade.decision === 'BUY';
        const entry = trade.entryPrice;
        const riskDist = Math.abs(entry - trade.initialStopLoss);

        // تحديث أعلى/أدنى سعر تم الوصول إليه
        if (curPrice > trade.highestPrice) trade.highestPrice = curPrice;
        if (curPrice < trade.lowestPrice) trade.lowestPrice = curPrice;

        // 1. فحص إذا ضرب السعر وقف الخسارة الحالي -> إغلاق المتابعة
        if (isBuy && curPrice <= trade.currentStopLoss) {
          trade.stage = 'CLOSED';
          console.log(`[Trailing Stop] ${symbol} Hit Stop Loss ($${trade.currentStopLoss}). Closed tracking.`);
          this.activeTrades.delete(symbol);
          continue;
        } else if (!isBuy && curPrice >= trade.currentStopLoss) {
          trade.stage = 'CLOSED';
          console.log(`[Trailing Stop] ${symbol} Hit Stop Loss ($${trade.currentStopLoss}). Closed tracking.`);
          this.activeTrades.delete(symbol);
          continue;
        }

        // 2. فحص إذا ضرب الهدف النهائي TP4 (2.0R) -> إغلاق المتابعة بنجاح
        if (isBuy && curPrice >= trade.tp4) {
          trade.stage = 'CLOSED';
          console.log(`[Trailing Stop] ${symbol} Hit Final TP4 ($${trade.tp4}). Closed tracking with full profit!`);
          this.activeTrades.delete(symbol);
          continue;
        } else if (!isBuy && curPrice <= trade.tp4) {
          trade.stage = 'CLOSED';
          console.log(`[Trailing Stop] ${symbol} Hit Final TP4 ($${trade.tp4}). Closed tracking with full profit!`);
          this.activeTrades.delete(symbol);
          continue;
        }

        // حماية صارمة: منع إرسال أكثر من إشعار تعديل وقف لنفس العملة في نفس الوقت (نافذة تبريد 3 دقائق)
        const now = Date.now();
        const isThrottled = trade.lastTrailingNotifyAt && (now - trade.lastTrailingNotifyAt < 3 * 60 * 1000);
        if (isThrottled) {
          continue;
        }

        // 3. المرحلة الأولى: جني 50% كاش ونقل وقف الخسارة لسعر الدخول (Breakeven) عند وصول السعر إلى 50% من مشوار الهدف (أو TP1)
        const reachedTarget50 = isBuy ? curPrice >= trade.target50Price : curPrice <= trade.target50Price;
        const reachedTp1 = isBuy ? curPrice >= trade.tp1 : curPrice <= trade.tp1;

        if ((reachedTarget50 || reachedTp1) && trade.stage === 'INITIAL' && !trade.halfway50Hit && !trade.tp1Hit) {
          trade.halfway50Hit = true;
          trade.tp1Hit = true;
          trade.trigger1_5AtrHit = true;
          const oldSl = trade.currentStopLoss;

          // نقل الوقف إلى سعر الدخول (Breakeven) لمنح ما تبقى من الصفقة مساحة تنفس كاملة لامتصاص أي تصحيح
          const decimalPrecision = curPrice < 1 ? 6 : curPrice < 10 ? 3 : 2;
          const newSl = Number(entry.toFixed(decimalPrecision));

          // التأكد من أن الوقف يقع على الجانب الصحيح من السعر الحالي
          const isValidSl = isBuy ? newSl < curPrice : newSl > curPrice;
          const isBetterSl = isBuy ? newSl > oldSl : newSl < oldSl;

          if (isValidSl && isBetterSl) {
            trade.currentStopLoss = newSl;
            trade.stage = 'BREAKEVEN';
            trade.lastTrailingNotifyAt = now;

            console.log(`[Trailing Stop] 🛡️ ${symbol}: 50% Target / TP1 reached! Moving SL to Breakeven $${trade.currentStopLoss}`);
            await sendTelegramTrailingStopUpdate({
              symbol,
              decision: trade.decision,
              currentPrice: curPrice,
              entryPrice: entry,
              oldStopLoss: oldSl,
              newStopLoss: trade.currentStopLoss,
              tp1Price: trade.target50Price || trade.tp1 || curPrice,
              targetHitName: 'وصول السعر إلى 50% من مشوار الهدف',
              stage: 'BREAKEVEN',
              reason: 'وصل السعر بنجاح إلى 50% من مشوار الهدف، يرجى إغلاق 50% من العقود كاش ونقل وقف الخسارة لسعر الدخول لتأمين الصفقة بالكامل.',
            });
            continue;
          }
        }

        // 4. المرحلة الثانية: تحديث الأرباح ونقل الوقف إلى 1.0R عند وصول السعر إلى 1.5R
        // يُفعَّل عند تحقيق أرباح 1.5R لنقل وقف الخسارة إلى +1.0R ربح مؤكد
        const target1_5R = isBuy ? (entry + 1.5 * riskDist) : (entry - 1.5 * riskDist);
        const reached1_5R = isBuy ? curPrice >= target1_5R : curPrice <= target1_5R;

        if (reached1_5R && !trade.tp2Hit && (trade.stage === 'BREAKEVEN' || trade.stage === 'INITIAL' || trade.stage === 'LOCK_PROFIT_0_5R')) {
          trade.tp2Hit = true;
          const oldSl = trade.currentStopLoss;

          // نقل وقف الخسارة إلى +1.0R ربح مؤكد
          const lock1R = isBuy ? (entry + 1.0 * riskDist) : (entry - 1.0 * riskDist);
          const decimalPrecision = curPrice < 1 ? 6 : curPrice < 10 ? 3 : 2;
          const newSl = Number(lock1R.toFixed(decimalPrecision));

          const isValidSl = isBuy ? newSl < curPrice : newSl > curPrice;
          const isBetterSl = isBuy ? newSl > oldSl : newSl < oldSl;

          if (isValidSl && isBetterSl) {
            trade.currentStopLoss = newSl;
            trade.stage = 'TRAILING_LOCK_1';
            trade.lastTrailingNotifyAt = now;

            console.log(`[Trailing Stop] 🚀 ${symbol}: 1.5R reached! Trailing SL moved to +1.0R ($${trade.currentStopLoss})`);
            await sendTelegramTrailingStopUpdate({
              symbol,
              decision: trade.decision,
              currentPrice: curPrice,
              entryPrice: entry,
              oldStopLoss: oldSl,
              newStopLoss: trade.currentStopLoss,
              targetHitName: 'وصول السعر إلى 1.5R من الأرباح',
              stage: 'TRAILING_LOCK',
              reason: 'وصل السعر بنجاح إلى 1.5R من الأرباح، وتم رفع وقف الخسارة إلى 1.0R لحجز أرباح مؤكدة وحماية المكاسب.',
            });
            continue;
          }
        }

        // 5. المرحلة الثالثة: قفل أرباح ورفع الوقف لمستوى الهدف الأول (Lock Profit at TP1)
        // يُفعَّل عند تجاوز TP2 (+1.0R)
        const reachedTp2 = isBuy ? curPrice >= trade.tp2 : curPrice <= trade.tp2;
        if (reachedTp2 && (trade.stage === 'BREAKEVEN' || trade.stage === 'TRAILING_50_LOCK' || trade.stage === 'INITIAL') && !trade.tp2Hit) {
          const oldSl = trade.currentStopLoss;
          const newSl = trade.tp1; // حجز ربح الهدف الأول كوقف جديد
          const isValidSl = isBuy ? newSl < curPrice : newSl > curPrice;
          const isBetterSl = isBuy ? newSl > oldSl : newSl < oldSl;
          if (isValidSl && isBetterSl) {
            trade.currentStopLoss = Number(newSl.toFixed(curPrice < 1 ? 6 : 4));
            trade.stage = 'TRAILING_LOCK_1';
            trade.tp2Hit = true;
            trade.lastTrailingNotifyAt = now;

            console.log(`[Trailing Stop] 🚀 ${symbol}: Trailing SL locked at TP1 $${trade.currentStopLoss}`);
            await sendTelegramTrailingStopUpdate({
              symbol,
              decision: trade.decision,
              currentPrice: curPrice,
              entryPrice: entry,
              oldStopLoss: oldSl,
              newStopLoss: trade.currentStopLoss,
              targetHitName: 'الهدف الثاني TP2 (+1.0R)',
              stage: 'TRAILING_LOCK',
              reason: 'تم تحقيق الهدف الثاني بنجاح، وتم رفع وقف الخسارة إلى مستوى الهدف الأول (TP1) لضمان وحجز ربح إيجابي مضمون.',
            });
            continue;
          }
        }

        // 6. المرحلة الرابعة: رفع الوقف لمستوى الهدف الثاني (Lock Profit at TP2)
        // يُفعَّل عند تجاوز TP3 (+1.5R)
        const reachedTp3 = isBuy ? curPrice >= trade.tp3 : curPrice <= trade.tp3;
        if (reachedTp3 && (trade.stage === 'TRAILING_LOCK_1' || trade.stage === 'TRAILING_50_LOCK' || trade.stage === 'BREAKEVEN') && !trade.tp3Hit) {
          const oldSl = trade.currentStopLoss;
          const newSl = trade.tp2; // حجز ربح الهدف الثاني كوقف جديد
          const isValidSl = isBuy ? newSl < curPrice : newSl > curPrice;
          const isBetterSl = isBuy ? newSl > oldSl : newSl < oldSl;
          if (isValidSl && isBetterSl) {
            trade.currentStopLoss = Number(newSl.toFixed(curPrice < 1 ? 6 : 4));
            trade.stage = 'TRAILING_LOCK_2';
            trade.tp3Hit = true;
            trade.lastTrailingNotifyAt = now;

            console.log(`[Trailing Stop] 🚀 ${symbol}: Trailing SL locked at TP2 $${trade.currentStopLoss}`);
            await sendTelegramTrailingStopUpdate({
              symbol,
              decision: trade.decision,
              currentPrice: curPrice,
              entryPrice: entry,
              oldStopLoss: oldSl,
              newStopLoss: trade.currentStopLoss,
              targetHitName: 'الهدف الثالث TP3 (+1.5R)',
              stage: 'TRAILING_LOCK',
              reason: 'تم تحقيق الهدف الثالث بنجاح (+1.5R)، وتم رفع وقف الخسارة إلى مستوى الهدف الثاني (TP2) لتأمين الجزء الأكبر من الأرباح.',
            });
            continue;
          }
        }
      } catch (tradeErr) {
        // Silent recovery for individual trade checks
      }
    }
  }

  public getStatus(): ScannerDaemonStatus {
    return {
      isActive: this.isActive,
      isScanning: this.isScanning,
      intervalSeconds: this.intervalSeconds,
      tradingMode: this.tradingMode,
      minSopScore: this.minSopScore,
      totalScans: this.totalScans,
      signalsDispatched: this.signalsDispatched,
      lastScanTime: this.lastScanTime,
      lastScanDurationMs: this.lastScanDurationMs,
      symbolsCount: this.symbols.length,
      symbols: this.symbols,
      lastSignals: this.lastSignals,
      lastError: this.lastError,
    };
  }
}

// Global Singleton Instance
export const backgroundScannerDaemon = new BackgroundScannerDaemon();

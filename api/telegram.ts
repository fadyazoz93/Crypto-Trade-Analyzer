import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import { getTursoClient } from './turso';

const DEFAULT_BOT_TOKEN = '8747938142:AAFlRuWm8OpUxVENCMpsWl6rJNfk6yQ6JJc';
const DEFAULT_CHAT_ID = '-1004454999923';

export function getTelegramConfig() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN).trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID).trim();
  return { token, chatId };
}

async function sendTelegramMessage(text: string, customChatId?: string): Promise<{ ok: boolean; result?: any; error?: string }> {
  const { token, chatId: configuredChatId } = getTelegramConfig();
  const targetChatId = customChatId || configuredChatId;

  if (!token || !targetChatId) {
    return { ok: false, error: 'Telegram Bot Token or Chat ID not configured' };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();
    if (data.ok) {
      return { ok: true, result: data.result };
    } else {
      let errMsg = data.description || 'Telegram API rejected message';
      if (errMsg.includes('chat not found') || errMsg.includes('bot is not a member') || errMsg.includes('not enough rights')) {
        errMsg = 'يرجى التأكد من إضافة البوت (@crypto_trade_analyzer_bot) كـ مشرف (Admin) في القناة مع صلاحية "نشر الرسائل".';
      }
      return { ok: false, error: errMsg };
    }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network request failed' };
  }
}

async function getBotInfo(): Promise<{ ok: boolean; bot?: any; error?: string }> {
  const { token, chatId } = getTelegramConfig();
  if (!token) {
    return { ok: false, error: 'Token not configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();
    if (data.ok) {
      return { ok: true, bot: { ...data.result, targetChatId: chatId } };
    }
    return { ok: false, error: data.description };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// مهلة منع التكرار الصارمة: 60 دقيقة لنفس العملة والصفقة لمنع أي رسائل مكررة نهائياً
export const SERVER_DEDUP_WINDOW_MS = 60 * 60 * 1000; // 60 دقيقة = 3,600,000 ميلي ثانية

// Persistent Cross-Process Disk Cache:
// يحفظ سجل الإشارات المرسلة على القرص لمنع التكرار حتى لو تم فتح أكثر من نافذة CMD أو حدثت إعادة تشغيل
const DEDUP_FILE_PATH = path.join(process.cwd(), '.telegram_sent_cache.json');

function loadPersistentDiskCache(): Record<string, number> {
  try {
    if (fs.existsSync(DEDUP_FILE_PATH)) {
      const raw = fs.readFileSync(DEDUP_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch {
    // Ignore read/parse errors safely
  }
  return {};
}

function savePersistentDiskCache(key: string, timestamp: number) {
  try {
    const current = loadPersistentDiskCache();
    current[key] = timestamp;

    // Prune entries older than 3 hours
    const cutoff = Date.now() - 3 * 60 * 60 * 1000;
    for (const [k, v] of Object.entries(current)) {
      if (typeof v === 'number' && v < cutoff) {
        delete current[k];
      }
    }

    fs.writeFileSync(DEDUP_FILE_PATH, JSON.stringify(current, null, 2), 'utf-8');
  } catch {
    // Ignore disk write errors safely
  }
}

function removeFromDiskCache(key: string) {
  try {
    const current = loadPersistentDiskCache();
    delete current[key];
    fs.writeFileSync(DEDUP_FILE_PATH, JSON.stringify(current, null, 2), 'utf-8');
  } catch {}
}

// In-process memory locks & caches
const serverSentSignalsCache = new Map<string, number>();
const inFlightSignalLocks = new Set<string>();

// سجل منع تكرار رسائل تحريك الوقف (Stop Trailing) لنفس العملة
interface TrailingRecord {
  stage: string;
  newStopLoss: number;
  sentAt: number;
}
const inFlightTrailingLocks = new Set<string>();
const recentTrailingHistory = new Map<string, TrailingRecord>();
// مهلة فاصلة لا تقل عن 3 دقائق بين أي إشعارين لتحريك الوقف لنفس العملة لمنع الرسائل المتزامنة
const TRAILING_DEDUP_COOLDOWN_MS = 3 * 60 * 1000;

export function normalizeSymbolKey(sym: string): string {
  return String(sym || '')
    .trim()
    .toUpperCase()
    .replace(/[-_ /]/g, '');
}

export function formatNumberVal(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return 'غير محدد';
  if (typeof val === 'string') {
    const cleaned = val.replace(/^\$/, '').trim();
    const parsed = Number(cleaned);
    if (!isNaN(parsed)) val = parsed;
    else return val.startsWith('$') ? val : `$${val}`;
  }
  const num = Number(val);
  if (isNaN(num)) return String(val);
  if (num < 1 && num > 0) {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
  }
  if (num >= 10) {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (num >= 1) {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  if (Number.isInteger(num)) {
    return `$${num}`;
  }
  const str = num.toFixed(4).replace(/\.?0+$/, '');
  return `$${str}`;
}

export interface DirectSignalPayload {
  symbol?: string;
  decision?: 'BUY' | 'SELL';
  price?: number;
  entryPrice?: number;
  entryType?: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_LIMIT';
  entryDistancePercent?: number;
  stopLoss?: number;
  takeProfit?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  takeProfit3?: number;
  takeProfit4?: number;
  target50PercentPrice?: number;
  riskRewardRatio?: string;
  sopScore?: number;
  reason?: string;
  source?: string;
  force?: boolean;
  timeframe?: string;
  binancePrice?: number;
  exchangeSource?: string;
  trailingCallbackPercent?: number;
  trailingDeltaUsdt?: number;
}

/**
 * جلب سعر الرمز من منصة Binance لحظياً لتمكين المتداول من مطابقة السعر مع تطبيق بينانس
 */
async function fetchBinanceTickerPrice(symbol: string): Promise<number | null> {
  try {
    const cleanSym = symbol.replace(/[-_ /]/g, '').trim().toUpperCase();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${cleanSym}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.price) {
        const val = Number(data.price);
        if (!isNaN(val) && val > 0) return val;
      }
    }
  } catch {
    // Ignore Binance fetch failure gracefully
  }
  return null;
}

/**
 * Direct signal formatting and dispatch function - can be called directly by background scanner or API
 */
export async function sendTelegramSignalDirect(payload: DirectSignalPayload): Promise<{
  success: boolean;
  duplicate?: boolean;
  blocked?: boolean;
  message?: string;
  error?: string;
}> {
  const {
    symbol = 'UNKNOWN',
    price = 0,
    entryPrice,
    entryType,
    entryDistancePercent,
    stopLoss,
    takeProfit,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    takeProfit4,
    target50PercentPrice,
    riskRewardRatio,
    sopScore,
    reason,
    source = 'MANUAL_OR_SCANNER',
    force = false,
    timeframe = '15M / 1H',
    binancePrice,
  } = payload;

  const rawDecision = String(payload.decision || 'BUY').trim().toUpperCase();
  const decision: 'BUY' | 'SELL' = rawDecision === 'SELL' || rawDecision === 'SHORT' ? 'SELL' : 'BUY';

  const normalizedSymbol = normalizeSymbolKey(symbol);
  const cacheKey = `${normalizedSymbol}_${decision}`;

  // فحص صارم ومطلق: السماح بإرسال إشارات التوافق المؤسسي العالي (4/5 و 5/5)
  const actualSop = sopScore ?? (payload as any).sop_score ?? (payload as any).sop;
  if (actualSop !== undefined && actualSop !== null && Number(actualSop) < 4) {
    console.log(`[Telegram Blocked] Signal for ${normalizedSymbol} rejected: SOP score (${actualSop}/5) is below required 4/5.`);
    return {
      success: false,
      message: `Signal for ${normalizedSymbol} rejected: SOP score ${actualSop}/5 is below the required 4/5 confluence.`,
      error: `Signal for ${normalizedSymbol} rejected: SOP score ${actualSop}/5 is below required 4/5.`,
    };
  }

  // حماية صارمة: منع إرسال العملات الوهمية أو التجريبية (TEST) إلى القناة العامة
  if (normalizedSymbol.includes('TEST')) {
    console.log(`[Telegram Blocked] Test symbol ${normalizedSymbol} absorbed silently without sending to channel.`);
    return {
      success: true,
      message: 'Test symbol processed locally without dispatching to live Telegram channel.',
    };
  }

  // حماية إدارية: رفض أي إشارة غير مكتملة الأركان (تفتقر إلى وقف الخسارة SL أو الهدف TP)
  const finalTpCheck = takeProfit4 || takeProfit || (payload as any).take_profit_4 || (payload as any).take_profit || takeProfit2 || takeProfit1;
  if (!stopLoss || !finalTpCheck) {
    console.log(`[Telegram Blocked] Signal for ${normalizedSymbol} rejected: Incomplete trade setup (missing SL or TP).`);
    return {
      success: false,
      blocked: true,
      message: `Signal for ${normalizedSymbol} rejected: Incomplete trade setup (missing SL or TP).`,
      error: 'Signal must have valid Stop Loss and Take Profit levels.',
    };
  }

  const now = Date.now();
  const memSentAt = serverSentSignalsCache.get(cacheKey) || 0;
  const diskCache = loadPersistentDiskCache();
  const diskSentAt = diskCache[cacheKey] || 0;
  const lastSentAt = Math.max(memSentAt, diskSentAt);

  // 1. منع التكرار اللحظي المتوازي (Race Condition / In-Flight Mutex):
  if (!force && inFlightSignalLocks.has(cacheKey)) {
    console.log(`[Telegram Deduplication] Signal for ${normalizedSymbol} (${decision}) is currently in-flight. Skipping parallel dispatch.`);
    return {
      success: true,
      duplicate: true,
      message: `Signal for ${normalizedSymbol} is currently in-flight (parallel duplicate blocked).`,
    };
  }

  // 2. منع التكرار الزمني الشامل محلياً (ذاكرة العملية + القرص الصلب)
  if (!force && lastSentAt > 0 && (now - lastSentAt < SERVER_DEDUP_WINDOW_MS)) {
    const elapsedMinutes = Math.floor((now - lastSentAt) / 60000);
    console.log(`[Telegram Deduplication] Signal for ${normalizedSymbol} (${decision}) was already sent ${elapsedMinutes}m ago. Skipping duplicate across all windows/processes.`);
    return {
      success: true,
      duplicate: true,
      message: `Signal for ${normalizedSymbol} was already dispatched ${elapsedMinutes} minutes ago (deduplicated).`,
    };
  }

  // 3. منع التكرار السحابي الموحد عبر قاعدة بيانات Turso المشتركة (Cluster-wide Atomic Lease)
  // يضمن حجب التكرار قطعياً حتى لو كان هناك أكثر من سيرفر أو حاوية كونتینر أو متصفحات متزامنة
  const tursoClient = getTursoClient();
  if (tursoClient && !force) {
    try {
      const tursoRes = await tursoClient.execute({
        sql: `
          INSERT INTO telegram_dispatches (cache_key, symbol, decision, entry_price, stop_loss, take_profit, dispatched_at, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET
            entry_price = excluded.entry_price,
            stop_loss = excluded.stop_loss,
            take_profit = excluded.take_profit,
            dispatched_at = excluded.dispatched_at,
            source = excluded.source
          WHERE (? - telegram_dispatches.dispatched_at) >= ?;
        `,
        args: [
          cacheKey,
          normalizedSymbol,
          decision,
          Number(entryPrice ?? price) || null,
          Number(stopLoss) || null,
          Number(takeProfit || takeProfit4 || takeProfit1) || null,
          now,
          source || 'SERVER_DAEMON',
          now,
          SERVER_DEDUP_WINDOW_MS,
        ],
      });

      if (tursoRes.rowsAffected === 0) {
        // حجز الإشارة مرفوض سحابياً لأن حاوية أخرى أو عملية أخرى أرسلتها مؤخراً
        const queryRes = await tursoClient.execute({
          sql: `SELECT dispatched_at, source FROM telegram_dispatches WHERE cache_key = ? LIMIT 1`,
          args: [cacheKey],
        });
        const lastSent = Number(queryRes.rows[0]?.dispatched_at || 0);
        const origin = String(queryRes.rows[0]?.source || 'another_instance');
        const elapsedMinutes = Math.max(0, Math.floor((now - lastSent) / 60000));
        console.log(
          `[Turso Cluster Dedup] 🛑 Signal for ${normalizedSymbol} (${decision}) was already dispatched ${elapsedMinutes}m ago by ${origin}. BLOCKED across all cluster containers.`
        );
        serverSentSignalsCache.set(cacheKey, lastSent);
        savePersistentDiskCache(cacheKey, lastSent);
        return {
          success: true,
          duplicate: true,
          message: `Signal for ${normalizedSymbol} was already dispatched ${elapsedMinutes} minutes ago (cluster deduplicated).`,
        };
      }
    } catch (tursoErr) {
      console.warn('[Turso Cluster Dedup Warning] Proceeding with local guards:', tursoErr);
    }
  }

  // قفل المفتاح فوراً في الذاكرة وعلى القرص الثابت قبل إرسال الرسالة عبر الشبكة
  inFlightSignalLocks.add(cacheKey);
  serverSentSignalsCache.set(cacheKey, now);
  savePersistentDiskCache(cacheKey, now);

  try {
    const isBuy = decision === 'BUY';
    const header = isBuy ? '📈 🟢 إشارة شراء مؤكدة (BUY)' : '📉 🔴 إشارة بيع مؤكدة (SELL)';

    const numPrice = Number(price);
    const numEntry = Number(entryPrice ?? price);
    const formattedPrice = formatNumberVal(price);
    const formattedEntry = formatNumberVal(entryPrice ?? price);
    const formattedSl = formatNumberVal(stopLoss);

    // اختيار الهدف النهائي (TP2 - الهدف النهائي من الربح)
    const finalTp = takeProfit4 || takeProfit || (payload as any).take_profit_4 || (payload as any).take_profit || takeProfit2 || 0;
    const finalTpNum = Number(finalTp);

    // حساب أو تحديد الهدف الأول TP1 (50% من مشوار الأرباح لسحبها كاش بإغلاق 50% من العقد)
    let tp1Num = Number(
      target50PercentPrice ||
      payload.target50PercentPrice ||
      (payload as any).target_50_percent_price ||
      0
    );
    if ((!tp1Num || tp1Num <= 0) && numEntry > 0 && finalTpNum > 0) {
      tp1Num = isBuy
        ? numEntry + (finalTpNum - numEntry) * 0.5
        : numEntry - (numEntry - finalTpNum) * 0.5;
    }
    if ((!tp1Num || tp1Num <= 0) && takeProfit1) {
      tp1Num = Number(takeProfit1);
    }

    const formattedTp1 = formatNumberVal(tp1Num);
    const formattedFinalTp = formatNumberVal(finalTpNum > 0 ? finalTpNum : (takeProfit1 || price));

    // التحقق من نوع الأمر والمسافة بين السعر الحالي وسعر الدخول
    const calcGapPct = numPrice > 0 ? (((numPrice - numEntry) / numPrice) * 100) : 0;
    const effectiveGapPct = entryDistancePercent !== undefined ? Math.abs(entryDistancePercent) : Math.abs(Number(calcGapPct.toFixed(2)));
    const isLimitOrder = entryType === 'LIMIT' || Math.abs(calcGapPct) >= 0.05;

    // جلب سعر Binance الموازي لتسهيل المطابقة الفورية على مستخدمي تطبيق بينانس
    let parallelBinancePrice = binancePrice;
    if (parallelBinancePrice === undefined || parallelBinancePrice === null) {
      parallelBinancePrice = await fetchBinanceTickerPrice(normalizedSymbol) ?? undefined;
    }

    let executionTypeLine = '';
    if (isLimitOrder) {
      if (isBuy) {
        executionTypeLine = `📌 نوع التنفيذ: أمر شراء معلق (Limit Order) عند التصحيح`;
      } else {
        executionTypeLine = `📌 نوع التنفيذ: أمر بيع معلق (Limit Order) عند إعادة الاختبار`;
      }
    } else {
      executionTypeLine = `📌 نوع التنفيذ: دخول فوري (Market Entry) بالسعر الحالي`;
    }

    const parallelBinanceVal = (parallelBinancePrice && parallelBinancePrice > 0)
      ? formatNumberVal(parallelBinancePrice)
      : formattedPrice;

    const numSl = Number(stopLoss);
    const slDistPct = numEntry > 0 && numSl > 0 ? Math.abs(((numEntry - numSl) / numEntry) * 100) : 0;
    const formattedSlDist = slDistPct > 0 ? ` (${slDistPct.toFixed(2)}%)` : '';

    // حساب نسبة الـ Trailing Stop الديناميكية (من ATR 15M لكل عملة أو مشتقة من مسافة الوقف)
    let effectiveCallbackPct = payload.trailingCallbackPercent;
    if (!effectiveCallbackPct || effectiveCallbackPct <= 0) {
      if (slDistPct > 0) {
        effectiveCallbackPct = Math.max(0.40, Math.min(2.50, Number((slDistPct * 0.55).toFixed(2))));
      } else if (normalizedSymbol.includes('BTC')) {
        effectiveCallbackPct = 0.60;
      } else if (normalizedSymbol.includes('ETH')) {
        effectiveCallbackPct = 0.72;
      } else if (normalizedSymbol.includes('SOL')) {
        effectiveCallbackPct = 1.15;
      } else if (normalizedSymbol.includes('LINK')) {
        effectiveCallbackPct = 0.78;
      } else if (normalizedSymbol.includes('BNB')) {
        effectiveCallbackPct = 0.62;
      } else if (normalizedSymbol.includes('XRP')) {
        effectiveCallbackPct = 0.95;
      } else {
        effectiveCallbackPct = 0.85;
      }
    }
    const trailingDeltaUsdtVal = payload.trailingDeltaUsdt || (
      tp1Num > 0 ? Number((tp1Num * (effectiveCallbackPct / 100)).toFixed(numPrice < 1 ? 4 : 2)) : 0
    );
    const formattedTrailingDelta = trailingDeltaUsdtVal > 0 ? ` (أو ارتداد ${formatNumberVal(trailingDeltaUsdtVal)})` : '';

    const message = `${header}
════════════════════
🪙 العملة / الزوج: ${normalizedSymbol}
${executionTypeLine}
🎯 سعر الدخول المقترح: ${formattedEntry}
💵 السعر اللحظي (OKX): ${formattedPrice}
🔶 سعر Binance الموازي: ${parallelBinanceVal}
🎯 الهدف الأول (TP1): ${formattedTp1} (50% من الربح لسحبها كاش بإغلاق 50% من العقد)
🔄 الوقف المتحرك (Trailing Stop): نسبة ${effectiveCallbackPct}%${formattedTrailingDelta} تفعل تلقائياً بعد بلوغ TP1
🎯 الهدف الثاني (TP2): ${formattedFinalTp} (الهدف النهائي من الربح)
🛑 وقف الخسارة (SL): ${formattedSl}${formattedSlDist}
🛡️ إدارة المخاطر: حدد حجم العقد بحيث لا تتجاوز الخسارة 1% من رأس المال`;

    const result = await sendTelegramMessage(message);
    if (result.ok) {
      return { success: true, message: 'Signal dispatched to Telegram' };
    } else {
      // في حالة فشل الإرسال الشبكي، نحذف من الكاش وقاعدة البيانات للسماح بالمحاولة مرة أخرى
      serverSentSignalsCache.delete(cacheKey);
      removeFromDiskCache(cacheKey);
      if (tursoClient) {
        tursoClient.execute({
          sql: `DELETE FROM telegram_dispatches WHERE cache_key = ? AND dispatched_at = ?`,
          args: [cacheKey, now],
        }).catch(() => {});
      }
      return { success: false, error: result.error };
    }
  } finally {
    inFlightSignalLocks.delete(cacheKey);
  }
}

export interface TrailingStopUpdatePayload {
  symbol: string;
  decision: 'BUY' | 'SELL';
  currentPrice: number;
  entryPrice: number;
  oldStopLoss: number;
  newStopLoss: number;
  tp1Price?: number;
  targetHitName?: string; // e.g. "وصول السعر إلى 50% من مشوار الهدف" أو "1.5 ATR"
  stage: 'BREAKEVEN' | 'LOCK_PROFIT_0_5R' | 'TRAILING_LOCK' | 'TRAILING_50_LOCK';
  reason?: string;
  binancePrice?: number;
}

export interface EmergencyExitAlertPayload {
  symbol: string;
  decision: 'BUY' | 'SELL';
  currentPrice: number;
  entryPrice: number;
  currentStopLoss: number;
  btcPrice: number;
  btcDropPercent: number;
  reason: string;
}

const recentEmergencyAlerts = new Map<string, number>();

/**
 * إرسال تنبيه طوارئ للخروج السريع عند رصد هبوط مفاجئ في البيتكوين يهدد العملات البديلة
 */
export async function sendTelegramEmergencyExitAlert(payload: EmergencyExitAlertPayload): Promise<{ success: boolean; error?: string }> {
  const { symbol, decision, currentPrice, entryPrice, currentStopLoss, btcPrice, btcDropPercent, reason } = payload;
  const normalizedSymbol = normalizeSymbolKey(symbol);

  const now = Date.now();
  const lastSent = recentEmergencyAlerts.get(normalizedSymbol) || 0;
  // تبريد 20 دقيقة لنفس العملة لمنع إزعاج المتداول
  if (now - lastSent < 20 * 60 * 1000) {
    return { success: true };
  }
  recentEmergencyAlerts.set(normalizedSymbol, now);

  const isBuy = decision === 'BUY';
  const formattedCur = `$${currentPrice < 1 ? currentPrice.toFixed(4) : currentPrice.toFixed(2)}`;
  const formattedEntry = `$${entryPrice < 1 ? entryPrice.toFixed(4) : entryPrice.toFixed(2)}`;
  const formattedSl = `$${currentStopLoss < 1 ? currentStopLoss.toFixed(4) : currentStopLoss.toFixed(2)}`;
  const formattedBtc = `$${btcPrice.toLocaleString('en-US')}`;

  const message = `🚨 <b>تنبيه طوارئ: انزلاق حاد في البيتكوين (${btcDropPercent > 0 ? '-' : ''}${Math.abs(btcDropPercent).toFixed(2)}%)!</b>
════════════════════
🪙 <b>العملة المفتوحة:</b> ${symbol}
🧭 <b>نوع الصفقة الحالية:</b> ${isBuy ? '🟢 شراء (LONG)' : '🔴 بيع (SHORT)'}
════════════════════
📍 <b>سعر الدخول:</b> ${formattedEntry}
💵 <b>السعر الحالي:</b> ${formattedCur}
❌ <b>وقف الخسارة الأصلي:</b> ${formattedSl}
⚡ <b>سعر البيتكوين اللحظي:</b> ${formattedBtc}
════════════════════
⚠️ <b>السبب الفني:</b> ${reason}
💡 <b>الإجراء المقترح فوراً:</b>
1️⃣ يُنصح بالخروج اليدوي الفوري (Close Position) أو رفع وقف الخسارة لسعر الدخول.
2️⃣ هبوط البيتكوين المفاجئ يسحب العملات البديلة لموجات بيع قسرية، والخروج المبكر يوفر أكثر من 70% من خسارة الوقف الكامل!`;

  try {
    const result = await sendTelegramMessage(message);
    return { success: result.ok, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * إرسال إشعار تليجرام عند تعديل وقف الخسارة (Stop Trailing / Move SL to Entry or Profit)
 */
export async function sendTelegramTrailingStopUpdate(payload: TrailingStopUpdatePayload): Promise<{ success: boolean; error?: string }> {
  const {
    symbol,
    decision,
    currentPrice,
    entryPrice,
    oldStopLoss,
    newStopLoss,
    tp1Price,
    targetHitName = 'تحقيق هدف جزئي',
    stage,
    reason,
    binancePrice,
  } = payload;

  const normalizedSymbol = normalizeSymbolKey(symbol);
  const lockKey = `${normalizedSymbol}_TRAILING`;

  // 1. منع التكرار اللحظي المتزامن (In-Flight Race Condition Lock)
  if (inFlightTrailingLocks.has(lockKey)) {
    console.log(`[Trailing Dedup] Trailing update for ${normalizedSymbol} is currently in-flight. Skipping parallel duplicate.`);
    return { success: true };
  }

  const now = Date.now();
  const lastRecord = recentTrailingHistory.get(normalizedSymbol);
  if (lastRecord) {
    // 2. منع تكرار نفس المرحلة أو نفس وقف الخسارة تماماً لنفس العملة
    const isSameStage = lastRecord.stage === stage;
    const isSameSl = Math.abs(lastRecord.newStopLoss - newStopLoss) < 1e-6;
    if (isSameStage || isSameSl) {
      console.log(`[Trailing Dedup] Duplicate trailing update for ${normalizedSymbol} (${stage} / SL ${newStopLoss}) already sent. Skipping.`);
      return { success: true };
    }

    // 3. منع إرسال Breakeven إذا كانت الصفقة قد أرسلت بالفعل مرحلة أعلى (مثل 50% Trailing SL)
    if (stage === 'BREAKEVEN' && (lastRecord.stage === 'TRAILING_50_LOCK' || lastRecord.stage === 'TRAILING_LOCK')) {
      console.log(`[Trailing Dedup] Breakeven update for ${normalizedSymbol} blocked because higher lock (${lastRecord.stage}) was already sent.`);
      return { success: true };
    }

    // 4. منع إرسال رسائل متعددة لنفس العملة في نفس الوقت (نافذة تبريد 3 دقائق على الأقل)
    if (now - lastRecord.sentAt < TRAILING_DEDUP_COOLDOWN_MS) {
      const elapsedSec = Math.round((now - lastRecord.sentAt) / 1000);
      console.log(`[Trailing Dedup] Throttling trailing update for ${normalizedSymbol}: dispatched ${elapsedSec}s ago. Skipping simultaneous duplicate.`);
      return { success: true };
    }
  }

  inFlightTrailingLocks.add(lockKey);

  try {
    const isBuy = decision === 'BUY';
    let actualNewStopLoss = newStopLoss;

    // ضمان التوافق التام والقطعي مع حركة السعر والشارت:
    // في صفقات الشراء (LONG): يستحيل أن يكون الوقف أعلى من أو مساوياً للسعر الحالي
    if (isBuy && actualNewStopLoss >= currentPrice) {
      console.warn(`[Trailing Safety] Invariant violation: New SL ${actualNewStopLoss} >= currentPrice ${currentPrice} in BUY. Correcting below price.`);
      actualNewStopLoss = Number(Math.min(entryPrice, currentPrice * 0.997).toFixed(currentPrice < 1 ? 6 : currentPrice < 10 ? 3 : 2));
    }
    // في صفقات البيع (SHORT): يستحيل أن يكون الوقف أقل من أو مساوياً للسعر الحالي
    if (!isBuy && actualNewStopLoss <= currentPrice) {
      console.warn(`[Trailing Safety] Invariant violation: New SL ${actualNewStopLoss} <= currentPrice ${currentPrice} in SELL. Correcting above price.`);
      actualNewStopLoss = Number(Math.max(entryPrice, currentPrice * 1.003).toFixed(currentPrice < 1 ? 6 : currentPrice < 10 ? 3 : 2));
    }

    let parallelBinancePrice = binancePrice;
    if (parallelBinancePrice === undefined || parallelBinancePrice === null) {
      parallelBinancePrice = await fetchBinanceTickerPrice(normalizedSymbol) ?? undefined;
    }

    const isLockProfit = stage === 'LOCK_PROFIT_0_5R' || stage === 'BREAKEVEN' || stage === 'TRAILING_50_LOCK';

    // في تحديث الأمان عند 50% من الهدف، الوقف الجديد يكون دائماً سعر الدخول لحماية الصفقة ومنحها مساحة تنفس كاملة
    if (isLockProfit) {
      actualNewStopLoss = entryPrice;
    }

    const tp1Value = tp1Price && tp1Price > 0 ? tp1Price : currentPrice;
    const formattedTp1 = formatNumberVal(tp1Value);
    const formattedCurPrice = formatNumberVal(currentPrice);
    const formattedEntry = formatNumberVal(entryPrice);
    const formattedOldSl = formatNumberVal(oldStopLoss);
    const formattedNewSl = formatNumberVal(actualNewStopLoss);
    const parallelBinanceVal = (parallelBinancePrice && parallelBinancePrice > 0)
      ? formatNumberVal(parallelBinancePrice)
      : formattedCurPrice;

    const actionHeader = isLockProfit
      ? `🛡️ <b>تحديث أمان: جني 50% أرباح ونقل وقف الخسارة لسعر الدخول (Breakeven)</b>`
      : `🚀 <b>تحديث أرباح: حجز الأرباح وتعديل الوقف (Stop Trailing)</b>`;

    const statusBadge = isBuy ? `🟢 شراء (LONG)` : `🔴 بيع (SHORT)`;

    let message = '';
    if (isLockProfit) {
      message = `${actionHeader}
════════════════════
🪙 <b>العملة / الزوج:</b> <code>${normalizedSymbol}</code>
🧭 <b>نوع الصفقة:</b> ${statusBadge}
════════════════════
📍 <b>سعر الدخول:</b> ${formattedEntry}
💵 <b>السعر اللحظي (OKX):</b> ${formattedCurPrice}
🔶 <b>سعر Binance الموازي:</b> ${parallelBinanceVal}
════════════════════
🎯 <b>المستوى المحقق:</b> وصول السعر إلى 50% من مشوار الهدف
🎯 <b>سعر الهدف الأول (TP1):</b> <b>${formattedTp1}</b>
💰 <b>جني الأرباح الجزئي:</b> إغلاق 50% من العقود كاش الآن عند سعر TP1 (${formattedTp1})
❌ <b>وقف الخسارة السابق (Old SL):</b> ${formattedOldSl}
🚨 <b>وقف الخسارة الجديد للتعديل فوراً (New SL):</b> <b>${formattedNewSl} (سعر الدخول)</b>
🛡️ <b>إدارة المخاطر:</b> تم تأمين ربح نقدي وحماية ما تبقى من الصفقة مع ترك مساحة تنفس كاملة للتصحيح نحو الهدف النهائي.`;
    } else {
      message = `${actionHeader}
════════════════════
🪙 <b>العملة / الزوج:</b> <code>${normalizedSymbol}</code>
🧭 <b>نوع الصفقة:</b> ${statusBadge}
════════════════════
📍 <b>سعر الدخول:</b> ${formattedEntry}
💵 <b>السعر الحالي (OKX):</b> ${formattedCurPrice}
🔶 <b>سعر Binance الموازي:</b> ${parallelBinanceVal}
════════════════════
🎯 <b>المستوى المحقق:</b> ${targetHitName || 'وصول السعر إلى 1.5R من الأرباح'}
❌ <b>وقف الخسارة السابق (Old SL):</b> ${formattedOldSl}
🚨 <b>وقف الخسارة الجديد للتعديل فوراً (New SL):</b> <b>${formattedNewSl} (+1.0R ربح مؤكد)</b>
⚙️ <b>الإجراء المطلوب:</b> ${isBuy ? 'رفع الوقف لحجز أرباح 1.0R ⬆️' : 'خفض الوقف لحجز أرباح 1.0R ⬇️'}
🛡️ <b>إدارة المخاطر:</b> تم حجز أرباح 1.0R كاملة وتأمينها في المحفظة حتى لو انعكس السعر.`;
    }

    const result = await sendTelegramMessage(message);
    if (result.ok) {
      recentTrailingHistory.set(normalizedSymbol, {
        stage,
        newStopLoss: actualNewStopLoss,
        sentAt: Date.now(),
      });
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Trailing stop telegram dispatch failed' };
  } finally {
    inFlightTrailingLocks.delete(lockKey);
  }
}

export { sendTelegramMessage };

export default async function telegramHandler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query.action || req.body?.action;

  // GET / Status Check
  if (req.method === 'GET' && !action) {
    const info = await getBotInfo();
    const { chatId } = getTelegramConfig();
    return res.status(200).json({
      success: info.ok,
      connected: info.ok,
      chatId,
      bot: info.bot,
      error: info.error,
    });
  }

  // Send Test Message
  if (action === 'test') {
    const { chatId } = getTelegramConfig();
    const info = await getBotInfo();
    const botName = info.bot?.first_name || 'Crypto Trade Analyzer';
    const username = info.bot?.username ? `@${info.bot.username}` : '@crypto_trade_analyzer_bot';

    const testMsg = `🚀 <b>تم تفعيل إشعارات تليجرام بنجاح!</b>

✅ تم ربط البوت <b>${botName}</b> (${username}) بنجاح.
💬 <b>معرف المحادثة (Chat ID):</b> <code>${chatId}</code>
🕒 <b>التاريخ والوقت:</b> ${new Date().toLocaleString('ar-EG')}

⚡ <i>ستصلك هنا فورياً جميع إشارات الشراء والبيع والتحليلات الفنية المعتمدة من منصة التداول.</i>`;

    const result = await sendTelegramMessage(testMsg);
    if (result.ok) {
      return res.status(200).json({
        success: true,
        message: 'تم إرسال رسالة الاختبار إلى حسابك على تليجرام بنجاح! ✈️',
        bot: info.bot,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'فشل إرسال رسالة الاختبار لتليجرام',
      });
    }
  }

  // Send Trade Signal Alert or Trailing Stop Alert
  if (action === 'send_trailing_stop') {
    const payload = req.body || {};
    const resPayload = await sendTelegramTrailingStopUpdate(payload);
    if (resPayload.success) {
      return res.status(200).json(resPayload);
    } else {
      return res.status(500).json(resPayload);
    }
  }

  if (action === 'send_signal' || req.method === 'POST') {
    const payload = req.body || {};
    // If payload contains trailing stop stage, route to sendTelegramTrailingStopUpdate
    if (payload.stage === 'BREAKEVEN' || payload.stage === 'LOCK_PROFIT_0_5R' || payload.stage === 'TRAILING_LOCK' || payload.stage === 'TRAILING_50_LOCK') {
      const resPayload = await sendTelegramTrailingStopUpdate(payload);
      return res.status(resPayload.success ? 200 : 500).json(resPayload);
    }
    const resPayload = await sendTelegramSignalDirect(payload);
    if (resPayload.success) {
      return res.status(200).json(resPayload);
    } else {
      return res.status(500).json(resPayload);
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}

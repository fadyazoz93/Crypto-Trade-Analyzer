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
  riskRewardRatio?: string;
  sopScore?: number;
  reason?: string;
  source?: string;
  force?: boolean;
  timeframe?: string;
  binancePrice?: number;
  exchangeSource?: string;
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

    // اختيار الهدف الأخير وليس المجزأ (الهدف النهائي 2.0R أو الهدف الموحد الكامل)
    const finalTp = takeProfit4 || takeProfit || (payload as any).take_profit_4 || (payload as any).take_profit || takeProfit2 || takeProfit1;
    const formattedFinalTp = formatNumberVal(finalTp);

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

    const message = `${header}
════════════════════
🪙 العملة / الزوج: ${normalizedSymbol}
${executionTypeLine}
🎯 سعر الدخول المقترح: ${formattedEntry}
💵 السعر اللحظي (OKX): ${formattedPrice}
🔶 سعر Binance الموازي: ${parallelBinanceVal}
🎯 الهدف الموحد (TP): ${formattedFinalTp}
🛑 وقف الخسارة (SL): ${formattedSl}`;

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
  targetHitName?: string; // e.g. "TP1 (+0.5R)" أو "TP2 (+1.0R)"
  stage: 'BREAKEVEN' | 'TRAILING_LOCK';
  reason?: string;
  binancePrice?: number;
}

/**
 * إرسال إشعار تليجرام عند تعديل وقف الخسارة (Stop Trailing / Move SL to Entry or Profit)
 */
export async function sendTelegramTrailingStopUpdate(payload: TrailingStopUpdatePayload): Promise<{ success: boolean; error?: string }> {
  try {
    const {
      symbol,
      decision,
      currentPrice,
      entryPrice,
      oldStopLoss,
      newStopLoss,
      targetHitName = 'تحقيق هدف جزئي',
      stage,
      reason,
      binancePrice,
    } = payload;

    const normalizedSymbol = normalizeSymbolKey(symbol);
    const isBuy = decision === 'BUY';

    let parallelBinancePrice = binancePrice;
    if (parallelBinancePrice === undefined || parallelBinancePrice === null) {
      parallelBinancePrice = await fetchBinanceTickerPrice(normalizedSymbol) ?? undefined;
    }

    const formattedCurPrice = formatNumberVal(currentPrice);
    const formattedEntry = formatNumberVal(entryPrice);
    const formattedOldSl = formatNumberVal(oldStopLoss);
    const formattedNewSl = formatNumberVal(newStopLoss);
    const parallelBinanceVal = (parallelBinancePrice && parallelBinancePrice > 0)
      ? formatNumberVal(parallelBinancePrice)
      : formattedCurPrice;

    const actionHeader = stage === 'BREAKEVEN'
      ? `🛡️ <b>تحديث أمان: نقل وقف الخسارة لنقطة الدخول (Breakeven)</b>`
      : `🚀 <b>تحديث أرباح: حجز الأرباح ورفع الوقف (Stop Trailing)</b>`;

    const statusBadge = isBuy ? `🟢 شراء (LONG)` : `🔴 بيع (SHORT)`;

    const profitPct = isBuy
      ? (((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2)
      : (((entryPrice - currentPrice) / entryPrice) * 100).toFixed(2);

    const slActionArabic = isBuy
      ? (stage === 'BREAKEVEN' ? 'نقل الوقف لسعر الدخول (تأمين)' : 'رفع الوقف لحجز الأرباح ⬆️')
      : (stage === 'BREAKEVEN' ? 'نقل الوقف لسعر الدخول (تأمين)' : 'خفض الوقف لحجز الأرباح ⬇️');

    const message = `${actionHeader}
════════════════════
🪙 <b>العملة / الزوج:</b> <code>${normalizedSymbol}</code>
🧭 <b>نوع الصفقة:</b> ${statusBadge}
🎯 <b>المحطة المنجزة:</b> ${targetHitName}
📈 <b>الربح العائم المحقق:</b> +${profitPct}%
════════════════════
📍 <b>سعر الدخول:</b> ${formattedEntry}
💵 <b>السعر الحالي (OKX):</b> ${formattedCurPrice}
🔶 <b>سعر Binance الموازي:</b> ${parallelBinanceVal}
════════════════════
❌ <b>وقف الخسارة السابق (Old SL):</b> ${formattedOldSl}
🚨 <b>وقف الخسارة الجديد للتعديل فوراً (New SL):</b>
👉 <code>${newStopLoss}</code> 👈 <b>(${formattedNewSl})</b>
⚙️ <b>الإجراء المطلوب:</b> ${slActionArabic}

💡 <i>${reason || (stage === 'BREAKEVEN' ? 'يرجى تعديل أمر Stop Loss في منصتك فوراً إلى السعر الموضح أعلاه لتأمين الصفقة بنسبة 100%.' : 'يرجى تعديل أمر Stop Loss في منصتك لحجز الأرباح المحققة.')}</i>`;

    const result = await sendTelegramMessage(message);
    if (result.ok) {
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Trailing stop telegram dispatch failed' };
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
    if (payload.stage === 'BREAKEVEN' || payload.stage === 'TRAILING_LOCK') {
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

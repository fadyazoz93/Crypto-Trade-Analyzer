/**
 * Telegram Notifications Utility
 * يتولى إرسال إشارات التداول والتحليلات الفنية اللحظية إلى حساب وقناة التليجرام الخاصة بالمستخدم
 */

import { signalNotificationManager } from './tradeSignalNotifier';

export interface TelegramSignalData {
  symbol: string;
  decision: 'BUY' | 'SELL';
  price: number;
  entryPrice?: number;
  entryType?: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_LIMIT';
  entryDistancePercent?: number;
  stopLoss?: number;
  breakevenTriggerPrice?: number;
  target50PercentPrice?: number;
  lockProfitPrice?: number;
  takeProfit?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  takeProfit3?: number;
  takeProfit4?: number;
  riskRewardRatio?: string;
  sopScore?: number;
  reason?: string;
  source?: 'SCANNER' | 'MANUAL_OR_CHART' | 'LIVE_TICK';
  force?: boolean;
  timeframe?: string;
  binancePrice?: number;
}

const clientInFlightDispatches = new Set<string>();

export async function sendTelegramSignal(data: TelegramSignalData): Promise<boolean> {
  // فحص صارم ومطلق: السماح بإرسال إشارات التوافق المؤسسي العالي (4/5 و 5/5)
  if (data.sopScore !== undefined && data.sopScore !== null && Number(data.sopScore) < 4) {
    console.warn(`[Telegram Blocked] Signal for ${data.symbol} prevented because SOP score ${data.sopScore} < 4 (only 4/5 or 5/5 is permitted)`);
    return false;
  }

  const cleanSym = String(data.symbol || '').replace(/[-_ /]/g, '').trim().toUpperCase();
  const cleanKey = `${cleanSym}_${data.decision}`;

  // فحص صارم: منع التكرار اللحظي والمستمر على مستوى المتصفح
  if (!data.force) {
    if (clientInFlightDispatches.has(cleanKey)) {
      return false;
    }
    if (signalNotificationManager.hasBeenNotified(data.symbol, data.decision, 'TELEGRAM')) {
      return false;
    }
  }

  // قفل فوري متفائل لمنع أي استدعاءات متوازية من المؤشرات والشموع
  if (!data.force) {
    clientInFlightDispatches.add(cleanKey);
    signalNotificationManager.markAsNotified(
      data.symbol,
      data.decision,
      'TELEGRAM',
      data.entryPrice,
      data.stopLoss
    );
  }

  try {
    const res = await fetch('/api/telegram?action=send_signal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      console.warn('Failed to dispatch telegram signal:', res.statusText);
      if (!data.force) {
        signalNotificationManager.clearSignalForSymbol(data.symbol);
      }
      return false;
    }

    const result = await res.json();
    const success = Boolean(result?.success);

    if (!success && !data.force) {
      // إذا فشل الإرسال نلغي القفل
      signalNotificationManager.clearSignalForSymbol(data.symbol);
    }

    return success;
  } catch (err) {
    console.error('Error sending Telegram notification:', err);
    if (!data.force) {
      signalNotificationManager.clearSignalForSymbol(data.symbol);
    }
    return false;
  } finally {
    clientInFlightDispatches.delete(cleanKey);
  }
}

export async function testTelegramConnection(): Promise<{ success: boolean; message: string; bot?: any }> {
  try {
    const res = await fetch('/api/telegram?action=test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || 'تم إرسال رسالة الاختبار إلى حسابك على تليجرام بنجاح! ✈️',
        bot: data.bot,
      };
    } else {
      return {
        success: false,
        message: data.error || 'تعذر إرسال الإشعار إلى تليجرام. يرجى التأكد من تشغيل البوت.',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'حدث خطأ في الاتصال بالخادم',
    };
  }
}

export async function getTelegramStatus(): Promise<{ connected: boolean; bot?: any; chatId?: string }> {
  try {
    const res = await fetch('/api/telegram');
    if (!res.ok) return { connected: false };
    const data = await res.json();
    return {
      connected: Boolean(data?.connected),
      bot: data?.bot,
      chatId: data?.chatId,
    };
  } catch {
    return { connected: false };
  }
}

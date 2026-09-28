/**
 * Browser Notifications Utility
 * يوفر إدارة إشعارات المتصفح التلقائية عند ظهور صفقات تداول جديدة (BUY / SELL)
 */

import { signalNotificationManager } from './tradeSignalNotifier';

export interface TradeNotificationData {
  symbol: string;
  decision: 'BUY' | 'SELL';
  price: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  takeProfit3?: number;
  takeProfit4?: number;
  reason?: string;
  sopScore?: number;
  force?: boolean;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    alert('متصفحك الحالي لا يدعم إشعارات النظام (Browser Notifications).');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return false;
  }
}

export async function sendTradeNotification(data: TradeNotificationData): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const isTestOrWelcome = data.symbol.includes('محلل') || data.force;

  // إرسال الإشعار مرة واحدة فقط لكل صفقة/عملة
  if (!isTestOrWelcome) {
    if (signalNotificationManager.hasBeenNotified(data.symbol, data.decision, 'BROWSER')) {
      return false;
    }
  }

  const cacheKey = `${data.symbol}-${data.decision}`;

  const isBuy = data.decision === 'BUY';
  const title = isBuy
    ? `🟢 إشارة شراء جديدة (BUY): ${data.symbol}`
    : `🔴 إشارة بيع جديدة (SELL): ${data.symbol}`;

  const entryText = data.entryPrice ? `$${data.entryPrice}` : `$${data.price}`;
  const slText = data.stopLoss ? `$${data.stopLoss}` : '-';
  const tp1Text = data.takeProfit1 ? `$${data.takeProfit1}` : '-';
  const tp2Text = data.takeProfit2 ? `$${data.takeProfit2}` : '-';
  const confluenceText = data.sopScore ? ` [توافق: ${data.sopScore}/5]` : '';

  const body = `📍 الدخول: ${entryText} | 🛑 الوقف: ${slText}\n🎯 الهدف 1: ${tp1Text} (حجز 50%)\n🎯 الهدف 2: ${tp2Text} (نهائي)\n🛡️ تأمين الدخول عند TP1${confluenceText}`;

  const options = {
    body,
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: cacheKey,
    renotify: true,
    requireInteraction: true,
    dir: 'rtl' as const,
    lang: 'ar',
  };

  try {
    // 📲 استخدام Service Worker المخصص للهواتف الذكية
    let shown = false;
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.showNotification) {
        await registration.showNotification(title, options);
        shown = true;
      }
    }

    if (!shown) {
      // Fallback للمتصفحات العادية على الكمبيوتر
      new Notification(title, options);
      shown = true;
    }

    if (shown && !isTestOrWelcome) {
      signalNotificationManager.markAsNotified(data.symbol, data.decision, 'BROWSER', data.entryPrice, data.stopLoss);
    }
    return true;
  } catch (err) {
    console.error('Failed to trigger browser notification:', err);
    return false;
  }
}

/**
 * إرسال إشعار متصفح عند تأمين الصفقة (Breakeven) أو تحريك الوقف لحجز الأرباح (Trailing Stop)
 */
export async function sendSecurityUpdateBrowserNotification(
  symbol: string,
  decision: 'BUY' | 'SELL',
  isBreakeven: boolean,
  newStopLoss: number,
  targetName?: string
): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const isBuy = decision === 'BUY';
  const actionTag = isBuy ? '🟢 شراء' : '🔴 بيع';
  const title = isBreakeven
    ? `🛡️ تأمين الصفقة | نقل الوقف للدخول (${symbol})`
    : `🚀 حجز الأرباح | رفع وقف الخسارة (${symbol})`;

  const body = isBreakeven
    ? `${actionTag} #${symbol}\n🎯 تم تحقيق 50% من الهدف!\n🚨 الوقف الجديد: $${newStopLoss} (سعر الدخول)\n🔒 الصفقة مؤمنة بالكامل بدون أي مخاطرة!`
    : `${actionTag} #${symbol}\n🎯 ${targetName || 'تحقيق محطة أرباح'}\n🚨 الوقف الجديد: $${newStopLoss} (أرباح محجوزة)\n🔒 تم حجز الأرباح بنجاح في رصيدك!`;

  try {
    let shown = false;
    const options = {
      body,
      icon: '/logo.svg',
      badge: '/logo.svg',
      tag: `${symbol}-security-update-${isBreakeven ? 'be' : 'trail'}`,
      renotify: true,
      requireInteraction: true,
      dir: 'rtl' as const,
      lang: 'ar',
    };

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        shown = true;
      }
    }
    if (!shown) {
      new Notification(title, options);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * إرسال إشعار متصفح طوارئ عند هبوط البيتكوين المفاجئ
 */
export async function sendEmergencyBrowserNotification(
  symbol: string,
  dropPercent: number
): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const title = `🚨 تنبيه طوارئ: انزلاق حاد في البيتكوين (${dropPercent.toFixed(1)}%)!`;
  const body = `العملة: #${symbol}\nيُنصح بالخروج اليدوي فوراً أو رفع الوقف لسعر الدخول لحماية أرباحك وتجنب الانزلاق.`;

  try {
    let shown = false;
    const options = {
      body,
      icon: '/logo.svg',
      badge: '/logo.svg',
      tag: `${symbol}-emergency-btc`,
      renotify: true,
      requireInteraction: true,
      dir: 'rtl' as const,
      lang: 'ar',
    };

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        shown = true;
      }
    }
    if (!shown) {
      new Notification(title, options);
    }
    return true;
  } catch {
    return false;
  }
}

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
  const tp3Text = data.takeProfit3 ? `$${data.takeProfit3}` : '';
  const tp4Text = data.takeProfit4 ? `$${data.takeProfit4}` : '';
  const confluenceText = data.sopScore ? ` (بوابات SOP: ${data.sopScore}/5)` : '';

  let body = `السعر اللحظي: $${data.price}\nسعر الدخول: ${entryText}\nوقف الخسارة (SL): ${slText}\nالهدف 1 (TP1): ${tp1Text}\nالهدف 2 (TP2): ${tp2Text}`;
  if (tp3Text) body += `\nالهدف 3 (TP3): ${tp3Text}`;
  if (tp4Text) body += `\nالهدف 4 (TP4): ${tp4Text}`;
  body += confluenceText;

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

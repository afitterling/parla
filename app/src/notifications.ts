// Local notifications for the "symbol of the day". iOS delivers them while the
// app is closed, so the next week of slots is scheduled ahead every time the
// app comes to the foreground (and whenever the setting changes). Each request
// carries the language and slot index, which is all the app needs to open the
// right symbol when the notification is tapped.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { TFn } from './i18n';
import { Settings } from './storage';
import { hasDailySymbols, symbolAt, upcomingSlots } from './symbols';

// Days scheduled ahead. iOS keeps at most 64 pending requests per app; three
// slots a day for a week is 21.
const DAYS_AHEAD = 7;

export type SymbolNotificationData = { kind: 'symbol'; lang: string; index: number };

// Show the banner even while Parla is in the foreground — the learner may be in
// the dialog when the midday symbol arrives.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Ask for permission (no-op when already decided). Returns whether we may post.
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

// Whether the feature is on for the current goal language.
export function dailySymbolsActive(s: Settings): boolean {
  return s.dailySymbols > 0 && hasDailySymbols(s.goalLanguage);
}

// Replace every pending request with the next week for the current settings.
// Cancels everything when the feature is off (there are no other local
// notifications in the app).
export async function syncSymbolNotifications(s: Settings, t: TFn): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!dailySymbolsActive(s)) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  const lang = s.goalLanguage;
  const start = s.dailySymbolStart[lang] ?? Date.now();
  const slots = upcomingSlots(start, s.dailySymbols, new Date(), DAYS_AHEAD);
  await Promise.all(
    slots.map(({ date, index }) => {
      const sym = symbolAt(lang, index);
      if (!sym) return Promise.resolve('');
      const data: SymbolNotificationData = { kind: 'symbol', lang, index };
      return Notifications.scheduleNotificationAsync({
        identifier: `symbol-${lang}-${index}`,
        content: {
          title: t('symbol.notifTitle', { char: sym.char }),
          body: sym.reading
            ? t('symbol.notifBody', { reading: sym.reading })
            : t('symbol.notifBodyNoReading'),
          data,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    })
  );
}

// The symbol a tapped notification points at, or null for anything else.
export function symbolFromResponse(
  response: Notifications.NotificationResponse | null
): SymbolNotificationData | null {
  const data = response?.notification.request.content.data as
    | Partial<SymbolNotificationData>
    | undefined;
  if (!data || data.kind !== 'symbol' || typeof data.lang !== 'string') return null;
  return { kind: 'symbol', lang: data.lang, index: Number(data.index) || 0 };
}

export const getLastNotificationResponseAsync = Notifications.getLastNotificationResponseAsync;
export const addNotificationResponseReceivedListener =
  Notifications.addNotificationResponseReceivedListener;

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { useT } from '../i18n/I18nContext';
import { Settings } from '../storage';
import { findLanguage, speechLocale } from '../languages';
import { EMERGENCY_PHRASES, emergencyText, hasEmergencyTexts } from '../emergency';
import { transcribeAudio, translateSpeech } from '../api';
import { useRecorder } from '../useRecorder';
import { BusyOverlay } from '../components/BusyOverlay';

type Props = {
  visible: boolean;
  onClose: () => void;
  settings: Settings;
};

// Which side of the conversation is speaking into the interpreter: 'me' = the
// learner (input language), 'them' = the local person (goal language).
type Side = 'me' | 'them';

type Exchange = {
  side: Side;
  heard: string; // what was transcribed
  translated: string; // the translation into the other side's language
  reading?: string; // Latin reading of the translation, when its script needs one
};

type LocationState =
  | { status: 'idle' | 'loading' | 'denied' | 'error' }
  | { status: 'ready'; address: string; coords: string };

// Full-screen emergency mode: fixed phrases in the local (goal) language, the
// current location to show a helper, and a turn-based two-way interpreter on
// the current language pair. Opened from the red header button (opt-in via
// Settings).
export function EmergencyScreen({ visible, onClose, settings }: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const recorder = useRecorder();

  const input = findLanguage(settings.inputLanguage);
  const goal = findLanguage(settings.goalLanguage);

  const [loc, setLoc] = useState<LocationState>({ status: 'idle' });
  const [recordingSide, setRecordingSide] = useState<Side | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch the location each time the screen opens — in an emergency the fix
  // must be current, not from the last time the screen was used.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      setLoc({ status: 'loading' });
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          if (alive) setLoc({ status: 'denied' });
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        let address = '';
        try {
          const [a] = await Location.reverseGeocodeAsync(pos.coords);
          if (a) {
            address = [
              [a.street, a.streetNumber].filter(Boolean).join(' '),
              a.postalCode,
              a.city ?? a.subregion,
              a.region,
              a.country,
            ]
              .filter(Boolean)
              .join(', ');
          }
        } catch {
          // no address — coordinates alone are still useful
        }
        if (alive) setLoc({ status: 'ready', address, coords });
      } catch {
        if (alive) setLoc({ status: 'error' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [visible]);

  // Leaving the screen mid-recording or mid-speech must not keep either going.
  useEffect(() => {
    if (!visible) {
      Speech.stop();
      setSpeakingKey(null);
      if (recordingSide) {
        recorder.stop();
        setRecordingSide(null);
      }
      abortRef.current?.abort();
      setBusy(null);
      setExchange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function speakPhrase(key: string, text: string) {
    if (speakingKey === key) {
      Speech.stop();
      setSpeakingKey(null);
      return;
    }
    Speech.stop();
    setSpeakingKey(key);
    Speech.speak(text, {
      language: speechLocale(goal),
      onDone: () => setSpeakingKey(null),
      onStopped: () => setSpeakingKey(null),
      onError: () => setSpeakingKey(null),
    });
  }

  function cancel() {
    abortRef.current?.abort();
    setBusy(null);
  }

  // Share the current location as text through the native share sheet, so it can
  // go out via Messages, Mail, WhatsApp — whatever the user picks. Includes a
  // maps link so the recipient can open it directly.
  async function shareLocation() {
    if (loc.status !== 'ready') return;
    const query = loc.coords.replace(/\s/g, ''); // "lat, lng" → "lat,lng"
    const mapsUrl = `https://maps.google.com/?q=${query}`;
    // A distress-call message: what it is, where I am, and what I need.
    const where = [loc.address, loc.coords].filter(Boolean).join(' — ');
    const message = [
      `${t('emergency.shareIntro')} ${where}`,
      mapsUrl,
      t('emergency.shareOutro'),
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await Share.share({ message });
    } catch {
      // user dismissed the share sheet, or sharing unavailable — nothing to do
    }
  }

  // One interpreter turn: tap a side's button to record, tap it again to stop —
  // then Whisper transcribes in that side's language, the translation into the
  // other language is shown big and spoken aloud. Then the other side taps.
  async function onSidePress(side: Side) {
    // A tap on the *other* button while recording is ignored — the running turn
    // must be stopped first (the explicit stop the user asked for).
    if (recordingSide && recordingSide !== side) return;

    const from = side === 'me' ? input : goal;
    const to = side === 'me' ? goal : input;

    if (!recordingSide) {
      try {
        Speech.stop();
        await recorder.start();
        setRecordingSide(side);
      } catch (e: any) {
        Alert.alert('Parla', e?.message ?? String(e));
      }
      return;
    }

    // Stop pressed → transcribe → translate → show + speak.
    setRecordingSide(null);
    const uri = await recorder.stop();
    if (!uri) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setBusy(t('dialog.transcribing'));
      const heard = await transcribeAudio(uri, settings.openaiKey, from, ctrl.signal);
      if (!heard.trim()) throw new Error(t('emergency.nothingHeard'));
      setBusy(t('emergency.translating'));
      const res = await translateSpeech(
        settings.openaiKey,
        heard,
        from,
        to,
        !!to.romanize,
        ctrl.signal
      );
      setExchange({ side, heard, translated: res.text, reading: res.reading });
      Speech.speak(res.text, { language: speechLocale(to) });
    } catch (e: any) {
      if (!ctrl.signal.aborted) Alert.alert('Parla', e?.message ?? String(e));
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

  const fallbackToEnglish = !hasEmergencyTexts(goal.code);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        {/* Red header — unmistakably the emergency context. */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="warning" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('emergency.title')}</Text>
            <Text style={styles.subtitle}>
              {input.nativeName} ↔ {goal.nativeName}
            </Text>
          </View>
          {/* Share the current location — enabled once the fix is in. */}
          <Pressable
            onPress={shareLocation}
            hitSlop={10}
            disabled={loc.status !== 'ready'}
            style={[styles.shareBtn, loc.status !== 'ready' && styles.shareBtnDisabled]}
            accessibilityLabel={t('emergency.shareLocation')}
          >
            <Ionicons name="share-outline" size={20} color="#fff" />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          {/* Current location — show it to a helper or read it to the dispatcher. */}
          <View style={styles.locCard}>
            <Ionicons name="location" size={20} color={theme.colors.danger} />
            <View style={{ flex: 1 }}>
              {loc.status === 'ready' ? (
                <>
                  {!!loc.address && (
                    <Text style={styles.locAddress} selectable>
                      {loc.address}
                    </Text>
                  )}
                  <Text style={styles.locCoords} selectable>
                    {loc.coords}
                  </Text>
                </>
              ) : (
                <Text style={styles.locHint}>
                  {loc.status === 'loading'
                    ? t('emergency.locating')
                    : loc.status === 'denied'
                      ? t('emergency.locationDenied')
                      : t('emergency.locationFailed')}
                </Text>
              )}
            </View>
          </View>

          {/* Fixed phrases: local language big (show the screen to someone),
              reading + app-language meaning underneath, tap to speak. */}
          <Text style={styles.sectionLabel}>{t('emergency.phrases').toUpperCase()}</Text>
          {fallbackToEnglish && <Text style={styles.fallbackNote}>{t('emergency.fallbackEn')}</Text>}
          {EMERGENCY_PHRASES.map((p) => {
            const local = emergencyText(p, goal.code);
            const speaking = speakingKey === p.key;
            return (
              <Pressable
                key={p.key}
                style={[styles.phraseCard, speaking && styles.phraseCardActive]}
                onPress={() => speakPhrase(p.key, local.text)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.phraseLocal}>{local.text}</Text>
                  {!!local.reading && <Text style={styles.phraseReading}>{local.reading}</Text>}
                  <Text style={styles.phraseMeaning}>{t('emergency.p.' + p.key)}</Text>
                </View>
                <Ionicons
                  name={speaking ? 'stop-circle' : 'volume-high'}
                  size={22}
                  color={speaking ? theme.colors.danger : theme.colors.textFaint}
                />
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Two-way interpreter, pinned at the bottom. */}
        <View style={styles.interpreter}>
          {exchange && (
            <View style={styles.exchangeCard}>
              <Text style={styles.exchangeHeard} selectable>
                {exchange.heard}
              </Text>
              <Text style={styles.exchangeText} selectable>
                {exchange.translated}
              </Text>
              {!!exchange.reading && (
                <Text style={styles.exchangeReading}>{exchange.reading}</Text>
              )}
            </View>
          )}
          <Text style={styles.interpreterHint}>
            {recordingSide ? t('dialog.recHint') : t('emergency.interpreterHint')}
          </Text>
          <View style={styles.micRow}>
            {(['me', 'them'] as Side[]).map((side) => {
              const lang = side === 'me' ? input : goal;
              const active = recordingSide === side;
              const disabled = !!recordingSide && !active;
              return (
                <Pressable
                  key={side}
                  style={[
                    styles.micBtn,
                    active && styles.micBtnActive,
                    disabled && styles.micBtnDisabled,
                  ]}
                  onPress={() => onSidePress(side)}
                >
                  <Ionicons name={active ? 'stop' : 'mic'} size={26} color="#fff" />
                  <Text style={styles.micLabel}>{lang.nativeName}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <BusyOverlay visible={!!busy} label={busy} onCancel={cancel} />
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.cardBorder,
    },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: theme.colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: theme.colors.text, fontSize: 20, fontWeight: '900' },
    subtitle: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 1 },
    shareBtn: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: theme.colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareBtnDisabled: { opacity: 0.4 },
    closeBtn: { padding: 4 },
    content: { padding: 16, paddingBottom: 24 },
    locCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      padding: 14,
    },
    locAddress: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
    locCoords: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
    locHint: { color: theme.colors.textFaint, fontSize: 13 },
    sectionLabel: {
      color: theme.colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      marginTop: 18,
      marginBottom: 10,
    },
    fallbackNote: { color: theme.colors.textFaint, fontSize: 12, marginBottom: 8 },
    phraseCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      padding: 14,
      marginBottom: 10,
    },
    phraseCardActive: { borderColor: theme.colors.danger },
    phraseLocal: { color: theme.colors.text, fontSize: 24, fontWeight: '800', lineHeight: 32 },
    phraseReading: { color: theme.colors.accent2, fontSize: 14, marginTop: 3 },
    phraseMeaning: { color: theme.colors.textMuted, fontSize: 13, marginTop: 4 },
    interpreter: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.cardBorder,
      backgroundColor: theme.colors.bgElevated,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6,
    },
    exchangeCard: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      padding: 12,
      marginBottom: 8,
    },
    exchangeHeard: { color: theme.colors.textFaint, fontSize: 13 },
    exchangeText: { color: theme.colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 },
    exchangeReading: { color: theme.colors.accent2, fontSize: 14, marginTop: 3 },
    interpreterHint: {
      color: theme.colors.textFaint,
      fontSize: 12,
      textAlign: 'center',
      marginBottom: 8,
    },
    micRow: { flexDirection: 'row', gap: 12 },
    micBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.colors.danger,
      borderRadius: theme.radius.md,
      paddingVertical: 16,
    },
    micBtnActive: { backgroundColor: theme.colors.accent },
    micBtnDisabled: { opacity: 0.35 },
    micLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },
  });
}

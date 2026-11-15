// Settings → Claude & agents.
//
// Signed out: what this is, and Apple's button. Signed in: connect an agent
// (pairing code + connector URL), sync now, and sign out — which deletes the
// relay's copy and disconnects every agent.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Theme, themeFor } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { useT } from '../i18n/I18nContext';
import { isAppleSignInAvailable, mcpUrl } from '../relay';
import type { RelayState } from '../useRelay';

export function AgentsSection({ relay }: { relay: RelayState }) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const dark = theme === themeFor('dark');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [copied, setCopied] = useState<'url' | 'code' | null>(null);
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  // Count the code down, and drop it once it has expired.
  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (Date.parse(pairing.expiresAt) <= now) setPairing(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [pairing]);

  async function copy(what: 'url' | 'code', value: string) {
    await Clipboard.setStringAsync(value);
    setCopied(what);
    setTimeout(() => setCopied(null), 1200);
  }

  async function connect() {
    setPairingBusy(true);
    try {
      setPairing(await relay.pair());
    } catch (e: any) {
      Alert.alert(t('agents.title'), e?.message ?? String(e));
    } finally {
      setPairingBusy(false);
    }
  }

  async function signIn() {
    try {
      await relay.signIn();
    } catch (e: any) {
      Alert.alert(t('agents.title'), e?.message ?? String(e));
    }
  }

  function confirmSignOut() {
    Alert.alert(t('agents.signOut'), t('agents.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('agents.signOut'),
        style: 'destructive',
        onPress: async () => {
          try {
            await relay.signOut();
            setPairing(null);
          } catch (e: any) {
            Alert.alert(t('agents.title'), e?.message ?? String(e));
          }
        },
      },
    ]);
  }

  if (!relay.configured) {
    return (
      <View style={styles.card}>
        <Text style={styles.body}>{t('agents.intro')}</Text>
        <Text style={styles.hint}>{t('agents.notConfigured')}</Text>
      </View>
    );
  }

  if (!relay.session) {
    return (
      <View style={styles.card}>
        <Text style={styles.body}>{t('agents.intro')}</Text>
        {appleAvailable ? (
          relay.busy ? (
            <ActivityIndicator style={styles.appleButton} color={theme.colors.accent} />
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                dark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={24}
              style={styles.appleButton}
              onPress={signIn}
            />
          )
        ) : (
          <Text style={styles.hint}>{t('agents.appleUnavailable')}</Text>
        )}
        <Text style={styles.hint}>{t('agents.privacy')}</Text>
        {relay.error ? <Text style={styles.error}>{relay.error}</Text> : null}
      </View>
    );
  }

  const secondsLeft = pairing ? Math.max(0, Math.round((Date.parse(pairing.expiresAt) - clock) / 1000)) : 0;
  const url = mcpUrl();
  const synced = relay.lastSync
    ? t('agents.lastSync', {
        time: new Date(relay.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
    : t('agents.notSynced');

  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <Ionicons name="logo-apple" size={16} color={theme.colors.text} />
        <Text style={styles.status}>{t('agents.signedIn')}</Text>
        <Text style={styles.statusMuted}>· {synced}</Text>
      </View>

      {pairing ? (
        <View style={styles.pairBox}>
          <Text style={styles.label}>{t('agents.codeTitle')}</Text>
          <Pressable onPress={() => copy('code', pairing.code)}>
            <Text style={styles.code} selectable>
              {pairing.code.slice(0, 4)} {pairing.code.slice(4)}
            </Text>
          </Pressable>
          <Text style={styles.hintCenter}>
            {copied === 'code'
              ? t('agents.copied')
              : t('agents.codeExpires', {
                  time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`,
                })}
          </Text>

          <Text style={[styles.label, { marginTop: 14 }]}>{t('agents.urlTitle')}</Text>
          <Pressable style={styles.urlRow} onPress={() => copy('url', url)}>
            <Text style={styles.url} numberOfLines={2} selectable>
              {url}
            </Text>
            <Ionicons
              name={copied === 'url' ? 'checkmark' : 'copy-outline'}
              size={18}
              color={theme.colors.accent}
            />
          </Pressable>
          <Text style={styles.steps}>{t('agents.steps')}</Text>
        </View>
      ) : (
        <Text style={styles.body}>{t('agents.connectedIntro')}</Text>
      )}

      <Pressable style={styles.primaryBtn} onPress={connect} disabled={pairingBusy}>
        {pairingBusy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {pairing ? t('agents.newCode') : t('agents.connect')}
          </Text>
        )}
      </Pressable>

      <Pressable style={styles.textBtn} onPress={relay.syncNow} disabled={relay.busy}>
        {relay.busy ? (
          <ActivityIndicator size="small" color={theme.colors.accent} />
        ) : (
          <Text style={styles.textBtnText}>{t('agents.syncNow')}</Text>
        )}
      </Pressable>
      <Pressable style={styles.textBtn} onPress={confirmSignOut} disabled={relay.busy}>
        <Text style={[styles.textBtnText, { color: theme.colors.danger }]}>{t('agents.signOut')}</Text>
      </Pressable>

      {relay.error ? <Text style={styles.error}>{relay.error}</Text> : null}
      <Text style={styles.hint}>{t('agents.privacy')}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      padding: 14,
      marginBottom: 12,
    },
    body: { color: theme.colors.text, fontSize: 14, lineHeight: 20, marginBottom: 12 },
    hint: { color: theme.colors.textFaint, fontSize: 12, marginTop: 10 },
    hintCenter: { color: theme.colors.textFaint, fontSize: 12, marginTop: 4, textAlign: 'center' },
    error: { color: theme.colors.danger, fontSize: 12, marginTop: 10 },
    appleButton: { height: 48, width: '100%' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    status: { color: theme.colors.text, fontSize: 14, fontWeight: '800' },
    statusMuted: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600', flexShrink: 1 },
    pairBox: {
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      backgroundColor: theme.colors.bgElevated,
      padding: 12,
      marginBottom: 12,
    },
    label: {
      color: theme.colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    code: {
      color: theme.colors.text,
      fontSize: 32,
      fontWeight: '800',
      letterSpacing: 4,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
      marginTop: 6,
    },
    urlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    url: { flex: 1, color: theme.colors.accent, fontSize: 13, fontWeight: '600' },
    steps: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 10 },
    primaryBtn: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      paddingVertical: 15,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    textBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 2 },
    textBtnText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '700' },
  });
}

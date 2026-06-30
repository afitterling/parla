import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme';
import { useStyles } from '../ThemeContext';
import { useT } from '../i18n/I18nContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
};

export function Paywall({ visible, onClose, onUpgrade }: Props) {
  const styles = useStyles(makeStyles);
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop backdrop taps from closing when the card itself is tapped. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{t('paywall.title')}</Text>
          <Text style={styles.text}>{t('paywall.text')}</Text>
          <Pressable style={styles.primaryBtn} onPress={onUpgrade}>
            <Text style={styles.primaryBtnText}>{t('paywall.upgrade')}</Text>
          </Pressable>
          <Pressable style={styles.textBtn} onPress={onClose}>
            <Text style={styles.textBtnText}>{t('paywall.later')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 22,
  },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: '800', marginBottom: 10 },
  text: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  primaryBtn: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  textBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  textBtnText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '700' },
  });
}

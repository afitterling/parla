import { useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Theme } from '../theme';
import { useStyles } from '../ThemeContext';

type Props = {
  children: React.ReactNode;
  onDelete?: () => void;
  onLearn?: () => void;
  onTap?: () => void;
  deleteLabel?: string;
  learnLabel?: string;
};

const REVEAL = 84; // width of each action button
const SNAP = 36; // drag distance past which we snap open
const TAP_SLOP = 6; // movement under this (both axes) counts as a tap

export function SwipeRow({
  children,
  onDelete,
  onLearn,
  onTap,
  deleteLabel = 'Löschen',
  learnLabel = 'Lernen',
}: Props) {
  const styles = useStyles(makeStyles);
  const translateX = useRef(new Animated.Value(0)).current;
  // Resting position so the pan gesture is relative to it. `openRef` mirrors
  // whether the row is currently open so the Pressable tap handler can tell
  // a real tap from "tap to close".
  const offset = useRef(0);
  const openRef = useRef(false);

  function animateTo(to: number) {
    offset.current = to;
    openRef.current = to !== 0;
    Animated.timing(translateX, {
      toValue: to,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: (_, g) => {
        let next = offset.current + g.dx;
        // Clamp to the side that actually has an action; otherwise pin to 0.
        const maxRight = onLearn ? REVEAL : 0;
        const maxLeft = onDelete ? -REVEAL : 0;
        if (next > maxRight) next = maxRight;
        if (next < maxLeft) next = maxLeft;
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        // Treat a near-stationary gesture as a tap.
        if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
          if (openRef.current) {
            animateTo(0);
          } else if (onTap) {
            onTap();
          }
          return;
        }
        const at = offset.current + g.dx;
        if (onLearn && at > SNAP) {
          animateTo(REVEAL);
        } else if (onDelete && at < -SNAP) {
          animateTo(-REVEAL);
        } else {
          animateTo(0);
        }
      },
      onPanResponderTerminate: () => animateTo(offset.current),
    })
  ).current;

  function onBodyPress(_e: GestureResponderEvent) {
    // Fired for plain taps that never reached the PanResponder. If the row is
    // open, close it; otherwise hand off to onTap.
    if (openRef.current) {
      animateTo(0);
    } else if (onTap) {
      onTap();
    }
  }

  return (
    <View style={styles.wrap}>
      {onLearn && (
        <Pressable
          style={[styles.action, styles.learnAction]}
          onPress={() => {
            animateTo(0);
            onLearn();
          }}
        >
          <Text style={styles.learnText}>{learnLabel}</Text>
        </Pressable>
      )}
      {onDelete && (
        <Pressable
          style={[styles.action, styles.deleteAction]}
          onPress={() => {
            animateTo(0);
            onDelete();
          }}
        >
          <Text style={styles.deleteText}>{deleteLabel}</Text>
        </Pressable>
      )}
      <Animated.View
        style={[styles.body, { transform: [{ translateX }] }]}
        {...pan.panHandlers}
      >
        <Pressable onPress={onBodyPress}>{children}</Pressable>
      </Animated.View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
  wrap: { position: 'relative' },
  body: { backgroundColor: theme.colors.bg },
  action: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: REVEAL,
    justifyContent: 'center',
    borderRadius: theme.radius.md,
  },
  learnAction: {
    left: 0,
    backgroundColor: theme.colors.accent2,
    alignItems: 'flex-start',
    paddingLeft: 18,
  },
  learnText: { color: '#001b1f', fontWeight: '800', fontSize: 14 },
  deleteAction: {
    right: 0,
    backgroundColor: theme.colors.danger,
    alignItems: 'flex-end',
    paddingRight: 18,
  },
  deleteText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  });
}

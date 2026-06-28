import { useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../theme';

type Props = {
  children: React.ReactNode;
  onDelete?: () => void;
  onLearn?: () => void;
};

const REVEAL = 88; // width of each action button
const SNAP = 40; // drag distance past which we snap open

export function SwipeRow({ children, onDelete, onLearn }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  // Track the resting position so the pan gesture can be relative to it and a
  // simple tap can toggle the "Lernen" action open/closed.
  const offset = useRef(0);

  function animateTo(to: number) {
    offset.current = to;
    Animated.spring(translateX, {
      toValue: to,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  }

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 8,
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
        const moved = g.dx;
        const at = offset.current + moved;
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

  function onBodyPress() {
    if (offset.current !== 0) {
      animateTo(0); // any tap while open just closes
    } else if (onLearn) {
      animateTo(REVEAL); // tap reveals the Lernen action
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
          <Text style={styles.learnText}>Lernen</Text>
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
          <Text style={styles.deleteText}>Löschen</Text>
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

const styles = StyleSheet.create({
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

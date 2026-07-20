import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, G, Line, Mask, Path, Rect } from 'react-native-svg';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { useT } from '../i18n/I18nContext';
import {
  STROKE_TRANSFORM,
  STROKE_VIEWBOX,
  StrokeData,
  hanziChars,
  loadStrokeData,
  medianLength,
  medianPath,
} from '../strokes';

// Animated stroke-order practice for a word. Each Han character of the term gets
// a chip; the selected one is drawn stroke by stroke on a 米字格 grid.
//
// How a stroke is animated: the character data gives a filled outline per stroke
// plus a median (the pen path through it). We paint the outline and clip it with
// the median drawn as a very fat line whose dash offset animates from "hidden"
// to "fully drawn" — so the shape appears exactly as a brush would lay it down.
type Props = { term: string; size?: number };

const PEN_WIDTH = 220; // fat enough to cover the widest stroke outline

export function StrokeOrderView({ term, size = 260 }: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();

  const chars = hanziChars(term);
  const [charIndex, setCharIndex] = useState(0);
  const char = chars[charIndex] ?? '';

  const [data, setData] = useState<StrokeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0); // stroke currently being drawn
  const [progress, setProgress] = useState(0); // 0…1 within that stroke
  const [playing, setPlaying] = useState(true);

  // Load (network on first sight, cache afterwards) whenever the character changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    setIndex(0);
    setProgress(0);
    setPlaying(true);
    loadStrokeData(char).then((d) => {
      if (!active) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [char]);

  const strokes = data?.strokes ?? [];
  const total = strokes.length;

  // The playback loop: advance `progress` per frame, then step to the next
  // stroke after a short beat. Stops on the last stroke.
  useEffect(() => {
    if (!playing || total === 0) return;
    const median = data?.medians[index] ?? [];
    const duration = Math.max(320, Math.min(1100, medianLength(median) * 1.6));
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: number | null = null;

    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else if (index < total - 1) {
        timer = setTimeout(() => {
          setIndex((i) => i + 1);
          setProgress(0);
        }, 220);
      } else {
        timer = setTimeout(() => setPlaying(false), 220);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [playing, index, total, data]);

  function replay() {
    setIndex(0);
    setProgress(0);
    setPlaying(true);
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      setProgress(1); // freeze with the current stroke fully drawn
    } else if (index >= total - 1 && progress >= 1) {
      replay();
    } else {
      setPlaying(true);
    }
  }

  function stepBy(delta: number) {
    setPlaying(false);
    setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)));
    setProgress(1);
  }

  const median = data?.medians[index] ?? [];
  const penLength = medianLength(median) + PEN_WIDTH;
  const maskId = `stroke-${charIndex}-${index}`;

  return (
    <View style={styles.wrap}>
      {chars.length > 1 && (
        <View style={styles.chips}>
          {chars.map((c, i) => (
            <Pressable
              key={`${c}-${i}`}
              style={[styles.chip, i === charIndex && styles.chipOn]}
              onPress={() => setCharIndex(i)}
            >
              <Text style={[styles.chipText, i === charIndex && styles.chipTextOn]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.canvas, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${STROKE_VIEWBOX} ${STROKE_VIEWBOX}`}>
          {/* 米字格 practice grid */}
          <Rect
            x={2}
            y={2}
            width={STROKE_VIEWBOX - 4}
            height={STROKE_VIEWBOX - 4}
            fill="none"
            stroke={theme.colors.cardBorder}
            strokeWidth={4}
          />
          <Line
            x1={STROKE_VIEWBOX / 2}
            y1={0}
            x2={STROKE_VIEWBOX / 2}
            y2={STROKE_VIEWBOX}
            stroke={theme.colors.cardBorder}
            strokeWidth={3}
            strokeDasharray="18 18"
          />
          <Line
            x1={0}
            y1={STROKE_VIEWBOX / 2}
            x2={STROKE_VIEWBOX}
            y2={STROKE_VIEWBOX / 2}
            stroke={theme.colors.cardBorder}
            strokeWidth={3}
            strokeDasharray="18 18"
          />

          {total > 0 && (
            <G transform={STROKE_TRANSFORM}>
              <Defs>
                <Mask
                  id={maskId}
                  maskUnits="userSpaceOnUse"
                  x={0}
                  y={0}
                  width={STROKE_VIEWBOX}
                  height={STROKE_VIEWBOX}
                >
                  <Path
                    d={medianPath(median)}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={PEN_WIDTH}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={`${penLength} ${penLength}`}
                    strokeDashoffset={penLength * (1 - progress)}
                  />
                </Mask>
              </Defs>

              {/* Strokes still to come — faint ghost outlines. */}
              {strokes.map((d, i) =>
                i > index ? (
                  <Path key={`ghost-${i}`} d={d} fill={theme.colors.textFaint} opacity={0.18} />
                ) : null
              )}
              {/* Strokes already written. */}
              {strokes.map((d, i) =>
                i < index ? <Path key={`done-${i}`} d={d} fill={theme.colors.text} /> : null
              )}
              {/* The stroke being written, revealed along its median. */}
              <Path d={strokes[index]} fill={theme.colors.accent} mask={`url(#${maskId})`} />
            </G>
          )}
        </Svg>

        {loading && (
          <View style={styles.overlay}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        )}
        {!loading && total === 0 && (
          <View style={styles.overlay}>
            <Ionicons name="help-circle-outline" size={28} color={theme.colors.textFaint} />
            <Text style={styles.unavailable}>{t('strokes.unavailable')}</Text>
          </View>
        )}
      </View>

      {total > 0 && (
        <View style={styles.controls}>
          <Pressable style={styles.ctrlBtn} onPress={() => stepBy(-1)} hitSlop={6}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          </Pressable>
          <Pressable style={styles.playBtn} onPress={togglePlay} hitSlop={6}>
            <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />
          </Pressable>
          <Pressable style={styles.ctrlBtn} onPress={() => stepBy(1)} hitSlop={6}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
          </Pressable>
          <Pressable style={styles.ctrlBtn} onPress={replay} hitSlop={6}>
            <Ionicons name="refresh" size={17} color={theme.colors.text} />
          </Pressable>
          <Text style={styles.counter}>
            {index + 1} / {total}
          </Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', gap: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
    chip: {
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      backgroundColor: theme.colors.bgElevated,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    chipOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentDim },
    chipText: { color: theme.colors.textMuted, fontSize: 18, fontWeight: '600' },
    chipTextOn: { color: theme.colors.text },
    canvas: {
      backgroundColor: theme.colors.bgElevated,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    unavailable: {
      color: theme.colors.textFaint,
      fontSize: 13,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ctrlBtn: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bgElevated,
    },
    playBtn: {
      width: 42,
      height: 42,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    counter: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700', marginLeft: 4 },
  });
}

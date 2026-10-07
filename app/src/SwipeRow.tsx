import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { displayThumb, type Item } from './items';
import { colors } from './theme';

// How much of the row the middle item takes; its neighbours peek in at the sides.
const ITEM_SHARE = 0.48;

// One row of the Hangr page: swipe sideways to change the piece. The item
// in the middle is the one in the look; tap it to lock it.
export function SwipeRow(props: {
  items: Item[];
  index: number;
  locked: boolean;
  emptyLabel: string;
  onIndex: (index: number) => void;
  onToggleLock: () => void;
}) {
  const { items, index, locked } = props;
  const [width, setWidth] = useState(0);
  const itemWidth = width * ITEM_SHARE;
  const scroller = useRef<ScrollView>(null);
  // Where the row is scrolled to, so a shuffle only scrolls when it must.
  const shown = useRef(index);

  // Scroll to the chosen item when it changes from outside (a shuffle).
  useEffect(() => {
    if (itemWidth === 0 || shown.current === index) return;
    shown.current = index;
    scroller.current?.scrollTo({ x: index * itemWidth, animated: true });
  }, [index, itemWidth]);

  // Lay out at the chosen item once the row's width is known.
  useEffect(() => {
    if (itemWidth > 0)
      scroller.current?.scrollTo({ x: shown.current * itemWidth, animated: false });
  }, [itemWidth]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (itemWidth === 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / itemWidth);
    const clamped = Math.max(0, Math.min(items.length - 1, next));
    if (clamped !== shown.current) {
      shown.current = clamped;
      props.onIndex(clamped);
    }
  };

  if (items.length === 0) {
    return (
      <View style={[styles.row, styles.empty]}>
        <Text style={styles.emptyText}>{props.emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.row}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <ScrollView
          ref={scroller}
          horizontal
          // A locked row stays put.
          scrollEnabled={!locked}
          showsHorizontalScrollIndicator={false}
          snapToInterval={itemWidth}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={32}
          contentContainerStyle={{ paddingHorizontal: (width - itemWidth) / 2 }}
        >
          {items.map((item, i) => {
            const middle = i === index;
            return (
              <Pressable
                key={item.id}
                style={[styles.item, { width: itemWidth }, !middle && styles.side]}
                onPress={middle ? props.onToggleLock : () => props.onIndex(i)}
                accessibilityLabel={
                  middle ? `${item.name}, ${locked ? 'locked' : 'tap to lock'}` : item.name
                }
              >
                <Image source={displayThumb(item)} style={styles.image} resizeMode="contain" />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {locked && (
        <View style={styles.lock} pointerEvents="none">
          <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: colors.muted },
  item: { height: '100%', padding: 6 },
  side: { opacity: 0.55 },
  image: { width: '100%', height: '100%' },
  lock: {
    position: 'absolute',
    top: 6,
    left: '50%',
    marginLeft: 50,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});

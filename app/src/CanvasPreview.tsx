import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useState } from 'react';

import { layoutFor } from './canvasLayout';
import { displayThumb, type Item } from './items';
import type { Placement } from './outfits';
import { colors } from './theme';

// A small, static copy of an outfit's canvas.
export function CanvasPreview(props: { items: Item[]; layout: Record<string, Placement> }) {
  const [width, setWidth] = useState(0);
  const height = width / 0.8;
  // Items added after the canvas was saved get their starting spot.
  const layout = layoutFor(props.items, props.layout);
  const placed = [...props.items].sort((a, b) => layout[a.id].z - layout[b.id].z);
  return (
    <View
      style={styles.board}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 &&
        placed.map((item) => {
          const p = layout[item.id];
          const size = p.scale * width;
          return (
            <Image
              key={item.id}
              source={displayThumb(item)}
              resizeMode="contain"
              style={{
                position: 'absolute',
                width: size,
                height: size,
                left: p.x * width - size / 2,
                top: p.y * height - size / 2,
              }}
            />
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    aspectRatio: 0.8,
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
  },
});

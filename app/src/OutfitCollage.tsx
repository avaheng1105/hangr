import { Image, StyleSheet, View } from 'react-native';

import { displayThumb, type Item } from './items';
import { colors } from './theme';

// Up to four of an outfit's items: one fills the square, two stack head to
// toe, three or four make a 2x2 grid.
export function OutfitCollage({ items }: { items: Item[] }) {
  const shown = items.slice(0, 4);
  return (
    <View style={styles.grid}>
      {shown.map((item) => (
        <View key={item.id} style={cellStyle[Math.min(shown.length, 3)]}>
          <Image source={displayThumb(item)} style={styles.image} resizeMode="contain" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    aspectRatio: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 6,
  },
  cell: { width: '50%', height: '50%', padding: 4 },
  whole: { width: '100%', height: '100%', padding: 4 },
  row: { width: '100%', height: '50%', padding: 4 },
  image: { width: '100%', height: '100%' },
});

const cellStyle = [styles.whole, styles.whole, styles.row, styles.cell];

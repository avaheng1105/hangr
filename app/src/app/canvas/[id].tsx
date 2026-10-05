import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { CanvasBoard } from '../../CanvasBoard';
import { useCloset } from '../../ClosetContext';
import { colors } from '../../theme';

// A saved outfit on the styling board.
export default function Canvas() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { outfits, items, saveLayout } = useCloset();
  const outfit = outfits.find((o) => o.id === id);
  if (!outfit) {
    return (
      <View style={styles.centred}>
        <Text style={styles.muted}>This outfit was deleted.</Text>
      </View>
    );
  }
  const pieces = outfit.itemIds.flatMap((itemId) => items.find((item) => item.id === itemId) ?? []);
  return (
    <>
      <Stack.Screen options={{ title: outfit.name || 'Outfit' }} />
      <CanvasBoard
        key={outfit.id}
        pieces={pieces}
        initial={outfit.layout}
        onSave={async (layout) => {
          await saveLayout(outfit.id, layout);
          router.back();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontSize: 15, color: colors.muted },
});

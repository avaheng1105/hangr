import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { clamp, layoutFor } from './canvasLayout';
import { displayImage, type Item } from './items';
import type { Placement } from './outfits';
import { colors } from './theme';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The board is 4:5, like a phone photo.
const BOARD_RATIO = 0.8;
const SCALE_STEP = 1.15;

// Style an outfit on a board: drag items into place, resize them and change
// which sits on top.
export function CanvasBoard(props: {
  pieces: Item[];
  initial: Record<string, Placement>;
  onSave: (layout: Record<string, Placement>) => Promise<void>;
}) {
  const { pieces } = props;
  const [layout, setLayout] = useState(() => layoutFor(pieces, props.initial));
  const [selected, setSelected] = useState<string | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The largest 4:5 board that fits the space.
  const width = Math.min(area.width, area.height * BOARD_RATIO);
  const height = width / BOARD_RATIO;

  const place = (itemId: string, changes: Partial<Placement>) =>
    setLayout((current) => ({ ...current, [itemId]: { ...current[itemId], ...changes } }));

  const topZ = () => Math.max(0, ...Object.values(layout).map((p) => p.z)) + 1;

  const select = (itemId: string) => {
    setSelected(itemId);
    // The item you pick up goes on top.
    if (layout[itemId].z < topZ() - 1) place(itemId, { z: topZ() });
  };

  const resize = (factor: number) => {
    if (!selected) return;
    place(selected, { scale: clamp(layout[selected].scale * factor, 0.08, 1.2) });
  };

  const sendBack = () => {
    if (!selected) return;
    place(selected, { z: Math.min(0, ...Object.values(layout).map((p) => p.z)) - 1 });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await props.onSave(layout);
    } catch (e) {
      setError(`Couldn't save: ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.area} onLayout={(e: LayoutChangeEvent) => setArea(e.nativeEvent.layout)}>
        <View style={[styles.board, { width, height }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          {width > 0 &&
            // A stable order with zIndex for stacking: moving the dragged
            // element in the tree would cancel the drag.
            pieces.map((item) => (
              <Piece
                key={item.id}
                item={item}
                placement={layout[item.id]}
                board={{ width, height }}
                selected={selected === item.id}
                onGrab={() => select(item.id)}
                onMove={(x, y) => place(item.id, { x, y })}
              />
            ))}
        </View>
      </View>

      <Text style={styles.hint}>
        {selected ? 'Drag to move it, or use the buttons below.' : 'Tap an item to pick it up.'}
      </Text>
      <View style={styles.tools}>
        <Tool
          icon="remove"
          label="Smaller"
          onPress={() => resize(1 / SCALE_STEP)}
          disabled={!selected}
        />
        <Tool icon="add" label="Bigger" onPress={() => resize(SCALE_STEP)} disabled={!selected} />
        <Tool icon="layers-outline" label="Send back" onPress={sendBack} disabled={!selected} />
        <Tool
          icon="refresh"
          label="Reset"
          onPress={() => {
            setLayout(layoutFor(pieces, {}));
            setSelected(null);
          }}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.save, saving && styles.dim]}
        onPress={() => void save()}
        disabled={saving}
        accessibilityRole="button"
      >
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save</Text>}
      </Pressable>
    </View>
  );
}

function Piece(props: {
  item: Item;
  placement: Placement;
  board: { width: number; height: number };
  selected: boolean;
  onGrab: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const { item, placement, board, selected } = props;
  // Where the drag started: the item (as board fractions) and the finger
  // (page coordinates). Moves are measured from the finger's page position
  // because the responder below is rebuilt every render, which resets its
  // own gesture state.
  const [start, setStart] = useState({ x: 0, y: 0, pageX: 0, pageY: 0 });
  const size = placement.scale * board.width;
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const { pageX, pageY } = event.nativeEvent;
      setStart({ x: placement.x, y: placement.y, pageX, pageY });
      props.onGrab();
    },
    onPanResponderMove: (event) =>
      props.onMove(
        clamp(start.x + (event.nativeEvent.pageX - start.pageX) / board.width, 0, 1),
        clamp(start.y + (event.nativeEvent.pageY - start.pageY) / board.height, 0, 1),
      ),
  });

  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel={item.name}
      style={[
        styles.piece,
        {
          width: size,
          height: size,
          left: placement.x * board.width - size / 2,
          top: placement.y * board.height - size / 2,
          zIndex: placement.z,
        },
        selected && styles.pieceSelected,
      ]}
    >
      <Image source={displayImage(item)} style={styles.image} resizeMode="contain" />
    </View>
  );
}

function Tool(props: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.tool, props.disabled && styles.dim]}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
    >
      <Ionicons name={props.icon} size={20} color={colors.accent} />
      <Text style={styles.toolText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 10 },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  board: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  piece: { position: 'absolute', borderRadius: 6, borderWidth: 1.5, borderColor: 'transparent' },
  pieceSelected: { borderColor: colors.accent, borderStyle: 'dashed' },
  image: { width: '100%', height: '100%' },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  tools: { flexDirection: 'row', justifyContent: 'space-around' },
  tool: { alignItems: 'center', gap: 2, padding: 6 },
  toolText: { fontSize: 12, color: colors.accent },
  dim: { opacity: 0.4 },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
  save: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});

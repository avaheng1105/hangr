import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useCloset } from '../../ClosetContext';
import { colors } from '../../theme';

// The round + in the middle of the bottom bar: add an item from a photo.
function AddButton() {
  const { addPhoto, adding } = useCloset();
  return (
    <Pressable
      style={styles.addSlot}
      onPress={() => {
        // Show the wardrobe, where the new item's tile appears.
        router.navigate('/');
        void addPhoto();
      }}
      disabled={adding}
      accessibilityRole="button"
      accessibilityLabel="Add an item"
    >
      <View style={styles.add}>
        {adding ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Ionicons name="add" size={30} color="#FFFFFF" />
        )}
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Wardrobe',
          tabBarLabel: 'Wardrobe',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shirt-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="hangr"
        options={{
          title: 'Hangr',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen name="add" options={{ title: 'Add', tabBarButton: () => <AddButton /> }} />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  add: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});

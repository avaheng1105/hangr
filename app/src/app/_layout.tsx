import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ClosetProvider } from '../ClosetContext';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <ClosetProvider>
      <Stack
        screenOptions={{
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.text },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'My Wardrobe' }} />
        <Stack.Screen name="item/[id]" options={{ title: '' }} />
      </Stack>
      <StatusBar style="dark" />
    </ClosetProvider>
  );
}

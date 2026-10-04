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
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="item/[id]" options={{ title: '' }} />
        <Stack.Screen name="outfit/[id]" options={{ title: '' }} />
      </Stack>
      <StatusBar style="dark" />
    </ClosetProvider>
  );
}

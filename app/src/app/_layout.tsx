import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '../AuthContext';
import { ClosetProvider } from '../ClosetContext';
import { LoginScreen } from '../LoginScreen';
import { colors } from '../theme';

// The app once someone is signed in. A new account gets a fresh closet.
function SignedIn() {
  const { ready, needsSignIn, userId } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (needsSignIn) return <LoginScreen />;
  return (
    <ClosetProvider key={userId ?? 'sample'}>
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
        <Stack.Screen name="canvas/[id]" options={{ title: '' }} />
      </Stack>
    </ClosetProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SignedIn />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}

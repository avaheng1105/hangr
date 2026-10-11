import { AuthError } from '@supabase/supabase-js';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from './AuthContext';
import { colors } from './theme';

// Same as the backend's minimum (Supabase auth password_min_length).
const PASSWORD_MIN_CHARS = 6;

// What to tell the user about a failed sign-in or sign-up.
function authMessage(e: unknown): string {
  if (e instanceof AuthError) {
    switch (e.code) {
      case 'invalid_credentials':
        return "That email and password don't match an account.";
      case 'email_not_confirmed':
        return 'Confirm your email first: open the link we sent you, then sign in.';
      case 'user_already_exists':
      case 'email_exists':
        return 'There is already an account with that email. Sign in instead.';
      case 'weak_password':
        return `Use a password of at least ${PASSWORD_MIN_CHARS} characters.`;
      case 'over_email_send_rate_limit':
        return "We've sent too many emails for now. Try again in an hour.";
    }
  }
  return e instanceof Error ? e.message : String(e);
}

// Shown instead of the app until the user signs in.
export function LoginScreen() {
  const { signIn, signUp, isGuest } = useAuth();
  // A guest from before login existed most likely wants to keep their closet.
  const [creating, setCreating] = useState(isGuest);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const valid = /\S+@\S+\.\S+/.test(email.trim()) && password.length >= PASSWORD_MIN_CHARS;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (creating) {
        const mustConfirm = await signUp(email, password);
        if (mustConfirm) {
          setSentTo(email.trim());
          setCreating(false);
          setPassword('');
        }
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setCreating(!creating);
    setError(null);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.brand}>Hangr</Text>
        <Text style={styles.title}>{creating ? 'Create your account' : 'Sign in'}</Text>
        {creating && isGuest && (
          <Text style={styles.note}>The closet on this phone moves into your new account.</Text>
        )}
        {sentTo && !creating && (
          <Text style={styles.sent}>
            We sent a link to {sentTo}. Open it to confirm your email, then sign in here.
          </Text>
        )}

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#9A9DAA"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={creating ? `Password (${PASSWORD_MIN_CHARS}+ characters)` : 'Password'}
          placeholderTextColor="#9A9DAA"
          secureTextEntry
          autoComplete={creating ? 'new-password' : 'current-password'}
          textContentType={creating ? 'newPassword' : 'password'}
          onSubmitEditing={() => valid && !busy && void submit()}
        />
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (!valid || busy) && styles.dim]}
          onPress={() => void submit()}
          disabled={!valid || busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{creating ? 'Create account' : 'Sign in'}</Text>
          )}
        </Pressable>

        <Pressable onPress={switchMode} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>
            {creating ? 'Already have an account? Sign in' : 'New to Hangr? Create an account'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  brand: { fontSize: 32, fontWeight: '800', color: colors.accent, textAlign: 'center' },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  note: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  sent: {
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#E7E7F8',
    borderRadius: 8,
    padding: 12,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  error: { fontSize: 14, color: colors.danger },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.accent,
    marginTop: 4,
  },
  dim: { opacity: 0.5 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  link: { fontSize: 15, color: colors.accent, textAlign: 'center', marginTop: 8 },
});

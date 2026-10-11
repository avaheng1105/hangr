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
      case 'otp_expired':
        return 'That code is wrong or has expired. Check the email, or send a new code.';
      case 'same_password':
        return "That's already your password. Go back and sign in with it.";
    }
  }
  return e instanceof Error ? e.message : String(e);
}

type Mode = 'signIn' | 'create' | 'forgot' | 'reset';

const TITLES: Record<Mode, string> = {
  signIn: 'Sign in',
  create: 'Create your account',
  forgot: 'Forgot your password?',
  reset: 'Choose a new password',
};

const BUTTONS: Record<Mode, string> = {
  signIn: 'Sign in',
  create: 'Create account',
  forgot: 'Email me a code',
  reset: 'Save password and sign in',
};

// Shown instead of the app until the user signs in.
export function LoginScreen() {
  const { signIn, signUp, sendPasswordReset, resetPassword, isGuest } = useAuth();
  // A guest from before login existed most likely wants to keep their closet.
  const [mode, setMode] = useState<Mode>(isGuest ? 'create' : 'signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A note above the form, e.g. where an email went.
  const [notice, setNotice] = useState<string | null>(null);

  const emailOk = /\S+@\S+\.\S+/.test(email.trim());
  const passwordOk = password.length >= PASSWORD_MIN_CHARS;
  const valid =
    mode === 'forgot'
      ? emailOk
      : mode === 'reset'
        ? /^\d{6,10}$/.test(code.trim()) && passwordOk
        : emailOk && passwordOk;

  const go = (next: Mode, note: string | null = null) => {
    setMode(next);
    setError(null);
    setNotice(note);
    setPassword('');
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') {
        if (await signUp(email, password)) {
          go(
            'signIn',
            `We sent a link to ${email.trim()}. Open it to confirm your email, then sign in here.`,
          );
        }
      } else if (mode === 'forgot') {
        await sendPasswordReset(email);
        setCode('');
        go('reset', `If ${email.trim()} has an account, we've emailed it a code.`);
      } else if (mode === 'reset') {
        await resetPassword(email, code, password);
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const newPassword = mode === 'create' || mode === 'reset';

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.brand}>Hangr</Text>
        <Text style={styles.title}>{TITLES[mode]}</Text>
        {mode === 'create' && isGuest && (
          <Text style={styles.note}>The closet on this phone moves into your new account.</Text>
        )}
        {mode === 'forgot' && (
          <Text style={styles.note}>We&apos;ll email you a code to set a new one.</Text>
        )}
        {notice && <Text style={styles.sent}>{notice}</Text>}

        {mode !== 'reset' && (
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
        )}
        {mode === 'reset' && (
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="Code from the email"
            placeholderTextColor="#9A9DAA"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={10}
          />
        )}
        {mode !== 'forgot' && (
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={
              newPassword
                ? `${mode === 'reset' ? 'New password' : 'Password'} (${PASSWORD_MIN_CHARS}+ characters)`
                : 'Password'
            }
            placeholderTextColor="#9A9DAA"
            secureTextEntry
            autoComplete={newPassword ? 'new-password' : 'current-password'}
            textContentType={newPassword ? 'newPassword' : 'password'}
            onSubmitEditing={() => valid && !busy && void submit()}
          />
        )}
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
            <Text style={styles.buttonText}>{BUTTONS[mode]}</Text>
          )}
        </Pressable>

        {mode === 'signIn' && (
          <Pressable onPress={() => go('forgot')} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>
        )}
        {mode === 'reset' && (
          <Pressable onPress={() => go('forgot')} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Send a new code</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => go(mode === 'signIn' ? 'create' : 'signIn')}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.link}>
            {mode === 'signIn' ? 'New to Hangr? Create an account' : 'Back to sign in'}
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

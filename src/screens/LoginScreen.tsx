import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { signIn } from '../services/AuthService';

interface Props {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <View style={styles.logoArea}>
          <Text style={styles.logoIcon}>&#128222;</Text>
          <Text style={styles.title}>AI Receptionist</Text>
          <Text style={styles.subtitle}>Admin Dashboard</Text>
        </View>

        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="admin@admin.com"
            placeholderTextColor="#555"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password"
            placeholderTextColor="#555"
            secureTextEntry
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.loginBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Powered by NVIDIA NIM & Supabase</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoIcon: { fontSize: 50, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 16, color: '#76b900', marginTop: 4 },
  form: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 6, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, color: '#fff',
    fontSize: 16, borderWidth: 1, borderColor: '#333', marginBottom: 16,
  },
  loginBtn: {
    backgroundColor: '#76b900', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8,
  },
  loginBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
  error: { color: '#f44336', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  footer: { textAlign: 'center', color: '#444', fontSize: 12, marginTop: 40 },
});

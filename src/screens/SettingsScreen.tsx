import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import * as Storage from '../services/StorageService';
import { chatCompletion } from '../services/NvidiaAIClient';

interface Props {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      setApiKey(await Storage.getApiKey());
      setBusinessName(await Storage.getBusinessName());
    })();
  }, []);

  const save = async () => {
    await Storage.setApiKey(apiKey.trim());
    await Storage.setBusinessName(businessName.trim());
    Alert.alert('Saved', 'Settings saved successfully.');
  };

  const testApi = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Enter an API key first.');
      return;
    }
    setTesting(true);
    try {
      const response = await chatCompletion(apiKey.trim(), [
        { role: 'system', content: 'Reply with "API connection successful!" in exactly those words.' },
        { role: 'user', content: 'Test' },
      ]);
      Alert.alert('Success', `NVIDIA NIM responded:\n\n${response}`);
    } catch (error: any) {
      Alert.alert('Error', `API test failed:\n${error.message}`);
    }
    setTesting(false);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtn}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={save}>
          <Text style={styles.saveBtn}>Save</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>NVIDIA API Key</Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="nvapi-..."
          placeholderTextColor="#555"
          secureTextEntry
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.testBtn} onPress={testApi} disabled={testing}>
          <Text style={styles.testBtnText}>
            {testing ? 'Testing...' : 'Test API Connection'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Get your API key from build.nvidia.com
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Business Name</Text>
        <TextInput
          style={styles.input}
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Your Company Name"
          placeholderTextColor="#555"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>How It Works</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            1. Set your NVIDIA API key above{'\n'}
            2. Customize AI instructions in the Script tab{'\n'}
            3. Enable the AI Receptionist on the home screen{'\n'}
            4. Set this app as your default phone app when prompted{'\n'}
            5. Incoming calls will be auto-answered by AI
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20,
  },
  backBtn: { color: '#76b900', fontSize: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  saveBtn: { color: '#76b900', fontSize: 16, fontWeight: '600' },
  section: { marginHorizontal: 16, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#ccc', marginBottom: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#333',
  },
  testBtn: {
    backgroundColor: '#76b900', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12,
  },
  testBtnText: { color: '#000', fontWeight: '600', fontSize: 15 },
  hint: { color: '#666', fontSize: 12, marginTop: 8 },
  infoCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#333' },
  infoText: { color: '#ccc', fontSize: 14, lineHeight: 22 },
});

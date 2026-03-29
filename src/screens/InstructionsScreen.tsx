import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import * as Storage from '../services/StorageService';

interface Props {
  onBack: () => void;
}

export default function InstructionsScreen({ onBack }: Props) {
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    Storage.getCustomInstructions().then(setInstructions);
  }, []);

  const save = async () => {
    await Storage.setCustomInstructions(instructions);
    Alert.alert('Saved', 'Custom instructions saved.');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtn}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AI Script</Text>
        <TouchableOpacity onPress={save}>
          <Text style={styles.saveBtn}>Save</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Custom Instructions</Text>
        <Text style={styles.hint}>
          Tell the AI about your business, FAQs, how to handle specific questions,
          who to transfer calls to, etc.
        </Text>
        <TextInput
          style={styles.textArea}
          value={instructions}
          onChangeText={setInstructions}
          placeholder={`Example:\n\nBusiness: Acme Corp\nHours: Mon-Fri 9am-5pm\nAddress: 123 Main St\n\nFAQs:\n- Pricing starts at $99/month\n- Free trial available\n- Support email: help@acme.com\n\nTransfer rules:\n- Sales inquiries -> John (ext 101)\n- Tech support -> Sarah (ext 102)\n- Billing -> Mike (ext 103)`}
          placeholderTextColor="#444"
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Tips</Text>
        <View style={styles.tipCard}>
          <Text style={styles.tipText}>
            - Include your business name, hours, and location{'\n'}
            - List common questions and their answers{'\n'}
            - Specify who handles what (for call transfers){'\n'}
            - Add any special greetings or policies{'\n'}
            - The more detail, the better the AI performs
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
    paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20,
  },
  backBtn: { color: '#76b900', fontSize: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  saveBtn: { color: '#76b900', fontSize: 16, fontWeight: '600' },
  section: { marginHorizontal: 16, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#ccc', marginBottom: 8, textTransform: 'uppercase' },
  hint: { color: '#888', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  textArea: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    color: '#fff', fontSize: 15, minHeight: 250, borderWidth: 1, borderColor: '#333',
    lineHeight: 22,
  },
  tipCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#333' },
  tipText: { color: '#ccc', fontSize: 13, lineHeight: 22 },
});

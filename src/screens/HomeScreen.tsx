import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { callService } from '../services/CallService';
import * as Storage from '../services/StorageService';
import type { CallRecord } from '../services/ConversationManager';

interface Props {
  onNavigate: (screen: string) => void;
}

export default function HomeScreen({ onNavigate }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [callLog, setCallLog] = useState<CallRecord[]>([]);
  const [activeCall, setActiveCall] = useState<string | null>(null);

  useEffect(() => {
    loadState();
    const interval = setInterval(loadState, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    callService.init();

    const unsub1 = callService.on('incoming', (data) => {
      setActiveCall(data.phoneNumber);
    });
    const unsub2 = callService.on('disconnected', () => {
      setActiveCall(null);
      loadState();
    });

    return () => {
      unsub1();
      unsub2();
      callService.destroy();
    };
  }, []);

  const loadState = useCallback(async () => {
    const key = await Storage.getApiKey();
    setApiKeySet(key.length > 0);
    const en = await Storage.getEnabled();
    setEnabled(en);
    const log = await Storage.getCallLog();
    setCallLog(log);
  }, []);

  const toggleEnabled = async (value: boolean) => {
    if (value && !apiKeySet) {
      Alert.alert('API Key Required', 'Please set your NVIDIA API key in Settings first.');
      return;
    }

    if (value && Platform.OS === 'android') {
      const granted = await callService.requestPermissions();
      if (!granted) {
        Alert.alert('Permissions Required', 'Phone and audio permissions are needed.');
        return;
      }
      await callService.requestDefaultDialer();
    }

    await Storage.setEnabled(value);
    await callService.setEnabled(value);
    setEnabled(value);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>AI Receptionist</Text>
        <Text style={styles.subtitle}>Powered by NVIDIA NIM</Text>
      </View>

      {/* Status Card */}
      <View style={[styles.card, enabled ? styles.cardActive : styles.cardInactive]}>
        <View style={styles.statusRow}>
          <View>
            <Text style={styles.statusLabel}>AI Receptionist</Text>
            <Text style={[styles.statusText, enabled ? styles.activeText : styles.inactiveText]}>
              {enabled ? 'Active - Answering Calls' : 'Disabled'}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={toggleEnabled}
            trackColor={{ false: '#555', true: '#4CAF50' }}
            thumbColor={enabled ? '#fff' : '#ccc'}
          />
        </View>
        {!apiKeySet && (
          <Text style={styles.warning}>Set NVIDIA API key in Settings to enable</Text>
        )}
      </View>

      {/* Active Call Banner */}
      {activeCall && (
        <View style={styles.activeCallCard}>
          <View style={styles.pulseIndicator} />
          <View style={{ flex: 1 }}>
            <Text style={styles.activeCallLabel}>Active Call</Text>
            <Text style={styles.activeCallNumber}>{activeCall}</Text>
          </View>
          <Text style={styles.activeCallAI}>AI is responding...</Text>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onNavigate('settings')}>
          <Text style={styles.actionIcon}>&#9881;</Text>
          <Text style={styles.actionLabel}>Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onNavigate('test')}>
          <Text style={styles.actionIcon}>&#9742;</Text>
          <Text style={styles.actionLabel}>Test AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onNavigate('instructions')}>
          <Text style={styles.actionIcon}>&#9998;</Text>
          <Text style={styles.actionLabel}>Script</Text>
        </TouchableOpacity>
      </View>

      {/* Call Log */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Calls</Text>
          {callLog.length > 0 && (
            <TouchableOpacity onPress={() => { Storage.clearCallLog(); setCallLog([]); }}>
              <Text style={styles.clearBtn}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {callLog.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>&#128222;</Text>
            <Text style={styles.emptyText}>No calls yet</Text>
            <Text style={styles.emptySubtext}>
              Enable the AI receptionist and incoming calls will appear here
            </Text>
          </View>
        ) : (
          callLog.slice(0, 20).map((call) => (
            <TouchableOpacity
              key={call.id}
              style={styles.callItem}
              onPress={() => onNavigate(`transcript:${call.id}`)}
            >
              <View style={styles.callIcon}>
                <Text style={{ fontSize: 20 }}>&#128222;</Text>
              </View>
              <View style={styles.callInfo}>
                <Text style={styles.callNumber}>{call.phoneNumber}</Text>
                <Text style={styles.callTime}>{formatTime(call.timestamp)}</Text>
              </View>
              <Text style={styles.callDuration}>{formatDuration(call.duration)}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 14, color: '#76b900', marginTop: 4 },
  card: { marginHorizontal: 16, borderRadius: 16, padding: 20, marginBottom: 16 },
  cardActive: { backgroundColor: '#1a2e0a', borderWidth: 1, borderColor: '#76b900' },
  cardInactive: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 16, fontWeight: '600', color: '#fff' },
  statusText: { fontSize: 13, marginTop: 4 },
  activeText: { color: '#76b900' },
  inactiveText: { color: '#888' },
  warning: { color: '#ff9800', fontSize: 12, marginTop: 10 },
  activeCallCard: {
    marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16,
    backgroundColor: '#1a3a0a', borderWidth: 1, borderColor: '#4CAF50',
    flexDirection: 'row', alignItems: 'center',
  },
  pulseIndicator: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50', marginRight: 12,
  },
  activeCallLabel: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  activeCallNumber: { fontSize: 16, color: '#fff', fontWeight: '600' },
  activeCallAI: { fontSize: 12, color: '#4CAF50' },
  actionsRow: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 20, gap: 12,
  },
  actionBtn: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#333',
  },
  actionIcon: { fontSize: 24, marginBottom: 6 },
  actionLabel: { fontSize: 12, color: '#ccc' },
  section: { marginHorizontal: 16, marginBottom: 30 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  clearBtn: { color: '#76b900', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#888', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#555', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
  callItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  callIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  callInfo: { flex: 1 },
  callNumber: { fontSize: 15, color: '#fff', fontWeight: '500' },
  callTime: { fontSize: 12, color: '#888', marginTop: 2 },
  callDuration: { fontSize: 13, color: '#76b900' },
});

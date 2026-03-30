import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
} from 'react-native';
import { supabaseAdmin } from '../services/SupabaseClient';

interface CallLogEntry {
  id: string;
  phone_number: string;
  caller_name: string;
  duration: number;
  message_taken: string;
  status: string;
  created_at: string;
  call_goal?: string;
}

interface Props {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

export default function AdminAppPreviewScreen({ onBack, onNavigate }: Props) {
  const DUMMY_CALLS: CallLogEntry[] = [
    {
      id: 'demo-1',
      phone_number: '+63 917 123 4567',
      caller_name: 'Maria Santos',
      duration: 185,
      message_taken: JSON.stringify({
        type: 'booking',
        caller_name: 'Maria Santos',
        phone_number: '+63 917 123 4567',
        preferred_date: 'April 2, 2026',
        preferred_time: '2:00 PM',
        service_requested: 'Haircut & Hair Color',
        special_requests: 'Wants balayage style',
        status: 'confirmed',
        summary: 'Si Maria po ay nag-book ng haircut at hair color (balayage) sa April 2, 2:00 PM. Confirmed na po.',
      }),
      status: 'completed',
      created_at: new Date(Date.now() - 1800000).toISOString(),
      call_goal: 'book',
    },
    {
      id: 'demo-2',
      phone_number: '+63 928 987 6543',
      caller_name: 'Juan dela Cruz',
      duration: 240,
      message_taken: JSON.stringify({
        type: 'order',
        caller_name: 'Juan dela Cruz',
        phone_number: '+63 928 987 6543',
        items: [
          { name: 'Chicken Adobo', quantity: 2, notes: 'Extra rice' },
          { name: 'Sinigang na Baboy', quantity: 1, notes: 'Spicy' },
          { name: 'Halo-Halo', quantity: 3, notes: '' },
        ],
        delivery_method: 'delivery',
        delivery_address: '456 Rizal Ave, Makati City',
        estimated_total: 'P850',
        status: 'confirmed',
        summary: 'Order ni Juan: 2x Chicken Adobo, 1x Sinigang, 3x Halo-Halo. For delivery sa Makati. Total P850.',
      }),
      status: 'completed',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      call_goal: 'order',
    },
    {
      id: 'demo-3',
      phone_number: '+63 906 555 1234',
      caller_name: '',
      duration: 45,
      message_taken: JSON.stringify({
        type: 'booking',
        caller_name: '',
        phone_number: '+63 906 555 1234',
        status: 'pending',
        summary: 'Nag-inquire lang po about pricing ng manicure. Hindi pa nag-book.',
      }),
      status: 'completed',
      created_at: new Date(Date.now() - 14400000).toISOString(),
      call_goal: 'book',
    },
    {
      id: 'demo-4',
      phone_number: '+63 915 222 3333',
      caller_name: '',
      duration: 0,
      message_taken: '',
      status: 'missed',
      created_at: new Date(Date.now() - 28800000).toISOString(),
    },
  ];

  const [calls, setCalls] = useState<CallLogEntry[]>([]);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabaseAdmin
          .from('call_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);
        // Use real data if available, otherwise show dummy data
        if (data && data.length > 0) {
          setCalls(data);
        } else {
          setCalls(DUMMY_CALLS);
        }
      } catch {
        setCalls(DUMMY_CALLS);
      }
    })();
  }, []);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const parseSummary = (msg: string) => {
    if (!msg) return null;
    try { return JSON.parse(msg); } catch { return { summary: msg }; }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtn}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>App Preview</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.previewLabel}>This is how the phone app looks to users</Text>

      {/* Phone Frame */}
      <View style={styles.phoneFrame}>
        <View style={styles.phoneNotch} />

        <ScrollView style={styles.phoneScreen} nestedScrollEnabled>
          {/* App Header */}
          <View style={styles.appHeader}>
            <Text style={styles.appTitle}>AI Receptionist</Text>
            <Text style={styles.appSubtitle}>Powered by NVIDIA NIM</Text>
          </View>

          {/* Status Card */}
          <View style={[styles.appCard, enabled ? styles.appCardActive : styles.appCardInactive]}>
            <View style={styles.appStatusRow}>
              <View>
                <Text style={styles.appStatusLabel}>AI Receptionist</Text>
                <Text style={[styles.appStatusText, { color: enabled ? '#76b900' : '#888' }]}>
                  {enabled ? 'Active - Answering Calls' : 'Disabled'}
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: '#555', true: '#4CAF50' }}
                thumbColor={enabled ? '#fff' : '#ccc'}
              />
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.appActionsRow}>
            <TouchableOpacity style={styles.appActionBtn} onPress={() => onNavigate('settings')}>
              <Text style={{ fontSize: 18 }}>&#9881;</Text>
              <Text style={styles.appActionLabel}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.appActionBtn} onPress={() => onNavigate('tenant-config')}>
              <Text style={{ fontSize: 18 }}>&#9998;</Text>
              <Text style={styles.appActionLabel}>AI Config</Text>
            </TouchableOpacity>
          </View>

          {/* Call Summaries */}
          <View style={styles.appSection}>
            <Text style={styles.appSectionTitle}>Call Summaries</Text>
          </View>

          {calls.length === 0 ? (
            <View style={styles.appEmpty}>
              <Text style={{ fontSize: 30 }}>&#128222;</Text>
              <Text style={styles.appEmptyText}>No calls yet</Text>
              <Text style={styles.appEmptySubtext}>
                Enable the AI receptionist and call summaries will appear here
              </Text>
            </View>
          ) : (
            calls.map((call) => {
              const summary = parseSummary(call.message_taken);
              const isOrder = summary?.type === 'order' || call.call_goal === 'order';

              return (
                <View key={call.id} style={styles.appSummaryCard}>
                  {/* Card Header */}
                  <View style={styles.appCardHeader}>
                    <View style={styles.appCardHeaderLeft}>
                      <View style={[styles.appGoalIcon, {
                        backgroundColor: isOrder ? '#2e1a0a' : '#0a1a2e'
                      }]}>
                        <Text style={{ fontSize: 14 }}>{isOrder ? '\u{1F4E6}' : '\u{1F4C5}'}</Text>
                      </View>
                      <View>
                        <Text style={styles.appCardPhone}>{call.phone_number}</Text>
                        {call.caller_name ? <Text style={styles.appCardName}>{call.caller_name}</Text> : null}
                      </View>
                    </View>
                    <Text style={styles.appCardTime}>{formatTime(call.created_at)}</Text>
                  </View>

                  {/* Summary */}
                  {summary?.summary ? (
                    <Text style={styles.appSummaryText}>{summary.summary}</Text>
                  ) : (
                    <Text style={styles.appSummaryEmpty}>Call completed</Text>
                  )}

                  {/* Detail Chips */}
                  <View style={styles.appChipsRow}>
                    {summary?.preferred_date && (
                      <View style={styles.appChip}>
                        <Text style={styles.appChipText}>{'\u{1F4C5}'} {summary.preferred_date}</Text>
                      </View>
                    )}
                    {summary?.items && summary.items.length > 0 && (
                      <View style={styles.appChip}>
                        <Text style={styles.appChipText}>{'\u{1F4E6}'} {summary.items.length} items</Text>
                      </View>
                    )}
                    {summary?.delivery_method && (
                      <View style={styles.appChip}>
                        <Text style={styles.appChipText}>
                          {summary.delivery_method === 'delivery' ? '\u{1F69A} Delivery' : '\u{1F3EA} Pickup'}
                        </Text>
                      </View>
                    )}
                    {summary?.estimated_total && (
                      <View style={[styles.appChip, { backgroundColor: '#1a2e0a' }]}>
                        <Text style={[styles.appChipText, { color: '#76b900' }]}>{summary.estimated_total}</Text>
                      </View>
                    )}
                    {summary?.status && (
                      <View style={[styles.appChip, {
                        backgroundColor: summary.status === 'confirmed' ? '#1a2e0a' : '#1a1a2e'
                      }]}>
                        <Text style={[styles.appChipText, {
                          color: summary.status === 'confirmed' ? '#76b900' : '#64b5f6'
                        }]}>{summary.status}</Text>
                      </View>
                    )}
                    <Text style={styles.appDuration}>{formatDuration(call.duration)}</Text>
                  </View>
                </View>
              );
            })
          )}

          <View style={{ height: 30 }} />
        </ScrollView>

        {/* Phone Home Bar */}
        <View style={styles.phoneHomeBar}>
          <View style={styles.phoneHomePill} />
        </View>
      </View>

      <View style={{ height: 40 }} />
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
  previewLabel: { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 16 },

  // Phone Frame
  phoneFrame: {
    marginHorizontal: 30,
    backgroundColor: '#111',
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#333',
    maxHeight: 640,
  },
  phoneNotch: {
    width: 120, height: 28, backgroundColor: '#000', borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16, alignSelf: 'center', marginTop: 0, zIndex: 1,
  },
  phoneScreen: {
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 12,
    maxHeight: 570,
  },
  phoneHomeBar: {
    height: 30, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center',
  },
  phoneHomePill: {
    width: 100, height: 4, backgroundColor: '#444', borderRadius: 2,
  },

  // App UI inside phone
  appHeader: { paddingTop: 16, paddingBottom: 10, alignItems: 'center' },
  appTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  appSubtitle: { fontSize: 10, color: '#76b900', marginTop: 2 },
  appCard: { borderRadius: 12, padding: 12, marginBottom: 10 },
  appCardActive: { backgroundColor: '#1a2e0a', borderWidth: 1, borderColor: '#76b900' },
  appCardInactive: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
  appStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appStatusLabel: { fontSize: 13, fontWeight: '600', color: '#fff' },
  appStatusText: { fontSize: 11, marginTop: 2 },
  appActionsRow: { flexDirection: 'row', marginBottom: 12, gap: 6 },
  appActionBtn: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, padding: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#333',
  },
  appActionLabel: { fontSize: 9, color: '#ccc', marginTop: 4 },
  appSection: { marginBottom: 8 },
  appSectionTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  appEmpty: { alignItems: 'center', paddingVertical: 30 },
  appEmptyText: { fontSize: 13, color: '#888', fontWeight: '600', marginTop: 8 },
  appEmptySubtext: { fontSize: 10, color: '#555', textAlign: 'center', marginTop: 4, paddingHorizontal: 10 },

  // Summary cards in phone
  appSummaryCard: {
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: '#222',
  },
  appCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  appCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  appGoalIcon: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  appCardPhone: { fontSize: 12, fontWeight: '600', color: '#fff' },
  appCardName: { fontSize: 10, color: '#888' },
  appCardTime: { fontSize: 10, color: '#666' },
  appSummaryText: { fontSize: 11, color: '#ccc', lineHeight: 16, marginBottom: 6 },
  appSummaryEmpty: { fontSize: 10, color: '#555', fontStyle: 'italic', marginBottom: 6 },
  appChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  appChip: { backgroundColor: '#111', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  appChipText: { fontSize: 9, color: '#aaa' },
  appDuration: { fontSize: 10, color: '#555', marginLeft: 'auto' },
});

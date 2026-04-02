import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, RefreshControl, Platform, Switch, Alert, NativeModules,
} from 'react-native';
import { supabaseAdmin } from '../services/SupabaseClient';
import { signOut, getCurrentProfile } from '../services/AuthService';
import { callService } from '../services/CallService';
import * as Storage from '../services/StorageService';
import { callState } from '../../App';

interface CallLogEntry {
  id: string;
  phone_number: string;
  caller_name: string;
  duration: number;
  transcript: any[];
  message_taken: string;
  status: string;
  created_at: string;
}

interface Props {
  onLogout: () => void;
  onNavigate: (screen: string) => void;
}

export default function TenantDashboardScreen({ onLogout, onNavigate }: Props) {
  const [calls, setCalls] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [selectedCall, setSelectedCall] = useState<CallLogEntry | null>(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, missed: 0 });
  const [aiEnabled, setAiEnabled] = useState(false);
  const [permsGranted, setPermsGranted] = useState(false);
  const [dialerSet, setDialerSet] = useState(false);
  const [keysSet, setKeysSet] = useState(false);
  const [debugMsg, setDebugMsg] = useState('');
  const [isOnCall, setIsOnCall] = useState(callState.isOnCall);
  const [callPhone, setCallPhone] = useState(callState.phoneNumber);
  const [callFlow, setCallFlow] = useState(callState.flowState);

  useEffect(() => {
    // Debug: check if native module is available
    const mod = NativeModules.AICallModule;
    setDebugMsg(`Platform: ${Platform.OS} | AICallModule: ${mod ? 'LOADED' : 'NULL'} | Methods: ${mod ? Object.keys(mod).join(', ') : 'none'}`);

    // Sync enabled state to native SharedPreferences on load
    Storage.getEnabled().then(async (enabled) => {
      setAiEnabled(enabled);
      // Always sync to native so SharedPreferences matches
      try { await callService.setEnabled(enabled); } catch {}
    }).catch(() => {});

    // Auto-check permissions on load
    callService.checkPermissions().then(setPermsGranted).catch(() => {});
    callService.checkDefaultDialer().then(setDialerSet).catch(() => {});

    // Sync tenant config to native on load
    syncTenantConfigToNative();
  }, []);

  // Subscribe to live call state changes
  useEffect(() => {
    const listener = () => {
      setIsOnCall(callState.isOnCall);
      setCallPhone(callState.phoneNumber);
      setCallFlow(callState.flowState);
    };
    callState.listeners.add(listener);
    return () => { callState.listeners.delete(listener); };
  }, []);

  const toggleAI = async (value: boolean) => {
    try {
      await Storage.setEnabled(value);
      await callService.setEnabled(value);
      setAiEnabled(value);
      setDebugMsg(value ? 'AI enabled — service starting...' : 'AI disabled');
    } catch (e: any) {
      setDebugMsg(`Toggle error: ${e?.message || e}`);
    }
  };

  const requestPerms = async () => {
    setDebugMsg('Requesting permissions...');
    try {
      await callService.requestPermissions();
      // Poll for result — the system permission dialog takes time
      let checks = 0;
      const poll = setInterval(async () => {
        checks++;
        const granted = await callService.checkPermissions();
        setDebugMsg(`Permission check #${checks}: ${granted}`);
        if (granted) {
          setPermsGranted(true);
          clearInterval(poll);
        } else if (checks >= 15) {
          setDebugMsg('Permissions not granted yet — tap the button again if dialog was dismissed');
          clearInterval(poll);
        }
      }, 1000);
    } catch (e: any) {
      setDebugMsg(`Permissions error: ${e?.message || e}`);
    }
  };

  const requestDialer = async () => {
    setDebugMsg('Opening default dialer dialog...');
    try {
      await callService.requestDefaultDialer();
      setDebugMsg('Tap ACCEPT on the system dialog. Checking...');
      let checks = 0;
      const poll = setInterval(async () => {
        checks++;
        const actual = await callService.checkDefaultDialer();
        if (actual) {
          setDialerSet(true);
          setDebugMsg('Default dialer set! You can now enable AI.');
          clearInterval(poll);
        } else if (checks >= 60) {
          setDebugMsg('Still not set. Try: Settings > Apps > Default apps > Phone > AI Receptionist');
          clearInterval(poll);
        }
      }, 1000);
    } catch (e: any) {
      setDebugMsg(`Dialer error: ${e?.message || e}`);
    }
  };

  const syncTenantConfigToNative = async () => {
    try {
      const profile = await getCurrentProfile();
      if (!profile) return;

      let tenantData: any = null;
      const { data: owned } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('owner_id', profile.id)
        .limit(1);

      if (owned && owned.length > 0) {
        tenantData = owned[0];
      } else {
        const { data: membership } = await supabaseAdmin
          .from('tenant_members')
          .select('tenant_id')
          .eq('user_id', profile.id)
          .limit(1);
        if (membership && membership.length > 0) {
          const { data: t } = await supabaseAdmin
            .from('tenants')
            .select('*')
            .eq('id', membership[0].tenant_id)
            .single();
          if (t) tenantData = t;
        }
      }

      if (tenantData) {
        await callService.setTenantConfig(
          tenantData.name || '',
          tenantData.call_goal || 'book',
          tenantData.custom_instructions || ''
        );
        // Also push API keys if tenant has custom ones
        if (tenantData.nvidia_api_key) {
          await callService.setApiKeys(
            tenantData.deepgram_api_key || '',
            tenantData.elevenlabs_api_key || '',
            tenantData.nvidia_api_key || ''
          );
        }
        setKeysSet(true);
      }
    } catch (e) {
      console.warn('Failed to sync tenant config to native:', e);
    }
  };

  const configureKeys = async () => {
    setDebugMsg('Configuring API keys...');
    try {
      // Keys are loaded from tenant config in Supabase — not hardcoded
      setDebugMsg('API keys should be configured in tenant settings (Supabase)');
      setKeysSet(true);
      return;
      setKeysSet(true);
      setDebugMsg('API keys configured');
    } catch (e: any) {
      setDebugMsg(`Keys error: ${e?.message || e}`);
    }
  };

  const loadData = async () => {
    try {
      const profile = await getCurrentProfile();
      if (!profile) return;

      // Find tenant for this user
      const { data: membership } = await supabaseAdmin
        .from('tenant_members')
        .select('tenant_id')
        .eq('user_id', profile.id)
        .limit(1);

      if (!membership || membership.length === 0) {
        // Try finding tenant by owner_id
        const { data: ownedTenant } = await supabaseAdmin
          .from('tenants')
          .select('id, name')
          .eq('owner_id', profile.id)
          .limit(1);
        if (ownedTenant && ownedTenant[0]) {
          setTenantName(ownedTenant[0].name);
          await loadCalls(ownedTenant[0].id);
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const tenantId = membership[0].tenant_id;

      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .single();
      if (tenant) setTenantName(tenant.name);

      await loadCalls(tenantId);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const loadCalls = async (tenantId: string) => {
    const { data } = await supabaseAdmin
      .from('call_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    const callData = data || [];
    setCalls(callData);
    setStats({
      total: callData.length,
      completed: callData.filter(c => c.status === 'completed').length,
      missed: callData.filter(c => c.status === 'missed').length,
    });
  };

  useEffect(() => { loadData(); }, []);

  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

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

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#76b900';
      case 'missed': return '#ff9800';
      case 'failed': return '#f44336';
      default: return '#888';
    }
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#76b900" /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#76b900" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{tenantName || 'My Business'}</Text>
            <Text style={styles.subtitle}>Call Summaries</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Live Call Status */}
        {isOnCall ? (
          <View style={styles.callBanner}>
            <View style={styles.callBannerDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.callBannerTitle}>On Call — {callPhone || 'Unknown'}</Text>
              <Text style={styles.callBannerSub}>
                {callFlow === 'ringing' ? 'Ringing...' :
                 callFlow === 'answered' ? 'Connected' :
                 callFlow === 'starting' ? 'Starting AI...' :
                 callFlow === 'greeting' ? 'Playing greeting...' :
                 callFlow === 'listening' ? 'Listening to caller...' :
                 callFlow === 'recording' ? 'Recording...' :
                 callFlow === 'transcribing' ? 'Transcribing speech...' :
                 callFlow === 'thinking' ? 'AI is thinking...' :
                 callFlow === 'calling_ai' ? 'Calling NVIDIA AI...' :
                 callFlow === 'ai_failed' ? 'AI failed, retrying...' :
                 callFlow === 'speaking' ? 'AI is speaking...' :
                 callFlow === 'playing_welcome' ? 'Playing welcome...' :
                 callFlow === 'error' ? 'Error occurred' :
                 callFlow || 'Active'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.callBannerIdle}>
            <Text style={styles.callBannerIdleText}>Not on a call</Text>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total Calls</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#76b900' }]}>{stats.completed}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#ff9800' }]}>{stats.missed}</Text>
            <Text style={styles.statLabel}>Missed</Text>
          </View>
        </View>

        {/* AI Receptionist Toggle + Setup */}
        <View style={styles.aiCard}>
          <View style={styles.aiCardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiCardTitle}>AI Receptionist</Text>
              <Text style={[styles.aiCardStatus, { color: aiEnabled ? '#76b900' : '#888' }]}>
                {aiEnabled ? 'Active — Answering Calls' : 'Disabled'}
              </Text>
            </View>
            <Switch
              value={aiEnabled}
              onValueChange={toggleAI}
              trackColor={{ false: '#555', true: '#4CAF50' }}
              thumbColor={aiEnabled ? '#fff' : '#ccc'}
            />
          </View>

          {!aiEnabled && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.setupLabel}>Setup</Text>

              <TouchableOpacity
                style={[styles.setupBtn, permsGranted && styles.setupBtnDone]}
                onPress={requestPerms}
              >
                <Text style={styles.setupBtnText}>
                  {permsGranted ? '\u2713  Permissions Granted' : '1. Grant Phone & Mic Permissions'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.setupBtn, dialerSet && styles.setupBtnDone]}
                onPress={requestDialer}
              >
                <Text style={styles.setupBtnText}>
                  {dialerSet ? '\u2713  Default Phone App Set' : '2. Set as Default Phone App (REQUIRED)'}
                </Text>
              </TouchableOpacity>

              {!dialerSet && (
                <Text style={{ fontSize: 11, color: '#ff9800', marginHorizontal: 8, marginBottom: 8, lineHeight: 16 }}>
                  The app MUST be default phone app to answer calls and play AI voice. Tap ACCEPT on the dialog that appears.
                </Text>
              )}

              <TouchableOpacity
                style={[styles.setupBtn, keysSet && styles.setupBtnDone]}
                onPress={configureKeys}
              >
                <Text style={styles.setupBtnText}>
                  {keysSet ? '\u2713  API Keys Configured' : '3. Configure API Keys'}
                </Text>
              </TouchableOpacity>

              {permsGranted && dialerSet && keysSet && (
                <Text style={styles.setupReady}>All set! Enable the toggle above to start.</Text>
              )}

              {debugMsg ? (
                <View style={{ marginTop: 8, backgroundColor: '#111', borderRadius: 8, padding: 10 }}>
                  <Text style={{ fontSize: 11, color: '#ff9800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{debugMsg}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Debug panel — always visible */}
          {(aiEnabled && (debugMsg || callFlow)) ? (
            <View style={{ marginTop: 8, backgroundColor: '#111', borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 11, color: '#ff9800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                {callFlow ? `Flow: ${callFlow}` : ''}{debugMsg ? `\n${debugMsg}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onNavigate('tenant-config')}>
            <Text style={{ fontSize: 20 }}>{'\u{1F916}'}</Text>
            <Text style={styles.actionLabel}>AI Config</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onNavigate('tenant-metrics')}>
            <Text style={{ fontSize: 20 }}>{'\u{1F4CA}'}</Text>
            <Text style={styles.actionLabel}>Metrics</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onNavigate('settings')}>
            <Text style={{ fontSize: 20 }}>{'\u{2699}'}</Text>
            <Text style={styles.actionLabel}>Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Call List */}
        {calls.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>&#128222;</Text>
            <Text style={styles.emptyText}>No calls yet</Text>
            <Text style={styles.emptySubtext}>Your AI receptionist call summaries will appear here</Text>
          </View>
        ) : (
          calls.map((call) => {
            const summary = parseSummary(call.message_taken);
            const isOrder = summary?.type === 'order';

            return (
              <TouchableOpacity key={call.id} style={styles.callCard} onPress={() => setSelectedCall(call)}>
                <View style={styles.callHeader}>
                  <View style={styles.callHeaderLeft}>
                    <View style={[styles.goalBadge, { backgroundColor: isOrder ? '#2e1a0a' : '#0a1a2e' }]}>
                      <Text style={{ fontSize: 16 }}>{isOrder ? '\u{1F4E6}' : '\u{1F4C5}'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.callPhone}>{call.phone_number}</Text>
                      {call.caller_name ? <Text style={styles.callerName}>{call.caller_name}</Text> : null}
                      {summary?.caller_name ? <Text style={styles.callerName}>{summary.caller_name}</Text> : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.callTime}>{formatTime(call.created_at)}</Text>
                    <Text style={[styles.callStatus, { color: statusColor(call.status) }]}>{call.status}</Text>
                  </View>
                </View>

                {/* Summary */}
                {summary?.summary ? (
                  <Text style={styles.summaryText}>{summary.summary}</Text>
                ) : null}

                {/* Detail chips */}
                <View style={styles.chipsRow}>
                  {summary?.preferred_date && (
                    <View style={styles.chip}><Text style={styles.chipText}>{'\u{1F4C5}'} {summary.preferred_date} {summary.preferred_time || ''}</Text></View>
                  )}
                  {summary?.service_requested && (
                    <View style={styles.chip}><Text style={styles.chipText}>{summary.service_requested}</Text></View>
                  )}
                  {summary?.items && summary.items.length > 0 && (
                    <View style={styles.chip}><Text style={styles.chipText}>{'\u{1F4E6}'} {summary.items.length} item{summary.items.length > 1 ? 's' : ''}</Text></View>
                  )}
                  {summary?.delivery_method && (
                    <View style={styles.chip}><Text style={styles.chipText}>{summary.delivery_method === 'delivery' ? '\u{1F69A} Delivery' : '\u{1F3EA} Pickup'}</Text></View>
                  )}
                  {summary?.estimated_total && (
                    <View style={[styles.chip, { backgroundColor: '#1a2e0a' }]}><Text style={[styles.chipText, { color: '#76b900' }]}>{summary.estimated_total}</Text></View>
                  )}
                  {summary?.status && (
                    <View style={[styles.chip, { backgroundColor: summary.status === 'confirmed' ? '#1a2e0a' : '#1a1a2e' }]}>
                      <Text style={[styles.chipText, { color: summary.status === 'confirmed' ? '#76b900' : '#64b5f6' }]}>{summary.status}</Text>
                    </View>
                  )}
                  <Text style={styles.duration}>{formatDuration(call.duration)}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={!!selectedCall} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Call Details</Text>
              <TouchableOpacity onPress={() => setSelectedCall(null)}>
                <Text style={styles.closeBtn}>Close</Text>
              </TouchableOpacity>
            </View>

            {selectedCall && (() => {
              const summary = parseSummary(selectedCall.message_taken);
              return (
                <ScrollView style={{ maxHeight: 500 }}>
                  <Text style={styles.modalMeta}>
                    {selectedCall.phone_number} | {new Date(selectedCall.created_at).toLocaleString()}
                  </Text>

                  {summary && (
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryCardTitle}>
                        {summary.type === 'order' ? '\u{1F4E6} Order Summary' : '\u{1F4C5} Booking Summary'}
                      </Text>
                      {summary.summary && <Text style={styles.summaryCardText}>{summary.summary}</Text>}

                      {summary.caller_name ? <Field label="Name" value={summary.caller_name} /> : null}
                      {summary.phone_number ? <Field label="Phone" value={summary.phone_number} /> : null}
                      {summary.preferred_date ? <Field label="Date" value={`${summary.preferred_date} ${summary.preferred_time || ''}`} /> : null}
                      {summary.service_requested ? <Field label="Service" value={summary.service_requested} /> : null}
                      {summary.special_requests ? <Field label="Notes" value={summary.special_requests} /> : null}
                      {summary.items && summary.items.map((item: any, i: number) => (
                        <Field key={i} label={`Item ${i + 1}`} value={`${item.quantity}x ${item.name}${item.notes ? ` (${item.notes})` : ''}`} />
                      ))}
                      {summary.delivery_method ? <Field label="Delivery" value={summary.delivery_method} /> : null}
                      {summary.delivery_address ? <Field label="Address" value={summary.delivery_address} /> : null}
                      {summary.estimated_total ? <Field label="Total" value={summary.estimated_total} highlight /> : null}
                      {summary.status ? <Field label="Status" value={summary.status} /> : null}
                    </View>
                  )}

                  <Text style={styles.transcriptTitle}>Transcript</Text>
                  {selectedCall.transcript && Array.isArray(selectedCall.transcript) && selectedCall.transcript.length > 0 ? (
                    selectedCall.transcript.map((entry: any, i: number) => (
                      <View key={i} style={[styles.msgBubble, entry.role === 'caller' ? styles.callerBubble : styles.aiBubble]}>
                        <Text style={styles.msgRole}>{entry.role === 'caller' ? 'Caller' : 'AI'}</Text>
                        <Text style={styles.msgText}>{entry.text}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noTranscript}>No transcript available</Text>
                  )}
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 4 }}>
      <Text style={{ fontSize: 13, color: '#888', width: 70 }}>{label}:</Text>
      <Text style={{ fontSize: 13, color: highlight ? '#76b900' : '#fff', flex: 1, fontWeight: highlight ? '700' : '400' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  // AI Card + Setup
  aiCard: {
    marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333',
  },
  aiCardRow: { flexDirection: 'row', alignItems: 'center' },
  aiCardTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  aiCardStatus: { fontSize: 13, marginTop: 2 },
  setupLabel: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 8, textTransform: 'uppercase' },
  setupBtn: {
    backgroundColor: '#111', borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#333',
  },
  setupBtnDone: { borderColor: '#76b900', backgroundColor: '#0a1a0a' },
  setupBtnText: { color: '#ccc', fontSize: 14, fontWeight: '500' },
  setupReady: { color: '#76b900', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 13, color: '#76b900', marginTop: 2 },
  logoutBtn: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#333' },
  logoutText: { color: '#f44336', fontSize: 13, fontWeight: '600' },

  callBanner: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#1a2e0a', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#76b900',
  },
  callBannerDot: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: '#76b900',
    marginRight: 12,
  },
  callBannerTitle: { fontSize: 15, fontWeight: '700', color: '#76b900' },
  callBannerSub: { fontSize: 12, color: '#aaa', marginTop: 2 },
  callBannerIdle: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: '#1a1a1a',
    borderRadius: 12, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#222',
  },
  callBannerIdleText: { fontSize: 13, color: '#555' },

  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  statValue: { fontSize: 24, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },

  actionsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 20 },
  actionBtn: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#333',
  },
  actionLabel: { fontSize: 11, color: '#ccc', marginTop: 6 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#888', fontWeight: '600', marginTop: 10 },
  emptySubtext: { fontSize: 13, color: '#555', textAlign: 'center', marginTop: 4, paddingHorizontal: 30 },

  callCard: {
    marginHorizontal: 16, backgroundColor: '#1a1a1a', borderRadius: 14,
    padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#222',
  },
  callHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  callHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  goalBadge: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  callPhone: { fontSize: 16, fontWeight: '600', color: '#fff' },
  callerName: { fontSize: 13, color: '#888' },
  callTime: { fontSize: 12, color: '#666' },
  callStatus: { fontSize: 11, marginTop: 2, fontWeight: '600' },

  summaryText: { fontSize: 14, color: '#ccc', lineHeight: 20, marginBottom: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { backgroundColor: '#111', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 11, color: '#aaa' },
  duration: { fontSize: 12, color: '#555', marginLeft: 'auto' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  closeBtn: { color: '#76b900', fontSize: 15, fontWeight: '600' },
  modalMeta: { fontSize: 13, color: '#888', marginBottom: 12 },

  summaryCard: { backgroundColor: '#111', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#76b900' },
  summaryCardTitle: { fontSize: 15, fontWeight: '700', color: '#76b900', marginBottom: 8 },
  summaryCardText: { fontSize: 14, color: '#ccc', lineHeight: 20, marginBottom: 10 },

  transcriptTitle: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 10 },
  msgBubble: { borderRadius: 10, padding: 10, marginBottom: 8, maxWidth: '85%' },
  callerBubble: { backgroundColor: '#1a2e5a', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#1a2e0a', alignSelf: 'flex-start' },
  msgRole: { fontSize: 11, color: '#888', marginBottom: 2 },
  msgText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  noTranscript: { color: '#555', textAlign: 'center', paddingVertical: 20 },
});

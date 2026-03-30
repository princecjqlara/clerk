import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import { callService } from '../services/CallService';
import { ConversationManager } from '../services/ConversationManager';
import * as Storage from '../services/StorageService';
import { supabaseAdmin } from '../services/SupabaseClient';
import type { CallRecord, TenantConfig } from '../services/ConversationManager';

interface CallLogEntry {
  id: string;
  phone_number: string;
  caller_name: string;
  duration: number;
  transcript: any[];
  message_taken: string;
  status: string;
  created_at: string;
  call_goal?: string;
}

interface LiveTranscriptEntry {
  role: 'caller' | 'ai';
  text: string;
  timestamp: number;
}

interface Props {
  onNavigate: (screen: string) => void;
}

export default function HomeScreen({ onNavigate }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [activeCall, setActiveCall] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallLogEntry | null>(null);

  // Live call state
  const [callFlowState, setCallFlowState] = useState<string>('');
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscriptEntry[]>([]);
  const [callDuration, setCallDuration] = useState(0);

  // ConversationManager for generating AI responses
  const conversationManagerRef = useRef<ConversationManager | null>(null);
  const callStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulse animation for active call indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadState();
    const interval = setInterval(loadState, 5000);
    return () => clearInterval(interval);
  }, []);

  // Pulse animation
  useEffect(() => {
    if (activeCall) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [activeCall]);

  useEffect(() => {
    callService.init();

    const unsub1 = callService.on('incoming', (data) => {
      setActiveCall(data.phoneNumber);
      setActiveCallId(data.callId);
      setCallFlowState('ringing');
      setLiveTranscript([]);
      setCallDuration(0);
    });

    const unsub2 = callService.on('answered', async (data) => {
      setActiveCall(data.phoneNumber);
      setActiveCallId(data.callId);
      setCallFlowState('answered');
      callStartTimeRef.current = Date.now();

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
      }, 1000);

      // Initialize ConversationManager for this call
      await initConversationManager();
    });

    const unsub3 = callService.on('disconnected', (data) => {
      setCallFlowState('disconnected');

      // Stop duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Brief delay before clearing active call so user sees "disconnected" state
      setTimeout(() => {
        setActiveCall(null);
        setActiveCallId(null);
        setCallFlowState('');
        setLiveTranscript([]);
        setCallDuration(0);
        conversationManagerRef.current = null;
        loadState();
      }, 2000);
    });

    // Audio bridge: caller speech transcribed
    const unsub4 = callService.on('transcription', (data) => {
      setLiveTranscript((prev) => [
        ...prev,
        { role: 'caller', text: data.text, timestamp: Date.now() },
      ]);
    });

    // Audio bridge: AI response generated and being played
    const unsub5 = callService.on('aiResponse', (data) => {
      setLiveTranscript((prev) => [
        ...prev,
        { role: 'ai', text: data.text, timestamp: Date.now() },
      ]);
    });

    // Audio bridge: conversation state changes
    const unsub6 = callService.on('callFlowUpdate', (data) => {
      setCallFlowState(data.state);
    });

    // Audio bridge: native side requests an AI greeting
    const unsub7 = callService.on('requestGreeting', async (data) => {
      try {
        const mgr = conversationManagerRef.current;
        if (mgr) {
          const greeting = await mgr.getGreeting();
          await callService.supplyAIResponse(greeting);
        } else {
          // Fallback greeting
          await callService.supplyAIResponse(
            'Hello po! Salamat sa pag-tawag. Paano ko po kayo matutulungan?'
          );
        }
      } catch (err) {
        console.error('Failed to generate greeting:', err);
        await callService.supplyAIResponse(
          'Hello po! Salamat sa pag-tawag. Paano ko po kayo matutulungan?'
        );
      }
    });

    // Audio bridge: native side requests AI response for caller speech
    const unsub8 = callService.on('requestAIResponse', async (data) => {
      try {
        const mgr = conversationManagerRef.current;
        if (mgr) {
          const response = await mgr.respond(data.text);
          await callService.supplyAIResponse(response);
        } else {
          await callService.supplyAIResponse(
            'Pasensya na po, may technical issue. Puwede po bang i-try ulit?'
          );
        }
      } catch (err) {
        console.error('Failed to generate AI response:', err);
        await callService.supplyAIResponse(
          'Pasensya na po, may technical issue. Sandali lang po.'
        );
      }
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
      unsub7();
      unsub8();
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      callService.destroy();
    };
  }, []);

  const initConversationManager = async () => {
    try {
      const apiKey = await Storage.getApiKey();
      const businessName = await Storage.getBusinessName();
      const callGoal = await Storage.getCallGoal();
      const customInstructions = await Storage.getCustomInstructions();

      const config: TenantConfig = {
        businessName: businessName || 'AI Receptionist',
        apiKey,
        callGoal: (callGoal as 'book' | 'order') || 'book',
        customInstructions: customInstructions || '',
      };

      conversationManagerRef.current = new ConversationManager(config);
    } catch (err) {
      console.error('Failed to init ConversationManager:', err);
    }
  };

  const loadState = useCallback(async () => {
    const key = await Storage.getApiKey();
    setApiKeySet(key.length > 0);
    const en = await Storage.getEnabled();
    setEnabled(en);

    // Load from Supabase if available, fallback to local storage
    try {
      const { data } = await supabaseAdmin
        .from('call_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (data && data.length > 0) {
        setCallLog(data);
        return;
      }
    } catch {
      // Supabase not available, use local
    }

    const localLog = await Storage.getCallLog();
    setCallLog(localLog.map(l => ({
      id: l.id,
      phone_number: l.phoneNumber,
      caller_name: '',
      duration: l.duration,
      transcript: l.transcript,
      message_taken: l.messageTaken || '',
      status: 'completed',
      created_at: new Date(l.timestamp).toISOString(),
    })));
  }, []);

  const toggleEnabled = async (value: boolean) => {
    if (value && !apiKeySet) {
      Alert.alert('API Key Required', 'Please set your NVIDIA API key in Settings first.');
      return;
    }
    if (value && Platform.OS === 'android') {
      const granted = await callService.requestPermissions();
      if (!granted) { Alert.alert('Permissions Required', 'Phone and audio permissions are needed.'); return; }
      await callService.requestDefaultDialer();
    }
    await Storage.setEnabled(value);
    await callService.setEnabled(value);
    setEnabled(value);
  };

  const handleStopAI = async () => {
    try {
      await callService.stopAI();
      setCallFlowState('ai_stopped');
    } catch (err) {
      console.error('Failed to stop AI:', err);
    }
  };

  const handleDisconnect = async () => {
    if (activeCallId) {
      try {
        await callService.disconnectCall(activeCallId);
      } catch (err) {
        console.error('Failed to disconnect:', err);
      }
    }
  };

  const formatTime = (ts: string | number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const parseSummary = (messageTaken: string) => {
    if (!messageTaken) return null;
    try {
      return JSON.parse(messageTaken);
    } catch {
      return { summary: messageTaken };
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#76b900';
      case 'active': return '#2196F3';
      case 'missed': return '#ff9800';
      case 'failed': return '#f44336';
      default: return '#888';
    }
  };

  const getFlowStateLabel = (state: string): string => {
    switch (state) {
      case 'ringing': return 'Ringing...';
      case 'answered': return 'Call connected';
      case 'starting': return 'Starting AI...';
      case 'playing_welcome': return 'Playing welcome message';
      case 'requesting_greeting': return 'Generating greeting...';
      case 'listening': return 'Listening to caller...';
      case 'transcribing': return 'Transcribing speech...';
      case 'thinking': return 'AI is thinking...';
      case 'speaking': return 'AI is speaking...';
      case 'ai_stopped': return 'AI stopped';
      case 'disconnected': return 'Call ended';
      case 'error': return 'Error occurred';
      case 'stopped': return 'Conversation ended';
      default: return state || 'Connecting...';
    }
  };

  const getFlowStateColor = (state: string): string => {
    switch (state) {
      case 'listening': return '#2196F3';
      case 'speaking':
      case 'playing_welcome': return '#76b900';
      case 'thinking':
      case 'transcribing':
      case 'requesting_greeting': return '#ff9800';
      case 'error': return '#f44336';
      case 'disconnected':
      case 'stopped': return '#888';
      default: return '#4CAF50';
    }
  };

  const liveTranscriptScrollRef = useRef<ScrollView>(null);

  return (
    <View style={styles.container}>
      <ScrollView>
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

        {/* Active Call Banner with Live Details */}
        {activeCall && (
          <View style={styles.activeCallCard}>
            {/* Call Header */}
            <View style={styles.activeCallHeader}>
              <View style={styles.activeCallHeaderLeft}>
                <Animated.View style={[styles.pulseIndicator, { opacity: pulseAnim }]} />
                <View>
                  <Text style={styles.activeCallLabel}>Active Call</Text>
                  <Text style={styles.activeCallNumber}>{activeCall}</Text>
                </View>
              </View>
              <View style={styles.activeCallHeaderRight}>
                <Text style={styles.activeCallDuration}>{formatDuration(callDuration)}</Text>
              </View>
            </View>

            {/* Flow State Indicator */}
            <View style={[styles.flowStateBar, { backgroundColor: getFlowStateColor(callFlowState) + '22' }]}>
              <View style={[styles.flowStateDot, { backgroundColor: getFlowStateColor(callFlowState) }]} />
              <Text style={[styles.flowStateText, { color: getFlowStateColor(callFlowState) }]}>
                {getFlowStateLabel(callFlowState)}
              </Text>
            </View>

            {/* Live Transcript */}
            {liveTranscript.length > 0 && (
              <View style={styles.liveTranscriptContainer}>
                <Text style={styles.liveTranscriptTitle}>Live Transcript</Text>
                <ScrollView
                  ref={liveTranscriptScrollRef}
                  style={styles.liveTranscriptScroll}
                  onContentSizeChange={() =>
                    liveTranscriptScrollRef.current?.scrollToEnd({ animated: true })
                  }
                >
                  {liveTranscript.map((entry, i) => (
                    <View
                      key={i}
                      style={[
                        styles.liveBubble,
                        entry.role === 'caller' ? styles.liveCallerBubble : styles.liveAIBubble,
                      ]}
                    >
                      <Text style={styles.liveBubbleRole}>
                        {entry.role === 'caller' ? 'Caller' : 'AI'}
                      </Text>
                      <Text style={styles.liveBubbleText}>{entry.text}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Call Control Buttons */}
            <View style={styles.callControlRow}>
              <TouchableOpacity
                style={[styles.callControlBtn, styles.stopAIBtn]}
                onPress={handleStopAI}
              >
                <Text style={styles.callControlBtnText}>Stop AI</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.callControlBtn, styles.hangUpBtn]}
                onPress={handleDisconnect}
              >
                <Text style={styles.callControlBtnText}>Hang Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onNavigate('settings')}>
            <Text style={styles.actionIcon}>&#9881;</Text>
            <Text style={styles.actionLabel}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onNavigate('tenant-config')}>
            <Text style={styles.actionIcon}>&#9998;</Text>
            <Text style={styles.actionLabel}>AI Config</Text>
          </TouchableOpacity>
        </View>

        {/* Call Summaries - Most Recent First */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Call Summaries</Text>
            {callLog.length > 0 && (
              <Text style={styles.countBadge}>{callLog.length}</Text>
            )}
          </View>

          {callLog.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>&#128222;</Text>
              <Text style={styles.emptyText}>No calls yet</Text>
              <Text style={styles.emptySubtext}>
                Enable the AI receptionist and call summaries will appear here
              </Text>
            </View>
          ) : (
            callLog.map((call) => {
              const summary = parseSummary(call.message_taken);
              const isBooking = summary?.type === 'booking' || call.call_goal === 'book';
              const isOrder = summary?.type === 'order' || call.call_goal === 'order';

              return (
                <TouchableOpacity
                  key={call.id}
                  style={styles.summaryCard}
                  onPress={() => setSelectedCall(call)}
                >
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.goalIcon, {
                        backgroundColor: isOrder ? '#2e1a0a' : '#0a1a2e'
                      }]}>
                        <Text style={{ fontSize: 16 }}>{isOrder ? '\u{1F4E6}' : '\u{1F4C5}'}</Text>
                      </View>
                      <View>
                        <Text style={styles.cardPhone}>{call.phone_number}</Text>
                        {call.caller_name ? (
                          <Text style={styles.cardCallerName}>{call.caller_name}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.cardTime}>{formatTime(call.created_at)}</Text>
                      <View style={[styles.statusDot, { backgroundColor: statusColor(call.status) }]} />
                    </View>
                  </View>

                  {/* Summary Content */}
                  {summary?.summary ? (
                    <Text style={styles.summaryText}>{summary.summary}</Text>
                  ) : (
                    <Text style={styles.summaryTextEmpty}>Call completed - no summary</Text>
                  )}

                  {/* Details Row */}
                  <View style={styles.detailsRow}>
                    {/* Booking details */}
                    {isBooking && summary?.preferred_date && (
                      <View style={styles.detailChip}>
                        <Text style={styles.detailChipText}>
                          {'\u{1F4C5}'} {summary.preferred_date} {summary.preferred_time || ''}
                        </Text>
                      </View>
                    )}
                    {isBooking && summary?.service_requested && (
                      <View style={styles.detailChip}>
                        <Text style={styles.detailChipText}>{summary.service_requested}</Text>
                      </View>
                    )}

                    {/* Order details */}
                    {isOrder && summary?.items && summary.items.length > 0 && (
                      <View style={styles.detailChip}>
                        <Text style={styles.detailChipText}>
                          {'\u{1F4E6}'} {summary.items.length} item{summary.items.length > 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                    {isOrder && summary?.delivery_method && (
                      <View style={styles.detailChip}>
                        <Text style={styles.detailChipText}>
                          {summary.delivery_method === 'delivery' ? '\u{1F69A} Delivery' : '\u{1F3EA} Pickup'}
                        </Text>
                      </View>
                    )}
                    {isOrder && summary?.estimated_total && (
                      <View style={[styles.detailChip, { backgroundColor: '#1a2e0a' }]}>
                        <Text style={[styles.detailChipText, { color: '#76b900' }]}>
                          {summary.estimated_total}
                        </Text>
                      </View>
                    )}

                    {/* Status badge */}
                    {summary?.status && (
                      <View style={[styles.detailChip, {
                        backgroundColor: summary.status === 'confirmed' ? '#1a2e0a' : summary.status === 'cancelled' ? '#2e0a0a' : '#1a1a2e'
                      }]}>
                        <Text style={[styles.detailChipText, {
                          color: summary.status === 'confirmed' ? '#76b900' : summary.status === 'cancelled' ? '#f44336' : '#64b5f6'
                        }]}>
                          {summary.status}
                        </Text>
                      </View>
                    )}

                    {/* Duration */}
                    <Text style={styles.durationText}>{formatDuration(call.duration)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Call Detail Modal */}
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
                  {/* Call Info */}
                  <Text style={styles.modalMeta}>
                    {selectedCall.phone_number} | {new Date(selectedCall.created_at).toLocaleString()}
                  </Text>

                  {/* Summary Card */}
                  {summary && (
                    <View style={styles.modalSummaryCard}>
                      <Text style={styles.modalSummaryTitle}>
                        {summary.type === 'order' ? '\u{1F4E6} Order Summary' : '\u{1F4C5} Booking Summary'}
                      </Text>

                      {summary.summary && (
                        <Text style={styles.modalSummaryText}>{summary.summary}</Text>
                      )}

                      {summary.caller_name ? (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Name:</Text>
                          <Text style={styles.modalFieldValue}>{summary.caller_name}</Text>
                        </View>
                      ) : null}

                      {summary.phone_number ? (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Phone:</Text>
                          <Text style={styles.modalFieldValue}>{summary.phone_number}</Text>
                        </View>
                      ) : null}

                      {/* Booking fields */}
                      {summary.preferred_date && (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Date:</Text>
                          <Text style={styles.modalFieldValue}>{summary.preferred_date} {summary.preferred_time || ''}</Text>
                        </View>
                      )}
                      {summary.service_requested && (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Service:</Text>
                          <Text style={styles.modalFieldValue}>{summary.service_requested}</Text>
                        </View>
                      )}
                      {summary.special_requests && (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Notes:</Text>
                          <Text style={styles.modalFieldValue}>{summary.special_requests}</Text>
                        </View>
                      )}

                      {/* Order fields */}
                      {summary.items && summary.items.length > 0 && (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Items:</Text>
                          <View>
                            {summary.items.map((item: any, i: number) => (
                              <Text key={i} style={styles.modalFieldValue}>
                                {item.quantity}x {item.name}{item.notes ? ` (${item.notes})` : ''}
                              </Text>
                            ))}
                          </View>
                        </View>
                      )}
                      {summary.delivery_method && (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Delivery:</Text>
                          <Text style={styles.modalFieldValue}>{summary.delivery_method}</Text>
                        </View>
                      )}
                      {summary.delivery_address && (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Address:</Text>
                          <Text style={styles.modalFieldValue}>{summary.delivery_address}</Text>
                        </View>
                      )}
                      {summary.estimated_total && (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Total:</Text>
                          <Text style={[styles.modalFieldValue, { color: '#76b900', fontWeight: '700' }]}>{summary.estimated_total}</Text>
                        </View>
                      )}
                      {summary.status && (
                        <View style={styles.modalField}>
                          <Text style={styles.modalFieldLabel}>Status:</Text>
                          <Text style={[styles.modalFieldValue, {
                            color: summary.status === 'confirmed' ? '#76b900' : summary.status === 'cancelled' ? '#f44336' : '#64b5f6'
                          }]}>{summary.status}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Transcript */}
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

  // Active Call Card - expanded with live details
  activeCallCard: {
    marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16,
    backgroundColor: '#0d1f0d', borderWidth: 1, borderColor: '#4CAF50',
  },
  activeCallHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  activeCallHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  activeCallHeaderRight: { alignItems: 'flex-end' },
  pulseIndicator: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50', marginRight: 12 },
  activeCallLabel: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  activeCallNumber: { fontSize: 18, color: '#fff', fontWeight: '700' },
  activeCallDuration: { fontSize: 20, color: '#4CAF50', fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Flow state indicator
  flowStateBar: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 8, marginBottom: 12,
  },
  flowStateDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  flowStateText: { fontSize: 13, fontWeight: '600' },

  // Live transcript
  liveTranscriptContainer: { marginBottom: 12 },
  liveTranscriptTitle: { fontSize: 13, color: '#888', fontWeight: '600', marginBottom: 6 },
  liveTranscriptScroll: { maxHeight: 200 },
  liveBubble: { borderRadius: 10, padding: 10, marginBottom: 6, maxWidth: '85%' },
  liveCallerBubble: { backgroundColor: '#1a2e5a', alignSelf: 'flex-end' },
  liveAIBubble: { backgroundColor: '#1a2e0a', alignSelf: 'flex-start' },
  liveBubbleRole: { fontSize: 10, color: '#888', marginBottom: 2, fontWeight: '600' },
  liveBubbleText: { fontSize: 13, color: '#fff', lineHeight: 18 },

  // Call control buttons
  callControlRow: { flexDirection: 'row', gap: 10 },
  callControlBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  stopAIBtn: { backgroundColor: '#ff980033', borderWidth: 1, borderColor: '#ff9800' },
  hangUpBtn: { backgroundColor: '#f4433633', borderWidth: 1, borderColor: '#f44336' },
  callControlBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  actionsRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 20, gap: 12 },
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
  countBadge: {
    backgroundColor: '#76b900', color: '#000', fontSize: 12, fontWeight: '700',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden',
  },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#888', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#555', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },

  // Summary Cards
  summaryCard: {
    backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#222',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  goalIcon: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  cardPhone: { fontSize: 15, fontWeight: '600', color: '#fff' },
  cardCallerName: { fontSize: 13, color: '#888' },
  cardTime: { fontSize: 12, color: '#666' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  summaryText: { fontSize: 14, color: '#ccc', lineHeight: 20, marginBottom: 10 },
  summaryTextEmpty: { fontSize: 13, color: '#555', fontStyle: 'italic', marginBottom: 10 },
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  detailChip: {
    backgroundColor: '#111', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  detailChipText: { fontSize: 11, color: '#aaa' },
  durationText: { fontSize: 12, color: '#555', marginLeft: 'auto' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  closeBtn: { color: '#76b900', fontSize: 15, fontWeight: '600' },
  modalMeta: { fontSize: 13, color: '#888', marginBottom: 12 },
  modalSummaryCard: {
    backgroundColor: '#111', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#76b900',
  },
  modalSummaryTitle: { fontSize: 15, fontWeight: '700', color: '#76b900', marginBottom: 8 },
  modalSummaryText: { fontSize: 14, color: '#ccc', lineHeight: 20, marginBottom: 10 },
  modalField: { flexDirection: 'row', marginBottom: 6 },
  modalFieldLabel: { fontSize: 13, color: '#888', width: 70 },
  modalFieldValue: { fontSize: 13, color: '#fff', flex: 1 },
  transcriptTitle: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 10 },
  msgBubble: { borderRadius: 10, padding: 10, marginBottom: 8, maxWidth: '85%' },
  callerBubble: { backgroundColor: '#1a2e5a', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#1a2e0a', alignSelf: 'flex-start' },
  msgRole: { fontSize: 11, color: '#888', marginBottom: 2 },
  msgText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  noTranscript: { color: '#555', textAlign: 'center', paddingVertical: 20 },
});

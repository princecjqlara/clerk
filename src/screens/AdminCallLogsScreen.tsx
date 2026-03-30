import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal,
} from 'react-native';
import { getAllCallLogs, type CallLog } from '../services/AdminService';

interface Props {
  onBack: () => void;
}

export default function AdminCallLogsScreen({ onBack }: Props) {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getAllCallLogs(100);
        setCalls(data);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    })();
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
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

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backBtn}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Call Logs ({calls.length})</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Summary bar */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{calls.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#76b900' }]}>
              {calls.filter(c => c.status === 'completed').length}
            </Text>
            <Text style={styles.summaryLabel}>Completed</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#ff9800' }]}>
              {calls.filter(c => c.status === 'missed').length}
            </Text>
            <Text style={styles.summaryLabel}>Missed</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#f44336' }]}>
              {calls.filter(c => c.status === 'failed').length}
            </Text>
            <Text style={styles.summaryLabel}>Failed</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#76b900" style={{ marginTop: 40 }} />
        ) : calls.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>&#128222;</Text>
            <Text style={styles.emptyText}>No calls recorded yet</Text>
          </View>
        ) : (
          calls.map((call) => (
            <TouchableOpacity key={call.id} style={styles.callCard} onPress={() => setSelectedCall(call)}>
              <View style={styles.callRow}>
                <View style={[styles.dot, { backgroundColor: statusColor(call.status) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.callNumber}>{call.phone_number}</Text>
                  {call.caller_name ? <Text style={styles.callerName}>{call.caller_name}</Text> : null}
                </View>
                <View>
                  <Text style={styles.callDuration}>{formatDuration(call.duration)}</Text>
                  <Text style={[styles.callStatus, { color: statusColor(call.status) }]}>{call.status}</Text>
                </View>
              </View>
              <View style={styles.callMeta}>
                <Text style={styles.callTime}>{new Date(call.created_at).toLocaleString()}</Text>
                <Text style={styles.callModel}>{call.ai_model_used}</Text>
              </View>
              {call.message_taken ? (
                <View style={styles.messageBanner}>
                  <Text style={styles.messageLabel}>Message:</Text>
                  <Text style={styles.messageText} numberOfLines={2}>{call.message_taken}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Transcript Modal */}
      <Modal visible={!!selectedCall} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Call Transcript</Text>
              <TouchableOpacity onPress={() => setSelectedCall(null)}>
                <Text style={styles.closeBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMeta}>
              {selectedCall?.phone_number} | {selectedCall && new Date(selectedCall.created_at).toLocaleString()}
            </Text>

            {/* Call Summary */}
            {selectedCall?.message_taken ? (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardTitle}>Call Summary</Text>
                <Text style={styles.summaryCardText}>{selectedCall.message_taken}</Text>
              </View>
            ) : null}

            <ScrollView style={styles.transcriptArea}>
              {selectedCall?.transcript && Array.isArray(selectedCall.transcript) && selectedCall.transcript.length > 0 ? (
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
          </View>
        </View>
      </Modal>
    </View>
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
  summaryBar: {
    flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#1a1a1a',
    borderRadius: 12, padding: 14, marginBottom: 16, gap: 8,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '700', color: '#fff' },
  summaryLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#888' },
  callCard: {
    marginHorizontal: 16, backgroundColor: '#1a1a1a', borderRadius: 12,
    padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#222',
  },
  callRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  callNumber: { fontSize: 16, fontWeight: '600', color: '#fff' },
  callerName: { fontSize: 13, color: '#888' },
  callDuration: { fontSize: 14, color: '#76b900', textAlign: 'right' },
  callStatus: { fontSize: 11, textAlign: 'right', marginTop: 2 },
  callMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  callTime: { fontSize: 12, color: '#666' },
  callModel: { fontSize: 11, color: '#444' },
  messageBanner: { backgroundColor: '#111', borderRadius: 8, padding: 10, marginTop: 8 },
  messageLabel: { fontSize: 11, color: '#76b900', fontWeight: '600' },
  messageText: { fontSize: 13, color: '#ccc', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  closeBtn: { color: '#76b900', fontSize: 15 },
  modalMeta: { fontSize: 13, color: '#888', marginBottom: 16 },
  transcriptArea: { maxHeight: 400 },
  msgBubble: { borderRadius: 10, padding: 10, marginBottom: 8, maxWidth: '85%' },
  callerBubble: { backgroundColor: '#1a2e5a', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#1a2e0a', alignSelf: 'flex-start' },
  msgRole: { fontSize: 11, color: '#888', marginBottom: 2 },
  msgText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  noTranscript: { color: '#555', textAlign: 'center', paddingVertical: 30 },
  summaryCard: {
    backgroundColor: '#111', borderRadius: 10, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#76b900',
  },
  summaryCardTitle: { fontSize: 13, fontWeight: '700', color: '#76b900', marginBottom: 6 },
  summaryCardText: { fontSize: 14, color: '#ccc', lineHeight: 20 },
});

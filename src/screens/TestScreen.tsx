import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { ConversationManager } from '../services/ConversationManager';
import { speak, stopSpeaking, startListeningWeb, stopListeningWeb, isWebListening, playWelcomeMessage } from '../services/SpeechService';
import { supabaseAdmin } from '../services/SupabaseClient';
import { getCurrentProfile } from '../services/AuthService';

const DEFAULT_API_KEY = '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';

interface Props {
  onBack: () => void;
}

interface Message {
  role: 'caller' | 'ai';
  text: string;
  lang?: string;
}

export default function TestScreen({ onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [initError, setInitError] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState('');
  const convoRef = useRef<ConversationManager | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const startConversation = async () => {
    setInitError('');
    setStarted(true);
    setLoading(true);

    try {
      // Try to load tenant config from Supabase
      let apiKey = DEFAULT_API_KEY;
      let businessName = 'Test Business';
      let callGoal: 'book' | 'order' = 'book';
      let customInstructions = '';

      const profile = await getCurrentProfile();
      if (profile) {
        // Find tenant: owned first, then membership, then admin fallback
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
          } else if (profile.role === 'admin') {
            // Admin fallback: use first tenant
            const { data: any } = await supabaseAdmin
              .from('tenants')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(1);
            if (any && any.length > 0) tenantData = any[0];
          }
        }

        if (tenantData) {
          apiKey = tenantData.nvidia_api_key || DEFAULT_API_KEY;
          businessName = tenantData.name || businessName;
          callGoal = tenantData.call_goal || 'book';
          customInstructions = tenantData.custom_instructions || '';
        }
      }

      convoRef.current = new ConversationManager({
        apiKey,
        businessName,
        callGoal,
        customInstructions,
      });

      const greeting = await convoRef.current.getGreeting();
      setMessages([{ role: 'ai', text: greeting }]);

      // Try prerecorded welcome first, fall back to TTS
      const tenantId = 'default';
      try {
        const playedWelcome = await playWelcomeMessage(tenantId);
        if (!playedWelcome) {
          speak(greeting);
        }
      } catch {
        // Welcome message failed, just use TTS
        speak(greeting);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';
      console.error('Test call error:', errorMsg);
      setMessages([{ role: 'ai', text: `Error: ${errorMsg}` }]);
      setInitError(errorMsg);
    }
    setLoading(false);
  };

  const sendMessage = async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || !convoRef.current || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'caller', text: userText }]);
    setLoading(true);

    try {
      const response = await convoRef.current.respond(userText);
      setMessages((prev) => [...prev, { role: 'ai', text: response }]);
      speak(response);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'ai', text: `Error: ${err.message}` }]);
    }
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const toggleMic = () => {
    setMicError('');
    if (isListening) {
      stopListeningWeb();
      setIsListening(false);
    } else {
      setIsListening(true);
      startListeningWeb(
        (transcript, lang) => {
          setIsListening(false);
          if (transcript) {
            sendMessage(transcript);
          }
        },
        (error) => {
          setIsListening(false);
          setMicError(error);
        },
      );
    }
  };

  const endCall = () => {
    stopSpeaking();
    if (isListening) { stopListeningWeb(); setIsListening(false); }
    convoRef.current = null;
    setStarted(false);
    setMessages([]);
    setMicError('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtn}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Test AI</Text>
        {started && (
          <TouchableOpacity onPress={endCall}>
            <Text style={styles.endBtn}>End Call</Text>
          </TouchableOpacity>
        )}
      </View>

      {!started ? (
        <View style={styles.startContainer}>
          <Text style={styles.startIcon}>&#9742;</Text>
          <Text style={styles.startTitle}>Test Your AI Receptionist</Text>
          <Text style={styles.startDesc}>
            Simulate an incoming call. Type or speak (via mic) as the caller.
            {Platform.OS === 'web' ? '\n\nMicrophone uses Deepgram nova-3 for Tagalog/Taglish/English.' : ''}
          </Text>
          {initError ? <Text style={styles.errorText}>{initError}</Text> : null}
          <TouchableOpacity style={styles.startBtn} onPress={startConversation}>
            <Text style={styles.startBtnText}>Start Test Call</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
          >
            {messages.map((msg, i) => (
              <View
                key={i}
                style={[styles.bubble, msg.role === 'caller' ? styles.callerBubble : styles.aiBubble]}
              >
                <Text style={styles.bubbleLabel}>
                  {msg.role === 'caller'
                    ? `You (Caller)${msg.lang ? ` · ${msg.lang}` : ''}`
                    : 'AI Receptionist'}
                </Text>
                <Text style={styles.bubbleText}>{msg.text}</Text>
              </View>
            ))}
            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#76b900" size="small" />
                <Text style={styles.loadingText}>AI is thinking...</Text>
              </View>
            )}
          </ScrollView>

          {micError ? (
            <View style={styles.micErrorRow}>
              <Text style={styles.micErrorText}>{micError}</Text>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            {/* Mic button — web only, uses Deepgram STT */}
            {Platform.OS === 'web' && (
              <TouchableOpacity
                style={[styles.micBtn, isListening && styles.micBtnActive]}
                onPress={toggleMic}
                disabled={loading}
              >
                <Text style={styles.micBtnText}>{isListening ? '⏹' : '🎤'}</Text>
              </TouchableOpacity>
            )}
            <TextInput
              style={styles.input}
              value={isListening ? '🎤 Listening...' : input}
              onChangeText={setInput}
              placeholder="Type as caller..."
              placeholderTextColor="#555"
              onSubmitEditing={() => sendMessage()}
              editable={!loading && !isListening}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (loading || isListening) && styles.sendBtnDisabled]}
              onPress={() => sendMessage()}
              disabled={loading || isListening}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
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
  endBtn: { color: '#f44336', fontSize: 16, fontWeight: '600' },
  startContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  startIcon: { fontSize: 60, marginBottom: 20 },
  startTitle: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  startDesc: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 12, lineHeight: 20 },
  errorText: { color: '#f44336', fontSize: 13, marginTop: 12, textAlign: 'center' },
  startBtn: {
    backgroundColor: '#76b900', borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14,
    marginTop: 30,
  },
  startBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
  chatArea: { flex: 1 },
  chatContent: { padding: 16 },
  bubble: { borderRadius: 12, padding: 12, marginBottom: 10, maxWidth: '85%' },
  callerBubble: { backgroundColor: '#1a2e5a', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#1a2e0a', alignSelf: 'flex-start' },
  bubbleLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  bubbleText: { fontSize: 15, color: '#fff', lineHeight: 21 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  loadingText: { color: '#888', marginLeft: 8, fontSize: 13 },
  micErrorRow: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#1a0000' },
  micErrorText: { color: '#f44336', fontSize: 12 },
  inputRow: {
    flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#222',
    backgroundColor: '#111', alignItems: 'center',
  },
  micBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  micBtnActive: { backgroundColor: '#7a0000' },
  micBtnText: { fontSize: 20 },
  input: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12,
    color: '#fff', fontSize: 15, marginRight: 10,
  },
  sendBtn: { backgroundColor: '#76b900', borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center', height: 44 },
  sendBtnDisabled: { backgroundColor: '#3a5a00' },
  sendBtnText: { color: '#000', fontWeight: '600', fontSize: 15 },
});

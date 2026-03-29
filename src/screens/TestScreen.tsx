import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ConversationManager } from '../services/ConversationManager';
import { speak, stopSpeaking } from '../services/SpeechService';
import * as Storage from '../services/StorageService';

interface Props {
  onBack: () => void;
}

interface Message {
  role: 'caller' | 'ai';
  text: string;
}

export default function TestScreen({ onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const convoRef = useRef<ConversationManager | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const startConversation = async () => {
    const apiKey = await Storage.getApiKey();
    if (!apiKey) {
      setMessages([{ role: 'ai', text: 'Error: No API key set. Go to Settings first.' }]);
      return;
    }

    const instructions = await Storage.getCustomInstructions();
    convoRef.current = new ConversationManager(apiKey, instructions);

    setStarted(true);
    setLoading(true);
    try {
      const greeting = await convoRef.current.getGreeting();
      setMessages([{ role: 'ai', text: greeting }]);
      speak(greeting);
    } catch (err: any) {
      setMessages([{ role: 'ai', text: `Error: ${err.message}` }]);
    }
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || !convoRef.current || loading) return;

    const userText = input.trim();
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

  const endCall = () => {
    stopSpeaking();
    convoRef.current = null;
    setStarted(false);
    setMessages([]);
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
            Simulate an incoming call to see how your AI receptionist responds.
            Type messages as if you're the caller.
          </Text>
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
                <Text style={styles.bubbleLabel}>{msg.role === 'caller' ? 'You (Caller)' : 'AI Receptionist'}</Text>
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

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Type as caller..."
              placeholderTextColor="#555"
              onSubmitEditing={sendMessage}
              editable={!loading}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={loading}>
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
  inputRow: {
    flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#222',
    backgroundColor: '#111',
  },
  input: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12,
    color: '#fff', fontSize: 15, marginRight: 10,
  },
  sendBtn: { backgroundColor: '#76b900', borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' },
  sendBtnText: { color: '#000', fontWeight: '600', fontSize: 15 },
});

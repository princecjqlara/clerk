import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseAdmin } from '../services/SupabaseClient';
import { getCurrentProfile } from '../services/AuthService';
import { setTTSProvider, setElevenLabsVoiceId, uploadWelcomeMessage, deleteWelcomeMessage, speak, stopSpeaking, startAutoListening, stopAutoListening, playWelcomeMessage, type TTSProvider } from '../services/SpeechService';
import { ConversationManager } from '../services/ConversationManager';
import { AVAILABLE_MODELS, setModel, getModel } from '../services/NvidiaAIClient';

const PROXY_BASE = 'http://localhost:3456';

interface Props {
  onBack: () => void;
}

interface TenantData {
  id: string;
  name: string;
  call_goal: 'book' | 'order';
  custom_instructions: string;
  nvidia_api_key: string;
  goal_config: any;
}

export default function TenantConfigScreen({ onBack }: Props) {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'goal' | 'rules' | 'knowledge' | 'flow' | 'voice' | 'test'>('goal');

  // Form state
  const [callGoal, setCallGoal] = useState<'book' | 'order'>('book');
  const [selectedModel, setSelectedModel] = useState(getModel());
  const [rules, setRules] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const [flowSteps, setFlowSteps] = useState<string[]>(['']);
  const [selectedVoice, setSelectedVoice] = useState('fil-PH-BlessicaNeural');
  const [voices, setVoices] = useState<any[]>([]);
  const [allVoices, setAllVoices] = useState<any[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  // ElevenLabs state
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('elevenlabs');
  const [elevenLabsVoices, setElevenLabsVoices] = useState<any[]>([]);
  const [elevenLabsKeyCount, setElevenLabsKeyCount] = useState(0);
  const [selectedElevenLabsVoice, setSelectedElevenLabsVoice] = useState('');
  const [loadingELVoices, setLoadingELVoices] = useState(false);

  // Welcome message state
  const [hasWelcomeMsg, setHasWelcomeMsg] = useState(false);
  const [welcomeUploading, setWelcomeUploading] = useState(false);
  const [isRecordingWelcome, setIsRecordingWelcome] = useState(false);
  const [welcomeRecorder, setWelcomeRecorder] = useState<MediaRecorder | null>(null);
  const [playingWelcome, setPlayingWelcome] = useState(false);
  const [generatingWelcome, setGeneratingWelcome] = useState(false);
  const [welcomeText, setWelcomeText] = useState('Hello po! Salamat sa pag-tawag. Paano ko po kayo matutulungan ngayon?');

  // Test AI state
  const [testMessages, setTestMessages] = useState<{ role: 'caller' | 'ai'; text: string }[]>([]);
  const [testInput, setTestInput] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [testListening, setTestListening] = useState(false);
  const [autoListen, setAutoListen] = useState(true);
  const [interimText, setInterimText] = useState('');
  const convoRef = useRef<ConversationManager | null>(null);
  const testScrollRef = useRef<ScrollView>(null);
  const autoListenRef = useRef(true); // ref to avoid stale closures

  useEffect(() => { loadTenant(); loadVoices(); checkElevenLabsKeys(); checkWelcomeMessage(); }, []);

  const loadVoices = async () => {
    try {
      const res = await fetch('http://localhost:3456/api/tts/voices');
      if (res.ok) {
        const data = await res.json();
        setVoices(data.recommended || []);
        setAllVoices(data.all || []);
      }
    } catch {
      // Proxy not running — show defaults
      setVoices([
        { id: 'fil-PH-BlessicaNeural', gender: 'Female', personality: 'Friendly' },
        { id: 'fil-PH-AngeloNeural', gender: 'Male', personality: 'Friendly' },
        { id: 'en-PH-RosaNeural', gender: 'Female', personality: 'Friendly' },
        { id: 'en-PH-JamesNeural', gender: 'Male', personality: 'Friendly' },
      ]);
    }
  };

  // Check how many ElevenLabs keys the admin has configured (read-only for tenants)
  const checkElevenLabsKeys = async () => {
    try {
      const res = await fetch(`${PROXY_BASE}/api/elevenlabs/keys`);
      if (res.ok) {
        const data = await res.json();
        setElevenLabsKeyCount(data.keys?.length || 0);
      }
    } catch {}
  };

  const checkWelcomeMessage = async () => {
    try {
      const res = await fetch(`${PROXY_BASE}/api/welcome/default/status`);
      if (res.ok) {
        const data = await res.json();
        setHasWelcomeMsg(data.exists);
      }
    } catch {}
  };

  const handleUploadWelcome = async () => {
    // Use file picker via hidden input (web only)
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setWelcomeUploading(true);
      const ok = await uploadWelcomeMessage('default', file);
      if (ok) {
        setHasWelcomeMsg(true);
        Alert.alert('Success', 'Welcome message uploaded!');
      } else {
        Alert.alert('Error', 'Failed to upload welcome message');
      }
      setWelcomeUploading(false);
    };
    input.click();
  };

  const handleRecordWelcome = async () => {
    if (isRecordingWelcome && welcomeRecorder) {
      // Stop recording
      welcomeRecorder.stop();
      setIsRecordingWelcome(false);
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const chunks: Blob[] = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mimeType });
        setWelcomeUploading(true);
        const ok = await uploadWelcomeMessage('default', blob);
        if (ok) {
          setHasWelcomeMsg(true);
          Alert.alert('Success', 'Welcome message recorded and saved!');
        } else {
          Alert.alert('Error', 'Failed to save recording');
        }
        setWelcomeUploading(false);
        setWelcomeRecorder(null);
      };

      recorder.start();
      setWelcomeRecorder(recorder);
      setIsRecordingWelcome(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Microphone access denied');
    }
  };

  const handlePlayWelcome = async () => {
    setPlayingWelcome(true);
    try {
      const res = await fetch(`${PROXY_BASE}/api/welcome/default`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new window.Audio(url);
        audio.onended = () => setPlayingWelcome(false);
        audio.onerror = () => setPlayingWelcome(false);
        await audio.play();
      } else {
        setPlayingWelcome(false);
      }
    } catch {
      setPlayingWelcome(false);
    }
  };

  const handleDeleteWelcome = async () => {
    const ok = await deleteWelcomeMessage('default');
    if (ok) {
      setHasWelcomeMsg(false);
      Alert.alert('Removed', 'Welcome message deleted. AI will generate greeting via TTS.');
    }
  };

  const handleGenerateWelcome = async () => {
    if (!welcomeText.trim()) {
      Alert.alert('Error', 'Enter the welcome message text first');
      return;
    }
    setGeneratingWelcome(true);
    try {
      // Use the current TTS provider to generate audio
      const endpoint = ttsProvider === 'elevenlabs'
        ? `${PROXY_BASE}/api/elevenlabs/tts`
        : `${PROXY_BASE}/api/tts`;

      const body = ttsProvider === 'elevenlabs'
        ? { text: welcomeText.trim(), voice_id: selectedElevenLabsVoice || undefined }
        : { text: welcomeText.trim(), voice: selectedVoice };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        Alert.alert('Error', 'Failed to generate audio. Check your TTS settings.');
        setGeneratingWelcome(false);
        return;
      }

      const audioBlob = await res.blob();
      const ok = await uploadWelcomeMessage('default', audioBlob);
      if (ok) {
        setHasWelcomeMsg(true);
        Alert.alert('Success', 'Welcome message generated and saved!');
      } else {
        Alert.alert('Error', 'Failed to save generated audio');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Generation failed');
    }
    setGeneratingWelcome(false);
  };

  const loadElevenLabsVoices = async () => {
    setLoadingELVoices(true);
    try {
      const res = await fetch(`${PROXY_BASE}/api/elevenlabs/voices`);
      if (res.ok) {
        const data = await res.json();
        setElevenLabsVoices(data.voices || []);
      } else {
        const data = await res.json();
        Alert.alert('Error', data.error || 'Failed to load voices');
      }
    } catch (err: any) {
      Alert.alert('Error', 'Cannot reach proxy server. Is it running?');
    }
    setLoadingELVoices(false);
  };

  const previewElevenLabsVoice = async (voiceId: string) => {
    setPlayingVoice(voiceId);
    try {
      const res = await fetch(`${PROXY_BASE}/api/elevenlabs/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_id: voiceId }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new window.Audio(url);
        audio.onended = () => setPlayingVoice(null);
        audio.onerror = () => setPlayingVoice(null);
        await audio.play();
      } else {
        setPlayingVoice(null);
        Alert.alert('Error', 'Preview failed — check API keys');
      }
    } catch {
      setPlayingVoice(null);
    }
  };

  const previewVoice = async (voiceId: string) => {
    setPlayingVoice(voiceId);
    try {
      const res = await fetch('http://localhost:3456/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voiceId }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new window.Audio(url);
        audio.onended = () => setPlayingVoice(null);
        audio.onerror = () => setPlayingVoice(null);
        await audio.play();
      } else {
        setPlayingVoice(null);
      }
    } catch {
      setPlayingVoice(null);
    }
  };

  const loadTenant = async () => {
    try {
      const profile = await getCurrentProfile();

      // Try loading from Supabase tenant if available
      if (profile) {
        const tenantData = await findTenant(profile);
        if (tenantData) {
          loadForm(tenantData);
          setLoading(false);
          return;
        }
      }

      // Fallback: load from local storage (works without tenant)
      const localConfig = await AsyncStorage.getItem('ai_config');
      if (localConfig) {
        const config = JSON.parse(localConfig);
        setTenant({ id: 'local', name: 'Local Config' } as any);
        setCallGoal(config.call_goal || 'book');
        setRules(config.rules || '');
        setKnowledge(config.knowledge || '');
        setFlowSteps(config.flow_steps?.length ? config.flow_steps : ['Greet the caller', 'Ask how you can help', '']);
        // Restore TTS provider settings
        const provider = config.tts_provider || 'edge';
        setTtsProvider(provider);
        setTTSProvider(provider);
        if (config.elevenlabs_voice_id) {
          setSelectedElevenLabsVoice(config.elevenlabs_voice_id);
          setElevenLabsVoiceId(config.elevenlabs_voice_id);
        }
      } else {
        // No config anywhere — show empty form ready to fill
        setTenant({ id: 'local', name: 'Local Config' } as any);
        setFlowSteps(['Greet the caller warmly in Taglish', 'Ask how you can help', 'Collect details step by step', 'Confirm everything', 'Say goodbye']);
      }
    } catch (err: any) {
      // Even on error, show the form with local fallback
      setTenant({ id: 'local', name: 'Local Config' } as any);
      setFlowSteps(['Greet the caller', 'Ask how you can help', '']);
    }
    setLoading(false);
  };

  const findTenant = async (profile: any) => {
    // 1. Owned
    const { data: owned } = await supabaseAdmin.from('tenants').select('*').eq('owner_id', profile.id).limit(1);
    if (owned && owned.length > 0) return owned[0];

    // 2. Membership
    const { data: membership } = await supabaseAdmin.from('tenant_members').select('tenant_id').eq('user_id', profile.id).limit(1);
    if (membership && membership.length > 0) {
      const { data: t } = await supabaseAdmin.from('tenants').select('*').eq('id', membership[0].tenant_id).single();
      if (t) return t;
    }

    // 3. Admin fallback
    if (profile.role === 'admin') {
      const { data: any } = await supabaseAdmin.from('tenants').select('*').order('created_at', { ascending: false }).limit(1);
      if (any && any.length > 0) return any[0];
    }

    return null;
  };

  const loadForm = (t: any) => {
    setTenant(t);
    setCallGoal(t.call_goal || 'book');

    const config = t.goal_config || {};
    setRules(config.rules || '');
    setKnowledge(config.knowledge || '');
    setFlowSteps(config.flow_steps?.length ? config.flow_steps : ['Greet the caller', 'Ask how you can help', '']);
    setSelectedVoice(config.voice || 'fil-PH-BlessicaNeural');

    // ElevenLabs settings
    const provider = config.tts_provider || 'edge';
    setTtsProvider(provider);
    setTTSProvider(provider);
    if (config.elevenlabs_voice_id) {
      setSelectedElevenLabsVoice(config.elevenlabs_voice_id);
      setElevenLabsVoiceId(config.elevenlabs_voice_id);
    }
    if (config.ai_model) {
      setSelectedModel(config.ai_model);
      setModel(config.ai_model);
    }
  };

  const handleSave = async () => {
    if (!tenant) return;
    setSaving(true);

    const instructions = [
      rules ? `RULES:\n${rules}` : '',
      knowledge ? `KNOWLEDGE BASE:\n${knowledge}` : '',
      flowSteps.filter(s => s.trim()).length > 0
        ? `CONVERSATION FLOW:\n${flowSteps.filter(s => s.trim()).map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n\n');

    const configData = {
      call_goal: callGoal,
      rules,
      knowledge,
      flow_steps: flowSteps.filter(s => s.trim()),
      voice: selectedVoice,
      tts_provider: ttsProvider,
      elevenlabs_voice_id: selectedElevenLabsVoice,
      ai_model: selectedModel,
    };

    // Apply TTS provider settings immediately
    setTTSProvider(ttsProvider);
    if (selectedElevenLabsVoice) setElevenLabsVoiceId(selectedElevenLabsVoice);

    try {
      // Always save locally
      await AsyncStorage.setItem('ai_config', JSON.stringify(configData));
      await AsyncStorage.setItem('custom_instructions', instructions);

      // Also save to Supabase if real tenant exists
      if (tenant.id !== 'local') {
        await supabaseAdmin
          .from('tenants')
          .update({
            call_goal: callGoal,
            custom_instructions: instructions,
            goal_config: configData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tenant.id);
      }

      Alert.alert('Saved', 'AI configuration updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setSaving(false);
  };

  // === Test AI helpers ===
  const testBusyRef = useRef(false); // Prevents double-sends

  const handleTestSend = async (text: string) => {
    if (!convoRef.current || testBusyRef.current) return;
    testBusyRef.current = true;

    // Stop everything first — prevent overlap
    await stopSpeaking();
    stopAutoListening();
    setTestListening(false);
    setInterimText('');

    // Show raw transcript immediately, then correct in background
    setTestMessages(prev => [...prev, { role: 'caller', text }]);
    setTestLoading(true);

    // Send raw text to AI — the AI prompt already handles imperfect STT
    // The AI understands intent even with transcription errors
    try {
      const response = await convoRef.current.respond(text);
      setTestMessages(prev => [...prev, { role: 'ai', text: response }]);
      await stopSpeaking();
      await speak(response);
    } catch {}
    setTestLoading(false);
    testBusyRef.current = false;
    setTimeout(() => testScrollRef.current?.scrollToEnd({ animated: true }), 100);
    if (autoListenRef.current) {
      setTimeout(() => startAutoListen(), 500);
    }
  };

  const startAutoListen = () => {
    if (!autoListenRef.current || testBusyRef.current) return;
    setTestListening(true);
    setInterimText('');
    startAutoListening(
      // onInterim — show what user is saying
      (status) => {
        setInterimText(status);
      },
      // onFinal — user stopped speaking, got transcription
      (text, lang) => {
        setInterimText('');
        if (text && text.trim().length > 0 && !testBusyRef.current) {
          handleTestSend(text.trim());
        }
      },
      // onError
      (error) => {
        setTestListening(false);
        setInterimText('');
        if (autoListenRef.current && !testBusyRef.current) {
          setTimeout(() => startAutoListen(), 2000);
        }
      },
    );
  };

  const addFlowStep = () => setFlowSteps([...flowSteps, '']);
  const removeFlowStep = (index: number) => setFlowSteps(flowSteps.filter((_, i) => i !== index));
  const updateFlowStep = (index: number, value: string) => {
    const updated = [...flowSteps];
    updated[index] = value;
    setFlowSteps(updated);
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#76b900" /></View>;
  }

  // No longer blocking on tenant — form always shows with local fallback

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.backBtn}>{'< Back'}</Text></TouchableOpacity>
        <Text style={styles.title}>AI Config</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtn}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['goal', 'rules', 'knowledge', 'flow', 'voice', 'test'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'goal' ? 'Goal' : tab === 'rules' ? 'Rules' : tab === 'knowledge' ? 'Knowledge' : tab === 'flow' ? 'Flow' : tab === 'voice' ? 'Voice' : 'Test'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {/* GOAL TAB */}
        {activeTab === 'goal' && (
          <View>
            <Text style={styles.sectionTitle}>Call Goal</Text>
            <Text style={styles.sectionDesc}>What should the AI receptionist help callers with?</Text>

            <TouchableOpacity
              style={[styles.goalCard, callGoal === 'book' && styles.goalCardActiveBlue]}
              onPress={() => setCallGoal('book')}
            >
              <Text style={styles.goalIcon}>{'\u{1F4C5}'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.goalTitle}>Book Appointments</Text>
                <Text style={styles.goalDesc}>
                  AI will collect: name, preferred date/time, service type, phone number, special requests
                </Text>
              </View>
              {callGoal === 'book' && <Text style={styles.goalCheck}>{'\u2713'}</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.goalCard, callGoal === 'order' && styles.goalCardActiveOrange]}
              onPress={() => setCallGoal('order')}
            >
              <Text style={styles.goalIcon}>{'\u{1F4E6}'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.goalTitle}>Take Orders</Text>
                <Text style={styles.goalDesc}>
                  AI will collect: items & quantities, customizations, delivery/pickup, address, payment
                </Text>
              </View>
              {callGoal === 'order' && <Text style={styles.goalCheck}>{'\u2713'}</Text>}
            </TouchableOpacity>

            {/* AI Model Selection */}
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>AI Model</Text>
            <Text style={styles.sectionDesc}>Choose the brain powering your AI receptionist.</Text>

            {AVAILABLE_MODELS.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.goalCard, selectedModel === m.id && { borderColor: '#76b900', backgroundColor: '#0a1a0a' }]}
                onPress={() => { setSelectedModel(m.id); setModel(m.id); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalTitle}>{m.name}</Text>
                  <Text style={styles.goalDesc}>{m.desc}</Text>
                </View>
                <View style={[styles.modelSpeedBadge, { backgroundColor: m.speed === 'fast' ? '#1a2e0a' : '#2e1a0a' }]}>
                  <Text style={{ color: m.speed === 'fast' ? '#76b900' : '#ff9800', fontSize: 10, fontWeight: '600' }}>
                    {m.speed === 'fast' ? 'FAST' : 'SLOW'}
                  </Text>
                </View>
                {selectedModel === m.id && <Text style={styles.goalCheck}>{'\u2713'}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* RULES TAB */}
        {activeTab === 'rules' && (
          <View>
            <Text style={styles.sectionTitle}>AI Rules</Text>
            <Text style={styles.sectionDesc}>
              Define rules the AI must follow. These are strict guidelines.
            </Text>

            <TextInput
              style={styles.bigTextArea}
              value={rules}
              onChangeText={setRules}
              placeholder={`Example rules:\n\n- Always greet in Taglish\n- Never give discounts without manager approval\n- Operating hours: Mon-Sat 8am-8pm\n- If caller asks for refund, take their details and say a manager will call back\n- Maximum booking is 2 weeks in advance\n- Do not accept orders below P200 minimum\n- Always confirm the full order before ending the call`}
              placeholderTextColor="#444"
              multiline
              textAlignVertical="top"
            />
          </View>
        )}

        {/* KNOWLEDGE TAB (RAG) */}
        {activeTab === 'knowledge' && (
          <View>
            <Text style={styles.sectionTitle}>Knowledge Base</Text>
            <Text style={styles.sectionDesc}>
              Add business information the AI should know. This acts as a RAG knowledge source — the AI will reference this when answering questions.
            </Text>

            <View style={styles.ragBadge}>
              <Text style={styles.ragBadgeText}>RAG Pipeline Active</Text>
            </View>

            <TextInput
              style={styles.bigTextArea}
              value={knowledge}
              onChangeText={setKnowledge}
              placeholder={`Paste your business knowledge here:\n\n--- MENU / SERVICES ---\nHaircut - P150\nHair Color - P800\nManicure - P200\nPedicure - P250\n\n--- FAQ ---\nQ: Do you accept walk-ins?\nA: Yes, but appointments are preferred.\n\nQ: Where are you located?\nA: 123 Rizal St, Makati City\n\nQ: What are your hours?\nA: Mon-Sat, 8AM to 8PM\n\n--- POLICIES ---\n- 50% deposit required for bookings over P1000\n- Cancellation must be 24 hours in advance\n- We accept GCash, Maya, and cash`}
              placeholderTextColor="#444"
              multiline
              textAlignVertical="top"
            />

            <View style={styles.tipCard}>
              <Text style={styles.tipTitle}>Tips for better AI responses:</Text>
              <Text style={styles.tipText}>
                {'\u2022'} Add your complete menu/service list with prices{'\n'}
                {'\u2022'} Include frequently asked questions{'\n'}
                {'\u2022'} Add your business address and contact info{'\n'}
                {'\u2022'} Include policies (cancellation, refund, etc.){'\n'}
                {'\u2022'} The more detailed, the smarter the AI
              </Text>
            </View>
          </View>
        )}

        {/* CONVERSATION FLOW TAB */}
        {activeTab === 'flow' && (
          <View>
            <Text style={styles.sectionTitle}>Conversation Flow</Text>
            <Text style={styles.sectionDesc}>
              Define the step-by-step flow the AI should follow during a call. The AI will guide the conversation through these steps in order.
            </Text>

            {flowSteps.map((step, index) => (
              <View key={index} style={styles.flowStepRow}>
                <View style={styles.flowStepNum}>
                  <Text style={styles.flowStepNumText}>{index + 1}</Text>
                </View>
                <TextInput
                  style={styles.flowStepInput}
                  value={step}
                  onChangeText={(v) => updateFlowStep(index, v)}
                  placeholder={`Step ${index + 1}...`}
                  placeholderTextColor="#555"
                />
                {flowSteps.length > 1 && (
                  <TouchableOpacity style={styles.flowStepRemove} onPress={() => removeFlowStep(index)}>
                    <Text style={styles.flowStepRemoveText}>X</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity style={styles.addStepBtn} onPress={addFlowStep}>
              <Text style={styles.addStepText}>+ Add Step</Text>
            </TouchableOpacity>

            <View style={styles.tipCard}>
              <Text style={styles.tipTitle}>Example flow for booking:</Text>
              <Text style={styles.tipText}>
                1. Greet the caller warmly in Taglish{'\n'}
                2. Ask what service they need{'\n'}
                3. Ask for their preferred date and time{'\n'}
                4. Ask for their full name{'\n'}
                5. Ask for their phone number{'\n'}
                6. Confirm all booking details{'\n'}
                7. Thank them and say goodbye
              </Text>
            </View>
          </View>
        )}

        {/* VOICE TAB */}
        {activeTab === 'voice' && (
          <View>
            <Text style={styles.sectionTitle}>AI Voice</Text>
            <Text style={styles.sectionDesc}>
              Choose a voice provider and voice for your AI receptionist.
            </Text>

            {/* Prerecorded Welcome Message */}
            <Text style={styles.voiceSectionLabel}>Welcome Message</Text>
            <Text style={[styles.sectionDesc, { marginBottom: 10 }]}>
              Set a greeting that plays when a call is answered. Generate it with AI voice, record your own, or upload an audio file.
            </Text>

            <View style={[styles.currentVoiceCard, {
              borderColor: hasWelcomeMsg ? '#76b900' : '#333',
            }]}>
              <Text style={[styles.currentVoiceLabel, {
                color: hasWelcomeMsg ? '#76b900' : '#888',
              }]}>
                {hasWelcomeMsg ? 'Custom welcome message set' : 'No custom welcome (using live AI-generated)'}
              </Text>

              {/* Playback & Remove */}
              {hasWelcomeMsg && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.welcomeBtn, { backgroundColor: '#0a1a2e' }]}
                    onPress={handlePlayWelcome}
                  >
                    <Text style={[styles.welcomeBtnText, { color: '#64b5f6' }]}>
                      {playingWelcome ? 'Playing...' : 'Play'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.welcomeBtn, { backgroundColor: '#2e0a0a' }]}
                    onPress={handleDeleteWelcome}
                  >
                    <Text style={[styles.welcomeBtnText, { color: '#f44336' }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Generate with AI */}
            <Text style={[styles.voiceSectionLabel, { marginTop: 12 }]}>Generate with AI Voice</Text>
            <Text style={[styles.sectionDesc, { marginBottom: 8 }]}>
              Type your welcome greeting below and generate it using the selected voice provider.
            </Text>
            <TextInput
              style={[styles.bigTextArea, { minHeight: 80, marginBottom: 10 }]}
              value={welcomeText}
              onChangeText={setWelcomeText}
              placeholder="Type your welcome greeting here..."
              placeholderTextColor="#555"
              multiline
            />
            <TouchableOpacity
              style={[styles.addStepBtn, {
                borderColor: '#76b900', marginBottom: 8,
                opacity: generatingWelcome ? 0.5 : 1,
              }]}
              onPress={handleGenerateWelcome}
              disabled={generatingWelcome}
            >
              <Text style={[styles.addStepText, { color: '#76b900' }]}>
                {generatingWelcome ? 'Generating...' : `Generate with ${ttsProvider === 'elevenlabs' ? 'ElevenLabs' : 'Edge TTS'}`}
              </Text>
            </TouchableOpacity>

            {/* Or record / upload */}
            <Text style={[styles.voiceSectionLabel, { marginTop: 8 }]}>Or Use Your Own</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.welcomeBtn, { backgroundColor: '#1a2e0a' }]}
                onPress={handleUploadWelcome}
                disabled={welcomeUploading}
              >
                <Text style={[styles.welcomeBtnText, { color: '#76b900' }]}>
                  {welcomeUploading ? 'Uploading...' : 'Upload Audio File'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.welcomeBtn, {
                  backgroundColor: isRecordingWelcome ? '#7a0000' : '#2e1a0a',
                }]}
                onPress={handleRecordWelcome}
                disabled={welcomeUploading}
              >
                <Text style={[styles.welcomeBtnText, {
                  color: isRecordingWelcome ? '#fff' : '#ff9800',
                }]}>
                  {isRecordingWelcome ? 'Stop Recording' : 'Record from Mic'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 16 }} />

            {/* Provider Selection */}
            <Text style={styles.voiceSectionLabel}>Voice Provider</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity
                style={[styles.goalCard, { flex: 1 }, ttsProvider === 'edge' && styles.goalCardActiveBlue]}
                onPress={() => setTtsProvider('edge')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalTitle}>Edge TTS</Text>
                  <Text style={styles.goalDesc}>Free, 324 voices, good Filipino neural voices</Text>
                </View>
                {ttsProvider === 'edge' && <Text style={styles.goalCheck}>{'\u2713'}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.goalCard, { flex: 1 }, ttsProvider === 'elevenlabs' && styles.goalCardActiveOrange]}
                onPress={() => setTtsProvider('elevenlabs')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalTitle}>ElevenLabs</Text>
                  <Text style={styles.goalDesc}>Premium quality, multilingual, account rotation</Text>
                </View>
                {ttsProvider === 'elevenlabs' && <Text style={styles.goalCheck}>{'\u2713'}</Text>}
              </TouchableOpacity>
            </View>

            {/* ===== ELEVENLABS SECTION ===== */}
            {ttsProvider === 'elevenlabs' && (
              <View>
                {/* Admin key status (read-only) */}
                <View style={[styles.currentVoiceCard, {
                  borderColor: elevenLabsKeyCount > 0 ? '#76b900' : '#f44336',
                }]}>
                  <Text style={[styles.currentVoiceLabel, {
                    color: elevenLabsKeyCount > 0 ? '#76b900' : '#f44336',
                  }]}>
                    ElevenLabs API Keys
                  </Text>
                  <Text style={styles.currentVoiceName}>
                    {elevenLabsKeyCount > 0
                      ? `${elevenLabsKeyCount} key${elevenLabsKeyCount > 1 ? 's' : ''} configured by admin (rotation active)`
                      : 'No keys configured'}
                  </Text>
                  {elevenLabsKeyCount === 0 && (
                    <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                      Contact your admin to add ElevenLabs API keys for your tenant.
                    </Text>
                  )}
                </View>

                {/* Load voices button */}
                {elevenLabsKeyCount > 0 && (
                  <TouchableOpacity
                    style={[styles.addStepBtn, { marginBottom: 12, marginTop: 12, borderColor: '#ff9800' }]}
                    onPress={loadElevenLabsVoices}
                  >
                    <Text style={[styles.addStepText, { color: '#ff9800' }]}>
                      {loadingELVoices ? 'Loading voices...' : 'Load ElevenLabs Voices'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Current selection */}
                {selectedElevenLabsVoice ? (
                  <View style={[styles.currentVoiceCard, { borderColor: '#ff9800' }]}>
                    <Text style={[styles.currentVoiceLabel, { color: '#ff9800' }]}>Selected ElevenLabs Voice</Text>
                    <Text style={styles.currentVoiceName}>
                      {elevenLabsVoices.find(v => v.voice_id === selectedElevenLabsVoice)?.name || selectedElevenLabsVoice}
                    </Text>
                  </View>
                ) : null}

                {/* Search */}
                {elevenLabsVoices.length > 0 && (
                  <TextInput
                    style={[styles.bigTextArea, { minHeight: 40, marginBottom: 12 }]}
                    value={voiceSearch}
                    onChangeText={setVoiceSearch}
                    placeholder="Search ElevenLabs voices..."
                    placeholderTextColor="#555"
                  />
                )}

                {/* ElevenLabs voice list */}
                {elevenLabsVoices
                  .filter(v => !voiceSearch || v.name.toLowerCase().includes(voiceSearch.toLowerCase()))
                  .slice(0, 40)
                  .map((v: any) => (
                    <TouchableOpacity
                      key={v.voice_id}
                      style={[styles.voiceCard, selectedElevenLabsVoice === v.voice_id && { borderColor: '#ff9800', backgroundColor: '#2e1a0a' }]}
                      onPress={() => setSelectedElevenLabsVoice(v.voice_id)}
                    >
                      <View style={[styles.voiceGenderIcon, { backgroundColor: '#2e1a0a' }]}>
                        <Text style={{ fontSize: 14 }}>
                          {v.labels?.gender === 'female' ? '\u{1F469}' : v.labels?.gender === 'male' ? '\u{1F468}' : '\u{1F3A4}'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.voiceId}>{v.name}</Text>
                        <Text style={styles.voiceMeta}>
                          {v.category}{v.labels?.accent ? ` | ${v.labels.accent}` : ''}{v.labels?.gender ? ` | ${v.labels.gender}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.previewBtn}
                        onPress={() => previewElevenLabsVoice(v.voice_id)}
                      >
                        <Text style={styles.previewBtnText}>
                          {playingVoice === v.voice_id ? '...' : '\u{1F50A}'}
                        </Text>
                      </TouchableOpacity>
                      {selectedElevenLabsVoice === v.voice_id && <Text style={[styles.voiceCheck, { color: '#ff9800' }]}>{'\u2713'}</Text>}
                    </TouchableOpacity>
                  ))}
              </View>
            )}

            {/* ===== EDGE TTS SECTION ===== */}
            {ttsProvider === 'edge' && (
              <View>
                {/* Current selection */}
                <View style={styles.currentVoiceCard}>
                  <Text style={styles.currentVoiceLabel}>Current Voice</Text>
                  <Text style={styles.currentVoiceName}>{selectedVoice}</Text>
                </View>

                {/* Search */}
                <TextInput
                  style={[styles.bigTextArea, { minHeight: 40, marginBottom: 12 }]}
                  value={voiceSearch}
                  onChangeText={setVoiceSearch}
                  placeholder="Search voices (e.g. Filipino, English, Japanese...)"
                  placeholderTextColor="#555"
                />

                {/* Recommended voices */}
                <Text style={styles.voiceSectionLabel}>Recommended for Taglish</Text>
                {voices.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.voiceCard, selectedVoice === v.id && styles.voiceCardSelected]}
                    onPress={() => setSelectedVoice(v.id)}
                  >
                    <View style={[styles.voiceGenderIcon, { backgroundColor: v.gender === 'Female' ? '#2e0a2e' : '#0a1a2e' }]}>
                      <Text style={{ fontSize: 16 }}>{v.gender === 'Female' ? '\u{1F469}' : '\u{1F468}'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.voiceId}>{v.id}</Text>
                      <Text style={styles.voiceMeta}>{v.gender} | {v.personality || 'Neural'}</Text>
                    </View>
                    <TouchableOpacity style={styles.previewBtn} onPress={() => previewVoice(v.id)}>
                      <Text style={styles.previewBtnText}>{playingVoice === v.id ? '...' : '\u{1F50A}'}</Text>
                    </TouchableOpacity>
                    {selectedVoice === v.id && <Text style={styles.voiceCheck}>{'\u2713'}</Text>}
                  </TouchableOpacity>
                ))}

                {/* All voices (filtered) */}
                {allVoices.length > 0 && (
                  <>
                    <Text style={[styles.voiceSectionLabel, { marginTop: 16 }]}>
                      All Voices ({voiceSearch ? allVoices.filter(v => v.id.toLowerCase().includes(voiceSearch.toLowerCase())).length : allVoices.length})
                    </Text>
                    {allVoices
                      .filter(v => !voiceSearch || v.id.toLowerCase().includes(voiceSearch.toLowerCase()))
                      .slice(0, 30)
                      .map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          style={[styles.voiceCard, selectedVoice === v.id && styles.voiceCardSelected]}
                          onPress={() => setSelectedVoice(v.id)}
                        >
                          <View style={[styles.voiceGenderIcon, { backgroundColor: v.gender === 'Female' ? '#2e0a2e' : '#0a1a2e' }]}>
                            <Text style={{ fontSize: 14 }}>{v.gender === 'Female' ? '\u{1F469}' : '\u{1F468}'}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.voiceId}>{v.id}</Text>
                            <Text style={styles.voiceMeta}>{v.gender}</Text>
                          </View>
                          <TouchableOpacity style={styles.previewBtn} onPress={() => previewVoice(v.id)}>
                            <Text style={styles.previewBtnText}>{playingVoice === v.id ? '...' : '\u{1F50A}'}</Text>
                          </TouchableOpacity>
                          {selectedVoice === v.id && <Text style={styles.voiceCheck}>{'\u2713'}</Text>}
                        </TouchableOpacity>
                      ))}
                    {!voiceSearch && allVoices.length > 30 && (
                      <Text style={styles.voiceMoreText}>Use search to find more voices...</Text>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* TEST AI TAB */}
        {activeTab === 'test' && (
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Test AI Receptionist</Text>
            <Text style={styles.sectionDesc}>
              Simulate a call. Mic auto-listens — just speak naturally and the AI responds when you stop talking.
            </Text>

            {!testStarted ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <TouchableOpacity
                  style={[styles.addStepBtn, { borderColor: '#76b900', paddingVertical: 14, paddingHorizontal: 30 }]}
                  onPress={async () => {
                    setTestStarted(true);
                    setTestLoading(true);
                    setTestMessages([]);
                    setInterimText('');
                    autoListenRef.current = true;
                    setAutoListen(true);
                    try {
                      const apiKey = tenant?.nvidia_api_key || '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';
                      const instructions = [
                        rules ? `RULES:\n${rules}` : '',
                        knowledge ? `KNOWLEDGE BASE:\n${knowledge}` : '',
                        flowSteps.filter(s => s.trim()).length > 0
                          ? `CONVERSATION FLOW:\n${flowSteps.filter(s => s.trim()).map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                          : '',
                      ].filter(Boolean).join('\n\n');

                      convoRef.current = new ConversationManager({
                        apiKey,
                        businessName: tenant?.name || 'Test Business',
                        callGoal: callGoal,
                        customInstructions: instructions,
                      });

                      // Try prerecorded welcome first — instant, no LLM wait
                      const played = await playWelcomeMessage('default');
                      if (played) {
                        setTestMessages([{ role: 'ai', text: 'Hello po! Salamat sa pag-tawag. Paano ko po kayo matutulungan ngayon?' }]);
                        // Prime the conversation history without calling LLM
                        convoRef.current.getGreeting().catch(() => {});
                      } else {
                        // No prerecorded — fall back to LLM greeting
                        const greeting = await convoRef.current.getGreeting();
                        setTestMessages([{ role: 'ai', text: greeting }]);
                        await speak(greeting);
                      }
                    } catch (err: any) {
                      setTestMessages([{ role: 'ai', text: `Error: ${err.message}` }]);
                    }
                    setTestLoading(false);
                    // Auto-start streaming mic after greeting
                    startAutoListen();
                  }}
                >
                  <Text style={[styles.addStepText, { color: '#76b900', fontSize: 16 }]}>Start Test Call</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ScrollView
                  ref={testScrollRef}
                  style={{ maxHeight: 320, marginBottom: 10 }}
                  contentContainerStyle={{ paddingVertical: 8 }}
                >
                  {testMessages.map((msg, i) => (
                    <View key={i} style={[styles.testBubble, msg.role === 'caller' ? styles.testCallerBubble : styles.testAiBubble]}>
                      <Text style={styles.testBubbleLabel}>{msg.role === 'caller' ? 'You (Caller)' : 'AI Receptionist'}</Text>
                      <Text style={styles.testBubbleText}>{msg.text}</Text>
                    </View>
                  ))}
                  {interimText ? (
                    <View style={[styles.testBubble, styles.testCallerBubble, { opacity: 0.5 }]}>
                      <Text style={styles.testBubbleLabel}>You (speaking...)</Text>
                      <Text style={styles.testBubbleText}>{interimText}</Text>
                    </View>
                  ) : null}
                  {testLoading && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
                      <ActivityIndicator color="#76b900" size="small" />
                      <Text style={{ color: '#888', marginLeft: 8, fontSize: 13 }}>AI is thinking...</Text>
                    </View>
                  )}
                </ScrollView>

                {/* Mic status indicator */}
                <View style={[styles.micStatusBar, {
                  backgroundColor: testListening ? '#1a2e0a' : testLoading ? '#1a1a2e' : '#1a1a1a',
                  borderColor: testListening ? '#76b900' : testLoading ? '#64b5f6' : '#333',
                }]}>
                  <View style={[styles.micDot, {
                    backgroundColor: testListening ? '#76b900' : testLoading ? '#64b5f6' : '#555',
                  }]} />
                  <Text style={[styles.micStatusText, {
                    color: testListening ? '#76b900' : testLoading ? '#64b5f6' : '#555',
                  }]}>
                    {testListening ? 'Listening — speak naturally...' : testLoading ? 'AI is responding...' : 'Mic paused'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.micToggleBtn, {
                      backgroundColor: testListening ? '#2e0a0a' : '#1a2e0a',
                    }]}
                    onPress={() => {
                      if (testListening) {
                        stopAutoListening();
                        setTestListening(false);
                        setInterimText('');
                      } else {
                        startAutoListen();
                      }
                    }}
                  >
                    <Text style={{
                      color: testListening ? '#f44336' : '#76b900',
                      fontSize: 12, fontWeight: '600',
                    }}>
                      {testListening ? 'Mute' : 'Unmute'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Manual text input (fallback) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <TextInput
                    style={[styles.flowStepInput, { flex: 1 }]}
                    value={testInput}
                    onChangeText={setTestInput}
                    placeholder="Or type here..."
                    placeholderTextColor="#555"
                    editable={!testLoading}
                    onSubmitEditing={() => {
                      if (!testInput.trim() || !convoRef.current || testLoading) return;
                      handleTestSend(testInput.trim());
                      setTestInput('');
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.testSendBtn, testLoading && { opacity: 0.5 }]}
                    onPress={() => {
                      if (!testInput.trim() || !convoRef.current || testLoading) return;
                      handleTestSend(testInput.trim());
                      setTestInput('');
                    }}
                    disabled={testLoading}
                  >
                    <Text style={styles.testSendBtnText}>Send</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.addStepBtn, { borderColor: '#f44336', marginTop: 12 }]}
                  onPress={() => {
                    stopSpeaking();
                    stopAutoListening();
                    autoListenRef.current = false;
                    setAutoListen(false);
                    setTestListening(false);
                    setInterimText('');
                    convoRef.current = null;
                    setTestStarted(false);
                    setTestMessages([]);
                  }}
                >
                  <Text style={[styles.addStepText, { color: '#f44336' }]}>End Test Call</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingBottom: 12, paddingHorizontal: 20,
  },
  backBtn: { color: '#76b900', fontSize: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  saveBtn: { color: '#76b900', fontSize: 16, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 15 },

  // Tabs
  tabs: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16, gap: 6 },
  tab: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  tabActive: { backgroundColor: '#76b900', borderColor: '#76b900' },
  tabText: { fontSize: 13, color: '#888', fontWeight: '600' },
  tabTextActive: { color: '#000' },

  content: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 6 },
  sectionDesc: { fontSize: 13, color: '#888', lineHeight: 18, marginBottom: 16 },

  // Goal
  goalCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
    borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: '#333',
  },
  goalCardActiveBlue: { borderColor: '#64b5f6', backgroundColor: '#0a1a2e' },
  goalCardActiveOrange: { borderColor: '#ff9800', backgroundColor: '#2e1a0a' },
  goalIcon: { fontSize: 30, marginRight: 14 },
  goalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  goalDesc: { fontSize: 12, color: '#888', marginTop: 4, lineHeight: 17 },
  goalCheck: { fontSize: 20, color: '#76b900', fontWeight: '700' },

  // Text areas
  bigTextArea: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    color: '#fff', fontSize: 14, minHeight: 200, borderWidth: 1, borderColor: '#333',
    lineHeight: 20, textAlignVertical: 'top',
  },

  // RAG badge
  ragBadge: {
    alignSelf: 'flex-start', backgroundColor: '#1a2e0a', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12,
  },
  ragBadgeText: { color: '#76b900', fontSize: 12, fontWeight: '600' },

  // Flow
  flowStepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  flowStepNum: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#76b900',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  flowStepNumText: { color: '#000', fontWeight: '700', fontSize: 14 },
  flowStepInput: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12,
    color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#333',
  },
  flowStepRemove: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: '#2e0a0a',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  flowStepRemoveText: { color: '#f44336', fontWeight: '700' },
  addStepBtn: {
    borderWidth: 1, borderColor: '#76b900', borderStyle: 'dashed',
    borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4,
  },
  addStepText: { color: '#76b900', fontSize: 14, fontWeight: '600' },

  // Tips
  tipCard: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginTop: 16,
    borderWidth: 1, borderColor: '#333',
  },
  tipTitle: { fontSize: 13, fontWeight: '700', color: '#ccc', marginBottom: 6 },
  tipText: { fontSize: 12, color: '#888', lineHeight: 20 },

  // Voice
  currentVoiceCard: {
    backgroundColor: '#1a2e0a', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#76b900',
  },
  currentVoiceLabel: { fontSize: 11, color: '#76b900', fontWeight: '600' },
  currentVoiceName: { fontSize: 16, color: '#fff', fontWeight: '700', marginTop: 4 },
  voiceSectionLabel: { fontSize: 14, fontWeight: '600', color: '#ccc', marginBottom: 8 },
  voiceCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
    borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 2, borderColor: '#333',
  },
  voiceCardSelected: { borderColor: '#76b900', backgroundColor: '#0a1a0a' },
  voiceGenderIcon: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  voiceId: { fontSize: 13, color: '#fff', fontWeight: '600' },
  voiceMeta: { fontSize: 11, color: '#888', marginTop: 1 },
  previewBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#222',
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 8,
  },
  previewBtnText: { fontSize: 16 },
  voiceCheck: { fontSize: 18, color: '#76b900', fontWeight: '700' },
  voiceMoreText: { color: '#555', fontSize: 12, textAlign: 'center', paddingVertical: 10 },
  welcomeBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center',
  },
  welcomeBtnText: { fontSize: 13, fontWeight: '600' },
  // Test AI styles
  testBubble: { borderRadius: 12, padding: 10, marginBottom: 8, maxWidth: '85%' },
  testCallerBubble: { backgroundColor: '#1a2e5a', alignSelf: 'flex-end' },
  testAiBubble: { backgroundColor: '#1a2e0a', alignSelf: 'flex-start' },
  testBubbleLabel: { fontSize: 10, color: '#888', marginBottom: 3 },
  testBubbleText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  testMicBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center',
  },
  testSendBtn: { backgroundColor: '#76b900', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center', height: 40 },
  testSendBtnText: { color: '#000', fontWeight: '600', fontSize: 14 },
  micStatusBar: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12,
    borderWidth: 1, gap: 8,
  },
  micDot: { width: 10, height: 10, borderRadius: 5 },
  micStatusText: { flex: 1, fontSize: 13, fontWeight: '500' },
  micToggleBtn: { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  modelSpeedBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
});

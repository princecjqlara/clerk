import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, ActivityIndicator, View, Platform } from 'react-native';
import { getSession, getCurrentProfile, onAuthStateChange, type UserProfile } from './src/services/AuthService';
import { callService } from './src/services/CallService';
import { ConversationManager } from './src/services/ConversationManager';
import * as Storage from './src/services/StorageService';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TestScreen from './src/screens/TestScreen';
import InstructionsScreen from './src/screens/InstructionsScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import AdminUsersScreen from './src/screens/AdminUsersScreen';
import AdminTenantsScreen from './src/screens/AdminTenantsScreen';
import AdminCallLogsScreen from './src/screens/AdminCallLogsScreen';
import AdminAppPreviewScreen from './src/screens/AdminAppPreviewScreen';
import TenantDashboardScreen from './src/screens/TenantDashboardScreen';
import TenantConfigScreen from './src/screens/TenantConfigScreen';
import TenantMetricsScreen from './src/screens/TenantMetricsScreen';
import { checkForUpdate, promptUpdate } from './src/services/UpdateService';

// Import and re-export callState from its own module to avoid require cycles
import { callState } from './src/services/CallState';
export { callState };

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const conversationRef = useRef<ConversationManager | null>(null);

  const homeScreen = () => profile?.role === 'admin' ? 'admin-dashboard' : 'tenant-dashboard';

  // Initialize CallService and wire up AI response bridge on Android
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    callService.init();

    // When a call comes in, create a ConversationManager with current tenant config
    const offIncoming = callService.on('incoming', async (data) => {
      console.log('[App] Incoming call from', data.phoneNumber);
      callState.update({ isOnCall: true, phoneNumber: data.phoneNumber, callId: data.callId, flowState: 'ringing' });

      try {
        const apiKey = await Storage.getApiKey() || '';
        const businessName = await Storage.getBusinessName() || '';
        const instructions = await Storage.getCustomInstructions() || '';
        const callGoal = (await Storage.getCallGoal()) || 'book';

        conversationRef.current = new ConversationManager({
          apiKey,
          businessName,
          callGoal: callGoal as 'book' | 'order',
          customInstructions: instructions,
        });
      } catch (e) {
        console.error('[App] Failed to init ConversationManager:', e);
      }
    });

    const offAnswered = callService.on('answered', () => {
      callState.update({ flowState: 'answered' });
    });

    // Native AudioBridge requests an AI greeting
    const offGreeting = callService.on('requestGreeting', async () => {
      console.log('[App] Greeting requested by AudioBridge');
      callState.update({ flowState: 'greeting' });
      try {
        const mgr = conversationRef.current;
        if (mgr) {
          const greeting = await mgr.getGreeting();
          await callService.supplyAIResponse(greeting);
        }
      } catch (e) {
        console.error('[App] Greeting generation failed:', e);
      }
    });

    // Native AudioBridge requests an AI response to caller speech
    const offAIRequest = callService.on('requestAIResponse', async (data) => {
      console.log('[App] AI response requested for:', data.text);
      callState.update({ flowState: 'thinking' });
      try {
        const mgr = conversationRef.current;
        if (mgr) {
          const response = await mgr.respond(data.text);
          await callService.supplyAIResponse(response);
        }
      } catch (e) {
        console.error('[App] AI response failed:', e);
      }
    });

    // Track call flow state
    const offFlow = callService.on('callFlowUpdate', (data) => {
      callState.update({ flowState: data.state });
    });

    // Call ended — save transcript and clean up
    const offDisconnected = callService.on('disconnected', async (data) => {
      console.log('[App] Call disconnected:', data.phoneNumber, 'duration:', data.duration);
      callState.update({ isOnCall: false, phoneNumber: '', callId: '', flowState: '' });

      try {
        const mgr = conversationRef.current;
        if (mgr) {
          const transcript = mgr.getTranscript();
          const callRecord = {
            id: Date.now().toString(),
            phoneNumber: data.phoneNumber || 'Unknown',
            timestamp: Date.now(),
            duration: parseInt(data.duration || '0', 10),
            transcript,
            callGoal: mgr.getGoal(),
          };
          await Storage.addCallRecord(callRecord);
        }
      } catch (e) {
        console.error('[App] Failed to save call record:', e);
      }
      conversationRef.current = null;
    });

    return () => {
      offIncoming();
      offAnswered();
      offGreeting();
      offAIRequest();
      offFlow();
      offDisconnected();
      callService.destroy();
    };
  }, []);

  useEffect(() => {
    let initialized = false;

    const init = async () => {
      try {
        const session = await getSession();
        if (session) {
          const p = await getCurrentProfile();
          setProfile(p);
          setScreen(p?.role === 'admin' ? 'admin-dashboard' : 'tenant-dashboard');

          // Check for app updates after login
          checkForUpdate().then((update) => {
            if (update) promptUpdate(update);
          });
        } else {
          setScreen('login');
        }
      } catch {
        setScreen('login');
      }
      initialized = true;
    };

    init();

    const { data: { subscription } } = onAuthStateChange(async (session) => {
      if (!initialized) return;
      // Only redirect on actual login/logout — not on tab switch
      if (!session) {
        setProfile(null);
        setScreen('login');
      }
      // Don't reset screen on session refresh — user stays where they are
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    const p = await getCurrentProfile();
    setProfile(p);
    setScreen(p?.role === 'admin' ? 'admin-dashboard' : 'tenant-dashboard');
  };

  const handleLogout = () => {
    setProfile(null);
    setScreen('login');
  };

  const renderScreen = () => {
    switch (screen) {
      case 'loading':
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#76b900" />
          </View>
        );
      case 'login':
        return <LoginScreen onLogin={handleLogin} />;

      // Admin screens
      case 'admin-dashboard':
        return <AdminDashboardScreen onNavigate={setScreen} onLogout={handleLogout} />;
      case 'admin-users':
        return <AdminUsersScreen onBack={() => setScreen('admin-dashboard')} />;
      case 'admin-tenants':
        return <AdminTenantsScreen onBack={() => setScreen('admin-dashboard')} />;
      case 'admin-calls':
        return <AdminCallLogsScreen onBack={() => setScreen('admin-dashboard')} />;
      case 'admin-preview':
        return <AdminAppPreviewScreen onBack={() => setScreen('admin-dashboard')} onNavigate={setScreen} />;

      // Tenant screens
      case 'tenant-dashboard':
        return <TenantDashboardScreen onLogout={handleLogout} onNavigate={setScreen} />;
      case 'tenant-config':
        return <TenantConfigScreen onBack={() => setScreen(homeScreen())} />;
      case 'tenant-metrics':
        return <TenantMetricsScreen onBack={() => setScreen(homeScreen())} />;

      // Shared screens
      case 'settings':
        return <SettingsScreen onBack={() => setScreen(homeScreen())} />;
      case 'test':
        return <TestScreen onBack={() => setScreen(homeScreen())} />;
      case 'instructions':
        return <InstructionsScreen onBack={() => setScreen(homeScreen())} />;
      default:
        return <HomeScreen onNavigate={setScreen} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {renderScreen()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

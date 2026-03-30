import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, ActivityIndicator, View } from 'react-native';
import { getSession, getCurrentProfile, onAuthStateChange, type UserProfile } from './src/services/AuthService';
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

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const homeScreen = () => profile?.role === 'admin' ? 'admin-dashboard' : 'tenant-dashboard';

  useEffect(() => {
    let initialized = false;

    const init = async () => {
      try {
        const session = await getSession();
        if (session) {
          const p = await getCurrentProfile();
          setProfile(p);
          setScreen(p?.role === 'admin' ? 'admin-dashboard' : 'tenant-dashboard');
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
      // Skip the initial fire — we already handled it above
      if (!initialized) return;
      if (session) {
        const p = await getCurrentProfile();
        setProfile(p);
        setScreen(p?.role === 'admin' ? 'admin-dashboard' : 'tenant-dashboard');
      } else {
        setProfile(null);
        setScreen('login');
      }
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

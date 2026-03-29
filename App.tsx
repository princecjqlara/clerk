import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TestScreen from './src/screens/TestScreen';
import InstructionsScreen from './src/screens/InstructionsScreen';

export default function App() {
  const [screen, setScreen] = useState('home');

  const renderScreen = () => {
    switch (screen) {
      case 'settings':
        return <SettingsScreen onBack={() => setScreen('home')} />;
      case 'test':
        return <TestScreen onBack={() => setScreen('home')} />;
      case 'instructions':
        return <InstructionsScreen onBack={() => setScreen('home')} />;
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
});

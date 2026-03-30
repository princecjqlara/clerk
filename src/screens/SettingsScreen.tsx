import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import * as Storage from '../services/StorageService';
import { getCurrentProfile } from '../services/AuthService';
import { supabaseAdmin } from '../services/SupabaseClient';

interface Props {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: Props) {
  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    (async () => {
      setBusinessName(await Storage.getBusinessName());

      try {
        const profile = await getCurrentProfile();
        if (profile) {
          setUserEmail(profile.email);
          setUserRole(profile.role);

          // Load tenant info
          const { data: owned } = await supabaseAdmin
            .from('tenants')
            .select('name, business_phone')
            .eq('owner_id', profile.id)
            .limit(1);
          if (owned && owned[0]) {
            setTenantName(owned[0].name);
            setBusinessPhone(owned[0].business_phone || '');
          }
        }
      } catch {}
    })();
  }, []);

  const save = async () => {
    await Storage.setBusinessName(businessName.trim());
    Alert.alert('Saved', 'Settings saved successfully.');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtn}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={save}>
          <Text style={styles.saveBtn}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Account Info */}
      <View style={styles.section}>
        <Text style={styles.label}>Account</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{userEmail || 'Not logged in'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role</Text>
            <View style={[styles.roleBadge, { backgroundColor: userRole === 'admin' ? '#1a2e0a' : '#1a1a2e' }]}>
              <Text style={[styles.roleBadgeText, { color: userRole === 'admin' ? '#76b900' : '#64b5f6' }]}>
                {userRole || 'user'}
              </Text>
            </View>
          </View>
          {tenantName ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Business</Text>
              <Text style={styles.infoValue}>{tenantName}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Business Name (local) */}
      <View style={styles.section}>
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Your Company Name"
          placeholderTextColor="#555"
        />
        <Text style={styles.hint}>Shown in the app header and AI greeting</Text>
      </View>

      {/* How It Works */}
      <View style={styles.section}>
        <Text style={styles.label}>How It Works</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            1. Admin creates your tenant with API key{'\n'}
            2. Configure AI in the AI Config tab (Rules, Knowledge, Flow){'\n'}
            3. Enable the AI Receptionist toggle{'\n'}
            4. Set this app as your default phone app{'\n'}
            5. Incoming calls will be auto-answered by AI{'\n'}
            6. Call summaries appear on your dashboard
          </Text>
        </View>
      </View>

      {/* API Key Notice */}
      <View style={styles.section}>
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>NVIDIA API Key</Text>
          <Text style={styles.noticeText}>
            API keys are managed by your admin per-tenant. Contact your admin to update the API key.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20,
  },
  backBtn: { color: '#76b900', fontSize: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  saveBtn: { color: '#76b900', fontSize: 16, fontWeight: '600' },
  section: { marginHorizontal: 16, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#ccc', marginBottom: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#333',
  },
  hint: { color: '#666', fontSize: 12, marginTop: 8 },
  infoCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#333' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  infoLabel: { fontSize: 14, color: '#888' },
  infoValue: { fontSize: 14, color: '#fff', fontWeight: '500' },
  infoText: { color: '#ccc', fontSize: 14, lineHeight: 22 },
  roleBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  roleBadgeText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  noticeCard: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#76b900',
  },
  noticeTitle: { fontSize: 14, fontWeight: '700', color: '#76b900', marginBottom: 6 },
  noticeText: { fontSize: 13, color: '#888', lineHeight: 18 },
});

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Platform,
} from 'react-native';
import { getAllTenants, createTenant, updateTenant, toggleTenantActive, deleteTenant, type Tenant } from '../services/AdminService';
import { getApiBase } from '../services/ApiBase';
import { supabaseAdmin } from '../services/SupabaseClient';

// Alert that works on web too
const alert = (title: string, message?: string) => {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}: ${message}` : title);
  } else {
    const { Alert } = require('react-native');
    alert(title, message);
  }
};

interface Props {
  onBack: () => void;
}

export default function AdminTenantsScreen({ onBack }: Props) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({
    name: '', nvidia_api_key: '', max_users: '5', business_phone: '',
    custom_instructions: '', email: '', password: '',
    elevenlabs_keys: [] as { apiKey: string; label: string }[],
  });
  const [newElKey, setNewElKey] = useState('');
  const [newElLabel, setNewElLabel] = useState('');

  const loadTenants = async () => {
    try {
      const data = await getAllTenants();
      setTenants(data);
    } catch (err: any) {
      alert('Error', err.message);
    }
    setLoading(false);
  };

  useEffect(() => { loadTenants(); }, []);

  const openCreate = () => {
    setEditTenant(null);
    setForm({
      name: '', nvidia_api_key: '', max_users: '5', business_phone: '',
      custom_instructions: '', email: '', password: '',
      elevenlabs_keys: [],
    });
    setNewElKey('');
    setNewElLabel('');
    setShowModal(true);
  };

  const openEdit = (t: Tenant) => {
    setEditTenant(t);
    setForm({
      name: t.name,
      nvidia_api_key: t.nvidia_api_key,
      max_users: String(t.max_users),
      business_phone: t.business_phone,
      custom_instructions: t.custom_instructions,
      email: '',
      password: '',
      elevenlabs_keys: (t as any).elevenlabs_keys || [],
    });
    setNewElKey('');
    setNewElLabel('');
    setShowModal(true);
  };

  const addElKey = () => {
    if (!newElKey.trim()) return;
    if (form.elevenlabs_keys.some(k => k.apiKey === newElKey.trim())) {
      alert('Duplicate', 'This key already exists');
      return;
    }
    setForm({
      ...form,
      elevenlabs_keys: [...form.elevenlabs_keys, {
        apiKey: newElKey.trim(),
        label: newElLabel.trim() || `Account ${form.elevenlabs_keys.length + 1}`,
      }],
    });
    setNewElKey('');
    setNewElLabel('');
  };

  const removeElKey = (index: number) => {
    setForm({
      ...form,
      elevenlabs_keys: form.elevenlabs_keys.filter((_, i) => i !== index),
    });
  };

  const syncElevenLabsKeys = async (keys: { apiKey: string; label: string }[]) => {
    // Sync keys to the proxy server for runtime rotation
    try {
      // Clear existing keys first
      const listRes = await fetch(`${getApiBase()}/api/elevenlabs-keys`);
      if (listRes.ok) {
        const data = await listRes.json();
        // Remove all existing keys (reverse order to avoid index shift)
        for (let i = data.keys.length - 1; i >= 0; i--) {
          await fetch(`${getApiBase()}/api/elevenlabs-keys/${i}`, { method: 'DELETE' });
        }
      }
      // Add new keys
      for (const k of keys) {
        await fetch(`${getApiBase()}/api/elevenlabs-keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(k),
        });
      }
    } catch {
      // Proxy not running — keys will be synced when proxy starts
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Error', 'Name is required'); return; }
    try {
      if (editTenant) {
        await updateTenant(editTenant.id, {
          name: form.name,
          nvidia_api_key: form.nvidia_api_key,
          max_users: parseInt(form.max_users) || 5,
          business_phone: form.business_phone,
          custom_instructions: form.custom_instructions,
          elevenlabs_keys: form.elevenlabs_keys,
        } as any);
      } else {
        // Validate email/password for new tenants
        if (!form.email.trim() || !form.password.trim()) {
          alert('Error', 'Email and password are required for new tenants');
          return;
        }
        if (form.password.length < 6) {
          alert('Error', 'Password must be at least 6 characters');
          return;
        }

        // Create Supabase auth user for the tenant
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: form.email.trim(),
          password: form.password,
          email_confirm: true,
          user_metadata: { full_name: form.name },
        });
        if (authError) throw authError;

        // Create the tenant with the new user as owner
        await createTenant({
          name: form.name,
          owner_id: authData.user.id,
          nvidia_api_key: form.nvidia_api_key,
          max_users: parseInt(form.max_users) || 5,
          business_phone: form.business_phone,
          custom_instructions: form.custom_instructions,
          elevenlabs_keys: form.elevenlabs_keys,
        } as any);

        // Add the user as tenant member (owner)
        const { data: tenants } = await supabaseAdmin
          .from('tenants')
          .select('id')
          .eq('owner_id', authData.user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (tenants && tenants[0]) {
          await supabaseAdmin.from('tenant_members').insert({
            tenant_id: tenants[0].id,
            user_id: authData.user.id,
            role: 'owner',
          });
        }

        alert('Success', `Tenant created!\n\nLogin: ${form.email.trim()}\nPassword: ${form.password}`);
      }

      // Sync ElevenLabs keys to proxy server (non-blocking, may not be running)
      if (form.elevenlabs_keys.length > 0) {
        syncElevenLabsKeys(form.elevenlabs_keys).catch(() => {});
      }

      setShowModal(false);
      setLoading(true);
      loadTenants();
    } catch (err: any) {
      alert('Error', err.message);
      console.error('Save tenant error:', err);
    }
  };

  const handleDelete = async (t: Tenant) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete "${t.name}"? This cannot be undone.`)
      : true; // On native, Alert with buttons handles this
    if (!confirmed) return;
    try {
      await deleteTenant(t.id);
      setTenants(tenants.filter(x => x.id !== t.id));
    } catch (err: any) {
      alert('Error', err.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backBtn}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Tenants ({tenants.length})</Text>
          <TouchableOpacity onPress={openCreate}>
            <Text style={styles.addBtn}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#76b900" style={{ marginTop: 40 }} />
        ) : tenants.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No tenants yet</Text>
            <TouchableOpacity style={styles.createBtn} onPress={openCreate}>
              <Text style={styles.createBtnText}>Create First Tenant</Text>
            </TouchableOpacity>
          </View>
        ) : (
          tenants.map((t) => (
            <View key={t.id} style={[styles.tenantCard, !t.is_active && styles.tenantInactive]}>
              <View style={styles.tenantHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tenantName}>{t.name}</Text>
                  <Text style={styles.tenantMeta}>
                    Max {t.max_users} users | {t.business_phone || 'No phone'}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: t.is_active ? '#1a2e0a' : '#2e0a0a' }]}>
                  <Text style={[styles.statusText, { color: t.is_active ? '#76b900' : '#f44336' }]}>
                    {t.is_active ? 'Active' : 'Disabled'}
                  </Text>
                </View>
              </View>

              <View style={styles.apiKeyRow}>
                <Text style={styles.apiKeyLabel}>NVIDIA API Key:</Text>
                <Text style={styles.apiKeyValue}>
                  {t.nvidia_api_key ? `${t.nvidia_api_key.substring(0, 12)}...` : 'Not set'}
                </Text>
              </View>

              <View style={styles.goalRow}>
                <Text style={styles.apiKeyLabel}>ElevenLabs:</Text>
                <View style={[styles.goalBadge, {
                  backgroundColor: (t as any).elevenlabs_keys?.length > 0 ? '#1a2e0a' : '#1a1a1a'
                }]}>
                  <Text style={[styles.goalBadgeText, {
                    color: (t as any).elevenlabs_keys?.length > 0 ? '#76b900' : '#666'
                  }]}>
                    {(t as any).elevenlabs_keys?.length > 0
                      ? `${(t as any).elevenlabs_keys.length} key${(t as any).elevenlabs_keys.length > 1 ? 's' : ''} (rotation)`
                      : 'Not configured'}
                  </Text>
                </View>
              </View>

              {t.custom_instructions ? (
                <Text style={styles.instructions} numberOfLines={2}>{t.custom_instructions}</Text>
              ) : null}

              <View style={styles.tenantActions}>
                <TouchableOpacity style={[styles.tBtn, { backgroundColor: '#1a1a2e' }]} onPress={() => openEdit(t)}>
                  <Text style={[styles.tBtnText, { color: '#64b5f6' }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tBtn, { backgroundColor: t.is_active ? '#2e1a0a' : '#1a2e0a' }]}
                  onPress={async () => { await toggleTenantActive(t.id, !t.is_active); setLoading(true); loadTenants(); }}
                >
                  <Text style={[styles.tBtnText, { color: t.is_active ? '#ff9800' : '#76b900' }]}>
                    {t.is_active ? 'Disable' : 'Enable'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tBtn, { backgroundColor: '#2e0a0a' }]} onPress={() => handleDelete(t)}>
                  <Text style={[styles.tBtnText, { color: '#f44336' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editTenant ? 'Edit Tenant' : 'New Tenant'}</Text>

            <Text style={styles.fieldLabel}>Business Name *</Text>
            <TextInput style={styles.fieldInput} value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="Acme Corp" placeholderTextColor="#555" />

            {!editTenant && (
              <>
                <Text style={styles.fieldLabel}>Tenant Email *</Text>
                <TextInput style={styles.fieldInput} value={form.email} onChangeText={v => setForm({ ...form, email: v })} placeholder="tenant@business.com" placeholderTextColor="#555" keyboardType="email-address" autoCapitalize="none" />

                <Text style={styles.fieldLabel}>Tenant Password *</Text>
                <TextInput style={styles.fieldInput} value={form.password} onChangeText={v => setForm({ ...form, password: v })} placeholder="Min 6 characters" placeholderTextColor="#555" secureTextEntry />
              </>
            )}

            <Text style={styles.fieldLabel}>NVIDIA API Key</Text>
            <TextInput style={styles.fieldInput} value={form.nvidia_api_key} onChangeText={v => setForm({ ...form, nvidia_api_key: v })} placeholder="nvapi-..." placeholderTextColor="#555" autoCapitalize="none" />

            <Text style={styles.fieldLabel}>Max Users</Text>
            <TextInput style={styles.fieldInput} value={form.max_users} onChangeText={v => setForm({ ...form, max_users: v })} keyboardType="numeric" placeholderTextColor="#555" />

            <Text style={styles.fieldLabel}>Business Phone</Text>
            <TextInput style={styles.fieldInput} value={form.business_phone} onChangeText={v => setForm({ ...form, business_phone: v })} placeholder="+1234567890" placeholderTextColor="#555" />

            <Text style={styles.fieldLabel}>Custom Instructions</Text>
            <TextInput style={[styles.fieldInput, { minHeight: 80 }]} value={form.custom_instructions} onChangeText={v => setForm({ ...form, custom_instructions: v })} placeholder="Business info, FAQs..." placeholderTextColor="#555" multiline />

            {/* ElevenLabs API Keys */}
            <Text style={styles.fieldLabel}>ElevenLabs API Keys (for voice rotation)</Text>
            <Text style={styles.elHint}>Add multiple keys for automatic rotation when rate limits are hit</Text>

            {form.elevenlabs_keys.map((k, i) => (
              <View key={i} style={styles.elKeyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.elKeyLabel}>{k.label}</Text>
                  <Text style={styles.elKeyValue}>...{k.apiKey.slice(-8)}</Text>
                </View>
                <TouchableOpacity style={styles.elKeyRemove} onPress={() => removeElKey(i)}>
                  <Text style={styles.elKeyRemoveText}>X</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.elAddSection}>
              <TextInput
                style={[styles.fieldInput, { marginBottom: 6 }]}
                value={newElLabel}
                onChangeText={setNewElLabel}
                placeholder="Label (e.g. Account 1)"
                placeholderTextColor="#555"
              />
              <TextInput
                style={[styles.fieldInput, { marginBottom: 6 }]}
                value={newElKey}
                onChangeText={setNewElKey}
                placeholder="ElevenLabs API Key"
                placeholderTextColor="#555"
                secureTextEntry
              />
              <TouchableOpacity style={styles.elAddBtn} onPress={addElKey}>
                <Text style={styles.elAddBtnText}>+ Add Key</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
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
  addBtn: { color: '#76b900', fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#888', fontWeight: '600' },
  createBtn: { backgroundColor: '#76b900', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 },
  createBtnText: { color: '#000', fontWeight: '700' },
  tenantCard: {
    marginHorizontal: 16, backgroundColor: '#1a1a1a', borderRadius: 14,
    padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#222',
  },
  tenantInactive: { opacity: 0.6 },
  tenantHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tenantName: { fontSize: 17, fontWeight: '600', color: '#fff' },
  tenantMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  apiKeyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  apiKeyLabel: { fontSize: 12, color: '#888', marginRight: 6 },
  apiKeyValue: { fontSize: 12, color: '#76b900', fontFamily: 'monospace' },
  goalRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  goalBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  goalBadgeText: { fontSize: 12, fontWeight: '600' },
  // (goal selector styles removed — goal is now set by tenant, not admin)
  instructions: { fontSize: 12, color: '#666', marginBottom: 10, fontStyle: 'italic' },
  tenantActions: { flexDirection: 'row', gap: 8 },
  tBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center' },
  tBtnText: { fontSize: 13, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', paddingHorizontal: 20 },
  modalContent: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#333' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: '#888', marginBottom: 4, textTransform: 'uppercase' },
  fieldInput: {
    backgroundColor: '#111', borderRadius: 8, padding: 12, color: '#fff',
    fontSize: 15, borderWidth: 1, borderColor: '#333', marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, backgroundColor: '#222', borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#888', fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#76b900', borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: '700' },
  // ElevenLabs key styles
  elHint: { fontSize: 11, color: '#666', marginBottom: 10 },
  elKeyRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#111',
    borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#333',
  },
  elKeyLabel: { fontSize: 13, color: '#ff9800', fontWeight: '600' },
  elKeyValue: { fontSize: 11, color: '#888', fontFamily: 'monospace', marginTop: 2 },
  elKeyRemove: {
    width: 28, height: 28, borderRadius: 6, backgroundColor: '#2e0a0a',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  elKeyRemoveText: { color: '#f44336', fontWeight: '700', fontSize: 12 },
  elAddSection: { marginBottom: 12 },
  elAddBtn: {
    borderWidth: 1, borderColor: '#ff9800', borderStyle: 'dashed',
    borderRadius: 8, padding: 10, alignItems: 'center',
  },
  elAddBtnText: { color: '#ff9800', fontSize: 13, fontWeight: '600' },
});

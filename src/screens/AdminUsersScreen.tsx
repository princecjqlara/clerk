import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { getAllUsers, updateUserRole, toggleUserActive } from '../services/AdminService';
import type { UserProfile } from '../services/AuthService';

interface Props {
  onBack: () => void;
}

export default function AdminUsersScreen({ onBack }: Props) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const handleToggleActive = async (user: UserProfile) => {
    try {
      await toggleUserActive(user.id, !user.is_active);
      setUsers(users.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleToggleRole = async (user: UserProfile) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await updateUserRole(user.id, newRole);
      setUsers(users.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtn}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Users ({users.length})</Text>
        <TouchableOpacity onPress={() => { setLoading(true); loadUsers(); }}>
          <Text style={styles.refreshBtn}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#76b900" style={{ marginTop: 40 }} />
      ) : users.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No users found</Text>
          <Text style={styles.emptySubtext}>Run the SQL schema first to set up the database</Text>
        </View>
      ) : (
        users.map((user) => (
          <View key={user.id} style={styles.userCard}>
            <View style={styles.userHeader}>
              <View style={[styles.avatar, { backgroundColor: user.role === 'admin' ? '#76b900' : '#2196F3' }]}>
                <Text style={styles.avatarText}>{(user.full_name || user.email)[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{user.full_name || 'No Name'}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: user.role === 'admin' ? '#1a2e0a' : '#1a1a2e' }]}>
                <Text style={[styles.roleBadgeText, { color: user.role === 'admin' ? '#76b900' : '#64b5f6' }]}>
                  {user.role}
                </Text>
              </View>
            </View>

            <View style={styles.userMeta}>
              <Text style={styles.metaText}>
                Status: {user.is_active ? 'Active' : 'Disabled'} | Joined: {new Date(user.created_at).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.userActions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: user.is_active ? '#2e1a0a' : '#1a2e0a' }]}
                onPress={() => handleToggleActive(user)}
              >
                <Text style={[styles.actionBtnText, { color: user.is_active ? '#ff9800' : '#76b900' }]}>
                  {user.is_active ? 'Disable' : 'Enable'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#1a1a2e' }]}
                onPress={() => handleToggleRole(user)}
              >
                <Text style={[styles.actionBtnText, { color: '#64b5f6' }]}>
                  Make {user.role === 'admin' ? 'User' : 'Admin'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
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
  refreshBtn: { color: '#76b900', fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#888', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#555', marginTop: 4 },
  userCard: {
    marginHorizontal: 16, backgroundColor: '#1a1a1a', borderRadius: 14,
    padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#222',
  },
  userHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#000', fontWeight: '700', fontSize: 16 },
  userName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  userEmail: { fontSize: 13, color: '#888', marginTop: 1 },
  roleBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  roleBadgeText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  userMeta: { marginBottom: 10 },
  metaText: { fontSize: 12, color: '#666' },
  userActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
});

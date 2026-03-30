import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { getDashboardStats, type DashboardStats } from '../services/AdminService';
import { signOut } from '../services/AuthService';

interface Props {
  onNavigate: (screen: string) => void;
  onLogout: () => void;
}

export default function AdminDashboardScreen({ onNavigate, onLogout }: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#76b900" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStats(); }} tintColor="#76b900" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Admin Dashboard</Text>
          <Text style={styles.subtitle}>AI Receptionist Management</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderColor: '#76b900' }]}>
          <Text style={styles.statValue}>{stats?.totalUsers || 0}</Text>
          <Text style={styles.statLabel}>Total Users</Text>
          <Text style={styles.statSub}>{stats?.activeUsers || 0} active</Text>
        </View>
        <View style={[styles.statCard, { borderColor: '#2196F3' }]}>
          <Text style={styles.statValue}>{stats?.totalTenants || 0}</Text>
          <Text style={styles.statLabel}>Tenants</Text>
          <Text style={styles.statSub}>{stats?.activeTenants || 0} active</Text>
        </View>
        <View style={[styles.statCard, { borderColor: '#FF9800' }]}>
          <Text style={styles.statValue}>{stats?.totalCalls || 0}</Text>
          <Text style={styles.statLabel}>Total Calls</Text>
          <Text style={styles.statSub}>All time</Text>
        </View>
      </View>

      {/* Navigation Cards */}
      <Text style={styles.sectionTitle}>Management</Text>
      <View style={styles.navGrid}>
        <TouchableOpacity style={styles.navCard} onPress={() => onNavigate('admin-users')}>
          <Text style={styles.navIcon}>&#128101;</Text>
          <Text style={styles.navLabel}>Users</Text>
          <Text style={styles.navDesc}>Manage user access & roles</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navCard} onPress={() => onNavigate('admin-tenants')}>
          <Text style={styles.navIcon}>&#127970;</Text>
          <Text style={styles.navLabel}>Tenants</Text>
          <Text style={styles.navDesc}>Manage businesses & API keys</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navCard} onPress={() => onNavigate('admin-calls')}>
          <Text style={styles.navIcon}>&#128222;</Text>
          <Text style={styles.navLabel}>Call Logs</Text>
          <Text style={styles.navDesc}>View all call history</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navCard} onPress={() => onNavigate('admin-preview')}>
          <Text style={styles.navIcon}>&#128241;</Text>
          <Text style={styles.navLabel}>App Preview</Text>
          <Text style={styles.navDesc}>See phone app UI</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Activity */}
      <Text style={styles.sectionTitle}>Recent Calls</Text>
      {(stats?.recentCalls?.length || 0) === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No calls yet</Text>
        </View>
      ) : (
        stats?.recentCalls.map((call) => (
          <View key={call.id} style={styles.callItem}>
            <View style={styles.callStatusDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.callNumber}>{call.phone_number}</Text>
              <Text style={styles.callTime}>{new Date(call.created_at).toLocaleString()}</Text>
            </View>
            <View style={[styles.callBadge, { backgroundColor: call.status === 'completed' ? '#1a2e0a' : '#2e1a0a' }]}>
              <Text style={[styles.callBadgeText, { color: call.status === 'completed' ? '#76b900' : '#ff9800' }]}>
                {call.status}
              </Text>
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
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 13, color: '#76b900', marginTop: 2 },
  logoutBtn: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#333' },
  logoutText: { color: '#f44336', fontSize: 13, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16,
    borderWidth: 1, alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 12, color: '#ccc', marginTop: 4 },
  statSub: { fontSize: 11, color: '#666', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#fff', paddingHorizontal: 20, marginBottom: 12 },
  navGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginBottom: 24 },
  navCard: {
    width: '48%', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: '#333',
  },
  navIcon: { fontSize: 28, marginBottom: 8 },
  navLabel: { fontSize: 16, fontWeight: '600', color: '#fff' },
  navDesc: { fontSize: 12, color: '#888', marginTop: 4 },
  emptyCard: { marginHorizontal: 16, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 30, alignItems: 'center' },
  emptyText: { color: '#555', fontSize: 14 },
  callItem: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, marginBottom: 8,
  },
  callStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#76b900', marginRight: 12 },
  callNumber: { fontSize: 15, color: '#fff', fontWeight: '500' },
  callTime: { fontSize: 12, color: '#888', marginTop: 2 },
  callBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  callBadgeText: { fontSize: 11, fontWeight: '600' },
});

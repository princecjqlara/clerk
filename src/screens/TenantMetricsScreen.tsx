import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { supabaseAdmin } from '../services/SupabaseClient';
import { getCurrentProfile } from '../services/AuthService';

interface Props {
  onBack: () => void;
}

interface DayMetric {
  date: string;
  count: number;
  totalDuration: number;
  completed: number;
  missed: number;
}

export default function TenantMetricsScreen({ onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalCalls: 0,
    avgCallsPerDay: 0,
    avgDuration: 0,
    completionRate: 0,
    totalBookings: 0,
    totalOrders: 0,
    peakHour: '',
    dailyData: [] as DayMetric[],
  });

  useEffect(() => { loadMetrics(); }, []);

  const loadMetrics = async () => {
    try {
      const profile = await getCurrentProfile();
      if (!profile) return;

      // Find tenant
      let tenantId = '';
      const { data: owned } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('owner_id', profile.id)
        .limit(1);
      if (owned && owned[0]) {
        tenantId = owned[0].id;
      } else {
        const { data: membership } = await supabaseAdmin
          .from('tenant_members')
          .select('tenant_id')
          .eq('user_id', profile.id)
          .limit(1);
        if (membership && membership[0]) tenantId = membership[0].tenant_id;
      }

      if (!tenantId) { setLoading(false); return; }

      // Get all calls for this tenant
      const { data: calls } = await supabaseAdmin
        .from('call_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      const allCalls = calls || [];
      if (allCalls.length === 0) { setLoading(false); return; }

      // Calculate metrics
      const totalCalls = allCalls.length;
      const completed = allCalls.filter(c => c.status === 'completed').length;
      const missed = allCalls.filter(c => c.status === 'missed').length;
      const totalDuration = allCalls.reduce((sum, c) => sum + (c.duration || 0), 0);
      const avgDuration = Math.round(totalDuration / totalCalls);
      const completionRate = Math.round((completed / totalCalls) * 100);

      // Count bookings vs orders from message_taken
      let totalBookings = 0;
      let totalOrders = 0;
      allCalls.forEach(c => {
        try {
          const summary = JSON.parse(c.message_taken || '{}');
          if (summary.type === 'booking') totalBookings++;
          if (summary.type === 'order') totalOrders++;
        } catch {}
      });

      // Daily breakdown (last 14 days)
      const dayMap = new Map<string, DayMetric>();
      const now = new Date();
      for (let i = 0; i < 14; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dayMap.set(key, { date: key, count: 0, totalDuration: 0, completed: 0, missed: 0 });
      }

      allCalls.forEach(c => {
        const day = c.created_at.split('T')[0];
        if (dayMap.has(day)) {
          const d = dayMap.get(day)!;
          d.count++;
          d.totalDuration += c.duration || 0;
          if (c.status === 'completed') d.completed++;
          if (c.status === 'missed') d.missed++;
        }
      });

      const dailyData = Array.from(dayMap.values()).reverse();
      const daysWithCalls = dailyData.filter(d => d.count > 0).length || 1;
      const avgCallsPerDay = Math.round((totalCalls / Math.max(daysWithCalls, 1)) * 10) / 10;

      // Peak hour
      const hourCounts = new Array(24).fill(0);
      allCalls.forEach(c => {
        const hour = new Date(c.created_at).getHours();
        hourCounts[hour]++;
      });
      const peakHourIdx = hourCounts.indexOf(Math.max(...hourCounts));
      const peakHour = `${peakHourIdx % 12 || 12}${peakHourIdx < 12 ? 'AM' : 'PM'} - ${(peakHourIdx + 1) % 12 || 12}${peakHourIdx + 1 < 12 ? 'AM' : 'PM'}`;

      setMetrics({
        totalCalls,
        avgCallsPerDay,
        avgDuration,
        completionRate,
        totalBookings,
        totalOrders,
        peakHour,
        dailyData,
      });
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const formatDuration = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  const maxCount = Math.max(...metrics.dailyData.map(d => d.count), 1);

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#76b900" /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.backBtn}>{'< Back'}</Text></TouchableOpacity>
        <Text style={styles.title}>Metrics</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Top Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{metrics.totalCalls}</Text>
          <Text style={styles.statLabel}>Total Calls</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#76b900' }]}>{metrics.avgCallsPerDay}</Text>
          <Text style={styles.statLabel}>Avg/Day</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#64b5f6' }]}>{formatDuration(metrics.avgDuration)}</Text>
          <Text style={styles.statLabel}>Avg Duration</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#ff9800' }]}>{metrics.completionRate}%</Text>
          <Text style={styles.statLabel}>Completion</Text>
        </View>
      </View>

      {/* Goal Stats */}
      <View style={styles.goalStats}>
        <View style={[styles.goalStatCard, { borderColor: '#64b5f6' }]}>
          <Text style={styles.goalStatIcon}>{'\u{1F4C5}'}</Text>
          <Text style={[styles.goalStatValue, { color: '#64b5f6' }]}>{metrics.totalBookings}</Text>
          <Text style={styles.goalStatLabel}>Bookings</Text>
        </View>
        <View style={[styles.goalStatCard, { borderColor: '#ff9800' }]}>
          <Text style={styles.goalStatIcon}>{'\u{1F4E6}'}</Text>
          <Text style={[styles.goalStatValue, { color: '#ff9800' }]}>{metrics.totalOrders}</Text>
          <Text style={styles.goalStatLabel}>Orders</Text>
        </View>
        <View style={[styles.goalStatCard, { borderColor: '#76b900' }]}>
          <Text style={styles.goalStatIcon}>{'\u{1F552}'}</Text>
          <Text style={[styles.goalStatValue, { color: '#76b900', fontSize: 14 }]}>{metrics.peakHour}</Text>
          <Text style={styles.goalStatLabel}>Peak Hour</Text>
        </View>
      </View>

      {/* Daily Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Calls per Day (Last 14 Days)</Text>
        <View style={styles.chart}>
          {metrics.dailyData.map((day) => {
            const height = Math.max((day.count / maxCount) * 120, 4);
            const dateLabel = new Date(day.date + 'T00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
            return (
              <View key={day.date} style={styles.chartBar}>
                <Text style={styles.chartCount}>{day.count || ''}</Text>
                <View style={styles.barContainer}>
                  <View style={[styles.bar, { height }]}>
                    {day.missed > 0 && (
                      <View style={[styles.barSegment, { height: (day.missed / day.count) * height, backgroundColor: '#ff9800' }]} />
                    )}
                  </View>
                </View>
                <Text style={styles.chartLabel}>{dateLabel}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Daily Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Daily Breakdown</Text>
        {metrics.dailyData.filter(d => d.count > 0).reverse().map((day) => (
          <View key={day.date} style={styles.dayRow}>
            <Text style={styles.dayDate}>
              {new Date(day.date + 'T00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <View style={styles.dayStats}>
              <Text style={styles.dayCallCount}>{day.count} calls</Text>
              <Text style={[styles.dayMeta, { color: '#76b900' }]}>{day.completed} done</Text>
              {day.missed > 0 && <Text style={[styles.dayMeta, { color: '#ff9800' }]}>{day.missed} missed</Text>}
              <Text style={styles.dayMeta}>{formatDuration(Math.round(day.totalDuration / day.count))} avg</Text>
            </View>
          </View>
        ))}
        {metrics.dailyData.filter(d => d.count > 0).length === 0 && (
          <Text style={styles.noData}>No call data yet</Text>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20,
  },
  backBtn: { color: '#76b900', fontSize: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },

  statsGrid: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 2 },

  goalStats: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 20 },
  goalStatCard: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1 },
  goalStatIcon: { fontSize: 22, marginBottom: 4 },
  goalStatValue: { fontSize: 20, fontWeight: '700' },
  goalStatLabel: { fontSize: 10, color: '#888', marginTop: 2 },

  section: { marginHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },

  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 170, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, paddingBottom: 30 },
  chartBar: { flex: 1, alignItems: 'center' },
  chartCount: { fontSize: 9, color: '#76b900', marginBottom: 2 },
  barContainer: { flex: 1, justifyContent: 'flex-end', width: '80%' },
  bar: { backgroundColor: '#76b900', borderRadius: 3, width: '100%', minHeight: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  barSegment: { width: '100%', borderRadius: 0 },
  chartLabel: { fontSize: 8, color: '#666', marginTop: 4, position: 'absolute', bottom: -18 },

  dayRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, marginBottom: 6,
  },
  dayDate: { fontSize: 13, color: '#fff', fontWeight: '500', width: 90 },
  dayStats: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  dayCallCount: { fontSize: 13, color: '#fff', fontWeight: '600' },
  dayMeta: { fontSize: 11, color: '#888' },
  noData: { color: '#555', textAlign: 'center', paddingVertical: 20 },
});

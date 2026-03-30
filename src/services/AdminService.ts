import { supabaseAdmin } from './SupabaseClient';
import type { UserProfile } from './AuthService';

// ==================== USERS ====================

export async function getAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateUserRole(userId: string, role: 'admin' | 'user') {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export async function deleteUser(userId: string) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

// ==================== TENANTS ====================

export interface Tenant {
  id: string;
  name: string;
  owner_id: string | null;
  nvidia_api_key: string;
  is_active: boolean;
  max_users: number;
  custom_instructions: string;
  business_phone: string;
  call_goal: 'book' | 'order';
  goal_config: any;
  elevenlabs_keys: { apiKey: string; label: string }[];
  created_at: string;
  updated_at: string;
}

export async function getAllTenants(): Promise<Tenant[]> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createTenant(tenant: {
  name: string;
  owner_id?: string;
  nvidia_api_key?: string;
  max_users?: number;
  custom_instructions?: string;
  business_phone?: string;
  elevenlabs_keys?: any;
}): Promise<Tenant> {
  // Only include fields that exist in the DB — skip elevenlabs_keys if column doesn't exist
  const insertData: any = {
    name: tenant.name,
    owner_id: tenant.owner_id,
    nvidia_api_key: tenant.nvidia_api_key || '',
    max_users: tenant.max_users || 5,
    custom_instructions: tenant.custom_instructions || '',
    business_phone: tenant.business_phone || '',
  };
  if (tenant.elevenlabs_keys) {
    insertData.elevenlabs_keys = tenant.elevenlabs_keys;
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .insert(insertData)
    .select()
    .single();
  if (error) {
    // If elevenlabs_keys column doesn't exist, retry without it
    if (error.message?.includes('elevenlabs_keys')) {
      delete insertData.elevenlabs_keys;
      const { data: d2, error: e2 } = await supabaseAdmin
        .from('tenants')
        .insert(insertData)
        .select()
        .single();
      if (e2) throw e2;
      return d2;
    }
    throw error;
  }
  return data;
}

export async function updateTenant(tenantId: string, updates: Partial<Tenant>) {
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', tenantId);
  if (error) throw error;
}

export async function deleteTenant(tenantId: string) {
  const { error } = await supabaseAdmin
    .from('tenants')
    .delete()
    .eq('id', tenantId);
  if (error) throw error;
}

export async function toggleTenantActive(tenantId: string, isActive: boolean) {
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', tenantId);
  if (error) throw error;
}

// ==================== TENANT MEMBERS ====================

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  is_active: boolean;
  joined_at: string;
}

export async function getTenantMembers(tenantId: string): Promise<(TenantMember & { profiles: UserProfile })[]> {
  const { data, error } = await supabaseAdmin
    .from('tenant_members')
    .select('*, profiles(*)')
    .eq('tenant_id', tenantId)
    .order('joined_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addTenantMember(tenantId: string, userId: string, role: string = 'member') {
  const { error } = await supabaseAdmin
    .from('tenant_members')
    .insert({ tenant_id: tenantId, user_id: userId, role });
  if (error) throw error;
}

export async function removeTenantMember(tenantId: string, userId: string) {
  const { error } = await supabaseAdmin
    .from('tenant_members')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ==================== CALL LOGS ====================

export interface CallLog {
  id: string;
  tenant_id: string;
  phone_number: string;
  caller_name: string;
  duration: number;
  transcript: any[];
  message_taken: string;
  ai_model_used: string;
  status: 'active' | 'completed' | 'missed' | 'failed';
  created_at: string;
}

export async function getAllCallLogs(limit = 50): Promise<CallLog[]> {
  const { data, error } = await supabaseAdmin
    .from('call_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getCallLogsByTenant(tenantId: string, limit = 50): Promise<CallLog[]> {
  const { data, error } = await supabaseAdmin
    .from('call_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ==================== STATS ====================

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalTenants: number;
  activeTenants: number;
  totalCalls: number;
  recentCalls: CallLog[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [usersRes, tenantsRes, callsRes, recentRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, is_active'),
    supabaseAdmin.from('tenants').select('id, is_active'),
    supabaseAdmin.from('call_logs').select('id'),
    supabaseAdmin.from('call_logs').select('*').order('created_at', { ascending: false }).limit(5),
  ]);

  const users = usersRes.data || [];
  const tenants = tenantsRes.data || [];

  return {
    totalUsers: users.length,
    activeUsers: users.filter((u: any) => u.is_active).length,
    totalTenants: tenants.length,
    activeTenants: tenants.filter((t: any) => t.is_active).length,
    totalCalls: callsRes.data?.length || 0,
    recentCalls: recentRes.data || [],
  };
}

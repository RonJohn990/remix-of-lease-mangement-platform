import { CorporateGroup, Entity, Lease, DashboardStats } from './types';
import { computeLease } from './computations';
import { supabase } from '@/integrations/supabase/client';

// Corporate Groups
export async function getGroups(): Promise<CorporateGroup[]> {
  const { data, error } = await supabase
    .from('corporate_groups')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(row => ({
    corporate_id: row.corporate_id,
    corporate_group_name: row.corporate_group_name,
    created_at: row.created_at,
  }));
}

export async function saveGroup(group: CorporateGroup): Promise<void> {
  const { error } = await supabase
    .from('corporate_groups')
    .upsert({
      corporate_id: group.corporate_id,
      corporate_group_name: group.corporate_group_name,
    }, { onConflict: 'corporate_id' });
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  // CASCADE will handle entities and leases
  const { error } = await supabase.from('corporate_groups').delete().eq('corporate_id', id);
  if (error) throw error;
}

// Entities
export async function getEntities(): Promise<Entity[]> {
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRowToEntity);
}

export async function getEntitiesByGroup(corporateId: string): Promise<Entity[]> {
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('corporate_id', corporateId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRowToEntity);
}

export async function saveEntity(entity: Entity): Promise<void> {
  const { error } = await supabase
    .from('entities')
    .upsert({
      entity_id: entity.entity_id,
      corporate_id: entity.corporate_id,
      legal_entity_name: entity.legal_entity_name,
      address: entity.address,
      location: entity.location,
      pin_code: entity.pin_code,
      financial_year_start: entity.financial_year_start,
      financial_year_end: entity.financial_year_end,
    }, { onConflict: 'entity_id' });
  if (error) throw error;
}

function mapRowToEntity(row: any): Entity {
  return {
    entity_id: row.entity_id,
    corporate_id: row.corporate_id,
    legal_entity_name: row.legal_entity_name || '',
    address: row.address || '',
    location: row.location || '',
    pin_code: row.pin_code || '',
    financial_year_start: row.financial_year_start || '04-01',
    financial_year_end: row.financial_year_end || '03-31',
    created_at: row.created_at,
  };
}

export async function deleteEntity(id: string): Promise<void> {
  const { error } = await supabase.from('entities').delete().eq('entity_id', id);
  if (error) throw error;
}

// Leases
export async function getLeases(): Promise<Lease[]> {
  const { data, error } = await supabase
    .from('leases')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRowToLease);
}

export async function getLeasesByEntity(entityId: string): Promise<Lease[]> {
  const { data, error } = await supabase
    .from('leases')
    .select('*')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRowToLease);
}

export async function getLease(leaseId: string): Promise<Lease | undefined> {
  const { data, error } = await supabase
    .from('leases')
    .select('*')
    .eq('lease_id', leaseId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRowToLease(data) : undefined;
}

export async function saveLease(lease: Lease): Promise<void> {
  const { error } = await supabase
    .from('leases')
    .upsert({
      lease_id: lease.lease_id,
      entity_id: lease.entity_id,
      legal_entity_name: lease.legal_entity_name,
      lease_version: lease.lease_version,
      lease_event: lease.lease_event,
      lease_name: lease.lease_name,
      vendor_name: lease.vendor_name,
      tagged_employee: lease.tagged_employee,
      asset_unit: lease.asset_unit,
      concerned_person: lease.concerned_person,
      lease_comments: lease.lease_comments,
      payment_frequency: lease.payment_frequency,
      lease_type: lease.lease_type,
      lease_start_date: lease.lease_start_date,
      lease_end_date: lease.lease_end_date,
      rent_commencement_date: lease.rent_commencement_date,
      discount_rate_ibr: lease.discount_rate_ibr,
      monthly_lease_amount: lease.monthly_lease_amount,
      number_installments: lease.number_installments,
      security_deposit: lease.security_deposit,
      initial_direct_cost: lease.initial_direct_cost,
      short_term_flag: lease.short_term_flag,
      low_value_flag: lease.low_value_flag,
      status: lease.status,
      escalations: JSON.parse(JSON.stringify(lease.escalations || [])),
      modifications: JSON.parse(JSON.stringify(lease.modifications || [])),
    }, { onConflict: 'lease_id' });
  if (error) throw error;
}

export async function deleteLease(id: string): Promise<void> {
  const { error } = await supabase.from('leases').delete().eq('lease_id', id);
  if (error) throw error;
}

function mapRowToLease(row: any): Lease {
  return {
    lease_id: row.lease_id,
    entity_id: row.entity_id,
    legal_entity_name: row.legal_entity_name || '',
    lease_version: row.lease_version || 1,
    lease_event: row.lease_event || 'INITIAL',
    lease_name: row.lease_name,
    vendor_name: row.vendor_name || '',
    tagged_employee: row.tagged_employee || '',
    asset_unit: row.asset_unit || '',
    concerned_person: row.concerned_person || '',
    lease_comments: row.lease_comments || '',
    payment_frequency: row.payment_frequency || 'Monthly',
    lease_type: row.lease_type || '',
    lease_start_date: row.lease_start_date,
    lease_end_date: row.lease_end_date,
    rent_commencement_date: row.rent_commencement_date,
    discount_rate_ibr: Number(row.discount_rate_ibr) || 0,
    monthly_lease_amount: Number(row.monthly_lease_amount) || 0,
    number_installments: row.number_installments || 0,
    security_deposit: Number(row.security_deposit) || 0,
    initial_direct_cost: Number(row.initial_direct_cost) || 0,
    short_term_flag: row.short_term_flag || false,
    low_value_flag: row.low_value_flag || false,
    status: row.status || 'Active',
    created_at: row.created_at,
    escalations: Array.isArray(row.escalations) ? row.escalations : [],
    modifications: Array.isArray(row.modifications) ? row.modifications : [],
  };
}

// Dashboard
export async function getDashboardStats(): Promise<DashboardStats> {
  const [groups, entities, leases] = await Promise.all([
    getGroups(),
    getEntities(),
    getLeases(),
  ]);
  const activeLeases = leases.filter(l => l.status === 'Active');

  let totalLiability = 0;
  let totalROU = 0;

  for (const lease of activeLeases) {
    try {
      const comp = computeLease(lease);
      totalLiability += comp.initial_liability;
      totalROU += comp.initial_rou;
    } catch {
      // skip invalid leases
    }
  }

  return {
    total_leases: leases.length,
    active_leases: activeLeases.length,
    total_liability: totalLiability,
    total_rou: totalROU,
    total_entities: entities.length,
    total_groups: groups.length,
  };
}

export function generateId(): string {
  return crypto.randomUUID();
}

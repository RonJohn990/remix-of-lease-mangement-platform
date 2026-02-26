import { CorporateGroup, Entity, Lease, DashboardStats } from './types';
import { api } from './api';

// Corporate Groups
export async function getGroups(): Promise<CorporateGroup[]> {
  return api.get<CorporateGroup[]>('/groups');
}

export async function saveGroup(group: CorporateGroup): Promise<void> {
  await api.post('/groups', {
    corporate_id: group.corporate_id,
    corporate_group_name: group.corporate_group_name,
  });
}

export async function deleteGroup(id: string): Promise<void> {
  await api.delete(`/groups/${id}`);
}

// Entities
export async function getEntities(): Promise<Entity[]> {
  return api.get<Entity[]>('/entities');
}

export async function getEntitiesByGroup(corporateId: string): Promise<Entity[]> {
  return api.get<Entity[]>(`/entities?corporate_id=${encodeURIComponent(corporateId)}`);
}

export async function saveEntity(entity: Entity): Promise<void> {
  await api.post('/entities', {
    entity_id: entity.entity_id,
    corporate_id: entity.corporate_id,
    legal_entity_name: entity.legal_entity_name,
    address: entity.address,
    location: entity.location,
    pin_code: entity.pin_code,
    financial_year_start: entity.financial_year_start,
    financial_year_end: entity.financial_year_end,
  });
}

export async function deleteEntity(id: string): Promise<void> {
  await api.delete(`/entities/${id}`);
}

// Leases
export async function getLeases(): Promise<Lease[]> {
  return api.get<Lease[]>('/leases');
}

export async function getLeasesByEntity(entityId: string): Promise<Lease[]> {
  return api.get<Lease[]>(`/leases?entity_id=${encodeURIComponent(entityId)}`);
}

export async function getLease(leaseId: string): Promise<Lease | undefined> {
  try {
    return await api.get<Lease>(`/leases/${leaseId}`);
  } catch {
    return undefined;
  }
}

export async function saveLease(lease: Lease): Promise<void> {
  await api.post('/leases', {
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
    payment_timing: lease.payment_timing,
    lease_type: lease.lease_type,
    lease_classification: lease.lease_classification,
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
    escalations: lease.escalations || [],
    modifications: lease.modifications || [],
  });
}

export async function deleteLease(id: string): Promise<void> {
  await api.delete(`/leases/${id}`);
}

// Dashboard - computations run on backend
export async function getDashboardStats(): Promise<DashboardStats> {
  return api.get<DashboardStats>('/compute/dashboard');
}

export function generateId(): string {
  return crypto.randomUUID();
}


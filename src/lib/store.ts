import { CorporateGroup, Entity, Lease, DashboardStats } from './types';
import { computeLease } from './computations';

const STORAGE_KEYS = {
  GROUPS: 'lease_app_groups',
  ENTITIES: 'lease_app_entities',
  LEASES: 'lease_app_leases',
};

function getItem<T>(key: string): T[] {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function setItem<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Corporate Groups
export function getGroups(): CorporateGroup[] {
  return getItem<CorporateGroup>(STORAGE_KEYS.GROUPS);
}

export function saveGroup(group: CorporateGroup): void {
  const groups = getGroups();
  const idx = groups.findIndex(g => g.corporate_id === group.corporate_id);
  if (idx >= 0) groups[idx] = group;
  else groups.push(group);
  setItem(STORAGE_KEYS.GROUPS, groups);
}

export function deleteGroup(id: string): void {
  setItem(STORAGE_KEYS.GROUPS, getGroups().filter(g => g.corporate_id !== id));
  // Also delete child entities and their leases
  const entities = getEntities().filter(e => e.corporate_id === id);
  entities.forEach(e => deleteEntity(e.entity_id));
}

// Entities
export function getEntities(): Entity[] {
  return getItem<Entity>(STORAGE_KEYS.ENTITIES);
}

export function getEntitiesByGroup(corporateId: string): Entity[] {
  return getEntities().filter(e => e.corporate_id === corporateId);
}

export function saveEntity(entity: Entity): void {
  const entities = getEntities();
  const idx = entities.findIndex(e => e.entity_id === entity.entity_id);
  if (idx >= 0) entities[idx] = entity;
  else entities.push(entity);
  setItem(STORAGE_KEYS.ENTITIES, entities);
}

export function deleteEntity(id: string): void {
  setItem(STORAGE_KEYS.ENTITIES, getEntities().filter(e => e.entity_id !== id));
  // Also delete child leases
  setItem(STORAGE_KEYS.LEASES, getLeases().filter(l => l.entity_id !== id));
}

// Leases
export function getLeases(): Lease[] {
  return getItem<Lease>(STORAGE_KEYS.LEASES);
}

export function getLeasesByEntity(entityId: string): Lease[] {
  return getLeases().filter(l => l.entity_id === entityId);
}

export function getLease(leaseId: string): Lease | undefined {
  return getLeases().find(l => l.lease_id === leaseId);
}

export function saveLease(lease: Lease): void {
  const leases = getLeases();
  const idx = leases.findIndex(l => l.lease_id === lease.lease_id);
  if (idx >= 0) leases[idx] = lease;
  else leases.push(lease);
  setItem(STORAGE_KEYS.LEASES, leases);
}

export function deleteLease(id: string): void {
  setItem(STORAGE_KEYS.LEASES, getLeases().filter(l => l.lease_id !== id));
}

// Dashboard
export function getDashboardStats(): DashboardStats {
  const groups = getGroups();
  const entities = getEntities();
  const leases = getLeases();
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

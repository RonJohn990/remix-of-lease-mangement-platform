// IFRS 16 Lease Management Types

export interface CorporateGroup {
  corporate_id: string;
  corporate_group_name: string;
  created_at: string;
}

export interface Entity {
  entity_id: string;
  corporate_id: string;
  legal_entity_name: string;
  created_at: string;
}

export type PaymentFrequency = 'Monthly' | 'Quarterly' | 'Annual';
export type LeaseEvent = 'INITIAL' | 'MODIFICATION' | 'TERMINATION';
export type LeaseStatus = 'Active' | 'Terminated';

export interface Lease {
  lease_id: string;
  entity_id: string;
  legal_entity_name: string;
  lease_version: number;
  lease_event: LeaseEvent;
  lease_name: string;
  vendor_name: string;
  tagged_employee: string;
  asset_unit: string;
  concerned_person: string;
  lease_comments: string;
  payment_frequency: PaymentFrequency;
  lease_type: string;
  lease_start_date: string;
  lease_end_date: string;
  rent_commencement_date: string;
  discount_rate_ibr: number;
  monthly_lease_amount: number;
  number_installments: number;
  security_deposit: number;
  initial_direct_cost: number;
  short_term_flag: boolean;
  low_value_flag: boolean;
  status: LeaseStatus;
  created_at: string;
  escalations: Escalation[];
}

export interface Escalation {
  escalation_start_date: string;
  escalation_percentage: number;
}

export interface ScheduleRow {
  period: number;
  period_date: string;
  days_in_period: number;
  lease_payment: number;
  opening_liability: number;
  interest_expense: number;
  closing_liability: number;
  opening_rou: number;
  depreciation: number;
  closing_rou: number;
  current_liability: number;
  non_current_liability: number;
  security_deposit_opening: number;
  interest_deposit: number;
  security_deposit_closing: number;
}

export interface LeaseComputation {
  lease_id: string;
  lease_version: number;
  initial_liability: number;
  initial_rou: number;
  total_interest: number;
  total_depreciation: number;
  schedule: ScheduleRow[];
}

export interface JournalEntry {
  date: string;
  description: string;
  debit_account: string;
  credit_account: string;
  amount: number;
}

export interface DashboardStats {
  total_leases: number;
  active_leases: number;
  total_liability: number;
  total_rou: number;
  total_entities: number;
  total_groups: number;
}

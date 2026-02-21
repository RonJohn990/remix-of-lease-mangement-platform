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
export type ModificationType = 'SCOPE_INCREASE' | 'SCOPE_DECREASE' | 'TERM_CHANGE' | 'PAYMENT_CHANGE' | 'EARLY_TERMINATION';

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
  modifications: LeaseModification[];
}

export interface Escalation {
  escalation_start_date: string;
  escalation_percentage: number;
}

export interface LeaseModification {
  modification_id: string;
  modification_date: string;
  modification_type: ModificationType;
  effective_date: string;
  description: string;
  // New lease terms after modification
  new_lease_end_date: string;
  new_monthly_amount: number;
  new_discount_rate: number;
  // Termination-specific
  termination_penalty: number;
  // Scope decrease percentage (for proportional derecognition)
  scope_decrease_percentage: number;
  // Computed results (populated after computation)
  carrying_liability_at_mod: number;
  carrying_rou_at_mod: number;
  new_liability: number;
  liability_adjustment: number;
  rou_adjustment: number;
  gain_loss: number;
  created_at: string;
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
  is_modification_point?: boolean;
  modification_label?: string;
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

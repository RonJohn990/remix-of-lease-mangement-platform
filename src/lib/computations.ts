import { Lease, ScheduleRow, LeaseComputation, JournalEntry } from './types';
import { differenceInDays, addMonths, addQuarters, addYears, format, parseISO } from 'date-fns';

function getPaymentDates(lease: Lease): Date[] {
  const start = parseISO(lease.rent_commencement_date);
  const end = parseISO(lease.lease_end_date);
  const dates: Date[] = [];
  let current = start;

  while (current <= end) {
    dates.push(current);
    switch (lease.payment_frequency) {
      case 'Monthly': current = addMonths(current, 1); break;
      case 'Quarterly': current = addQuarters(current, 1); break;
      case 'Annual': current = addYears(current, 1); break;
    }
  }
  return dates;
}

function getPaymentAmount(lease: Lease, date: Date): number {
  let amount = lease.monthly_lease_amount;
  if (lease.payment_frequency === 'Quarterly') amount *= 3;
  if (lease.payment_frequency === 'Annual') amount *= 12;

  // Apply escalations
  for (const esc of lease.escalations || []) {
    const escDate = parseISO(esc.escalation_start_date);
    if (date >= escDate) {
      amount *= (1 + esc.escalation_percentage / 100);
    }
  }
  return amount;
}

export function computeLease(lease: Lease): LeaseComputation {
  const commencementDate = parseISO(lease.rent_commencement_date);
  const endDate = parseISO(lease.lease_end_date);
  const paymentDates = getPaymentDates(lease);
  const rate = lease.discount_rate_ibr / 100;

  // Step 1: Calculate PV of future lease payments
  let initialLiability = 0;
  const payments: { date: Date; amount: number; daysDiff: number }[] = [];

  for (const pDate of paymentDates) {
    const daysDiff = differenceInDays(pDate, commencementDate);
    const amount = getPaymentAmount(lease, pDate);
    const pv = amount / Math.pow(1 + rate, daysDiff / 365);
    initialLiability += pv;
    payments.push({ date: pDate, amount, daysDiff });
  }

  // Step 2: ROU Asset = Lease Liability + Initial Direct Cost + Security Deposit adjustments
  const initialROU = initialLiability + (lease.initial_direct_cost || 0);

  // Step 3: Build amortization schedule
  const totalLeaseDays = differenceInDays(endDate, commencementDate);
  const dailyDepreciation = totalLeaseDays > 0 ? initialROU / totalLeaseDays : 0;

  const schedule: ScheduleRow[] = [];
  let openingLiability = initialLiability;
  let openingROU = initialROU;
  let securityDepositOpening = lease.security_deposit || 0;
  let totalInterest = 0;
  let totalDepreciation = 0;

  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    const prevDate = i === 0 ? commencementDate : payments[i - 1].date;
    const daysInPeriod = differenceInDays(payment.date, prevDate);

    // Interest = Opening Liability × r × (days/365)
    const interest = openingLiability * rate * (daysInPeriod / 365);
    const closingLiability = openingLiability + interest - payment.amount;

    // Depreciation
    const depreciation = dailyDepreciation * daysInPeriod;
    const closingROU = openingROU - depreciation;

    // Security deposit interest
    const depositInterest = securityDepositOpening * rate * (daysInPeriod / 365);
    const securityDepositClosing = securityDepositOpening + depositInterest;

    // Current vs Non-current split
    let currentLiability = 0;
    if (i + 1 < payments.length) {
      // Sum of principal portions due within 12 months
      const oneYearLater = addYears(payment.date, 1);
      for (let j = i + 1; j < payments.length && payments[j].date <= oneYearLater; j++) {
        const futureInterest = closingLiability * rate * (differenceInDays(payments[j].date, payment.date) / 365);
        currentLiability += payments[j].amount - futureInterest;
      }
      currentLiability = Math.min(currentLiability, Math.max(closingLiability, 0));
    } else {
      currentLiability = Math.max(closingLiability, 0);
    }
    const nonCurrentLiability = Math.max(closingLiability - currentLiability, 0);

    totalInterest += interest;
    totalDepreciation += depreciation;

    schedule.push({
      period: i + 1,
      period_date: format(payment.date, 'yyyy-MM-dd'),
      days_in_period: daysInPeriod,
      lease_payment: Math.round(payment.amount * 100) / 100,
      opening_liability: Math.round(openingLiability * 100) / 100,
      interest_expense: Math.round(interest * 100) / 100,
      closing_liability: Math.round(closingLiability * 100) / 100,
      opening_rou: Math.round(openingROU * 100) / 100,
      depreciation: Math.round(depreciation * 100) / 100,
      closing_rou: Math.round(closingROU * 100) / 100,
      current_liability: Math.round(currentLiability * 100) / 100,
      non_current_liability: Math.round(nonCurrentLiability * 100) / 100,
      security_deposit_opening: Math.round(securityDepositOpening * 100) / 100,
      interest_deposit: Math.round(depositInterest * 100) / 100,
      security_deposit_closing: Math.round(securityDepositClosing * 100) / 100,
    });

    openingLiability = closingLiability;
    openingROU = closingROU;
    securityDepositOpening = securityDepositClosing;
  }

  return {
    lease_id: lease.lease_id,
    lease_version: lease.lease_version,
    initial_liability: Math.round(initialLiability * 100) / 100,
    initial_rou: Math.round(initialROU * 100) / 100,
    total_interest: Math.round(totalInterest * 100) / 100,
    total_depreciation: Math.round(totalDepreciation * 100) / 100,
    schedule,
  };
}

export function generateJournalEntries(lease: Lease, computation: LeaseComputation): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const commDate = lease.rent_commencement_date;

  // Initial Recognition
  entries.push({
    date: commDate,
    description: 'Initial Recognition - ROU Asset',
    debit_account: 'ROU Asset',
    credit_account: 'Lease Liability',
    amount: computation.initial_liability,
  });

  if (lease.initial_direct_cost > 0) {
    entries.push({
      date: commDate,
      description: 'Initial Direct Cost',
      debit_account: 'ROU Asset',
      credit_account: 'Bank/Cash',
      amount: lease.initial_direct_cost,
    });
  }

  // Period entries
  for (const row of computation.schedule) {
    entries.push({
      date: row.period_date,
      description: `Period ${row.period} - Interest Accrual`,
      debit_account: 'Interest Expense',
      credit_account: 'Lease Liability',
      amount: row.interest_expense,
    });

    entries.push({
      date: row.period_date,
      description: `Period ${row.period} - Lease Payment`,
      debit_account: 'Lease Liability',
      credit_account: 'Bank/Cash',
      amount: row.lease_payment,
    });

    entries.push({
      date: row.period_date,
      description: `Period ${row.period} - Depreciation`,
      debit_account: 'Depreciation Expense',
      credit_account: 'Accumulated Depreciation - ROU',
      amount: row.depreciation,
    });
  }

  return entries;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

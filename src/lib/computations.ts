import { Lease, ScheduleRow, LeaseComputation, JournalEntry, LeaseModification } from './types';
import { differenceInDays, addMonths, addQuarters, addYears, format, parseISO, isBefore, isAfter } from 'date-fns';

function getPaymentDates(startDate: string, endDate: string, frequency: string): Date[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const dates: Date[] = [];
  let current = start;

  while (current <= end) {
    dates.push(current);
    switch (frequency) {
      case 'Monthly': current = addMonths(current, 1); break;
      case 'Quarterly': current = addQuarters(current, 1); break;
      case 'Annual': current = addYears(current, 1); break;
    }
  }
  return dates;
}

function getPaymentAmount(baseAmount: number, frequency: string, escalations: { escalation_start_date: string; escalation_percentage: number }[], date: Date): number {
  let amount = baseAmount;
  if (frequency === 'Quarterly') amount *= 3;
  if (frequency === 'Annual') amount *= 12;

  for (const esc of escalations || []) {
    const escDate = parseISO(esc.escalation_start_date);
    if (date >= escDate) {
      amount *= (1 + esc.escalation_percentage / 100);
    }
  }
  return amount;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Build a schedule segment from a given start state.
 */
function buildScheduleSegment(
  payments: { date: Date; amount: number }[],
  startDate: Date,
  endDate: Date,
  rate: number,
  openingLiability: number,
  openingROU: number,
  securityDeposit: number,
  startPeriod: number,
): { schedule: ScheduleRow[]; totalInterest: number; totalDepreciation: number; finalLiability: number; finalROU: number } {
  const totalDays = differenceInDays(endDate, startDate);
  const dailyDep = totalDays > 0 ? openingROU / totalDays : 0;

  const schedule: ScheduleRow[] = [];
  let liab = openingLiability;
  let rou = openingROU;
  let secDep = securityDeposit;
  let totalInterest = 0;
  let totalDepreciation = 0;

  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    const prevDate = i === 0 ? startDate : payments[i - 1].date;
    const daysInPeriod = differenceInDays(payment.date, prevDate);

    const interest = liab * rate * (daysInPeriod / 365);
    const closingLiab = liab + interest - payment.amount;
    const dep = dailyDep * daysInPeriod;
    const closingROU = rou - dep;
    const depInterest = secDep * rate * (daysInPeriod / 365);
    const secDepClosing = secDep + depInterest;

    let currentLiability = 0;
    if (i + 1 < payments.length) {
      const oneYearLater = addYears(payment.date, 1);
      for (let j = i + 1; j < payments.length && payments[j].date <= oneYearLater; j++) {
        const futInt = closingLiab * rate * (differenceInDays(payments[j].date, payment.date) / 365);
        currentLiability += payments[j].amount - futInt;
      }
      currentLiability = Math.min(currentLiability, Math.max(closingLiab, 0));
    } else {
      currentLiability = Math.max(closingLiab, 0);
    }
    const nonCurrentLiability = Math.max(closingLiab - currentLiability, 0);

    totalInterest += interest;
    totalDepreciation += dep;

    schedule.push({
      period: startPeriod + i,
      period_date: format(payment.date, 'yyyy-MM-dd'),
      days_in_period: daysInPeriod,
      lease_payment: round2(payment.amount),
      opening_liability: round2(liab),
      interest_expense: round2(interest),
      closing_liability: round2(closingLiab),
      opening_rou: round2(rou),
      depreciation: round2(dep),
      closing_rou: round2(closingROU),
      current_liability: round2(currentLiability),
      non_current_liability: round2(nonCurrentLiability),
      security_deposit_opening: round2(secDep),
      interest_deposit: round2(depInterest),
      security_deposit_closing: round2(secDepClosing),
    });

    liab = closingLiab;
    rou = closingROU;
    secDep = secDepClosing;
  }

  return { schedule, totalInterest, totalDepreciation, finalLiability: liab, finalROU: rou };
}

/**
 * Get the carrying values of liability and ROU at a specific date
 * by running the schedule up to that date.
 */
function getCarryingValuesAtDate(schedule: ScheduleRow[], targetDate: string, openingLiab: number, openingROU: number): { liability: number; rou: number } {
  const target = parseISO(targetDate);
  let liability = openingLiab;
  let rou = openingROU;

  for (const row of schedule) {
    const rowDate = parseISO(row.period_date);
    if (isAfter(rowDate, target)) break;
    liability = row.closing_liability;
    rou = row.closing_rou;
  }

  return { liability, rou };
}

export function computeLease(lease: Lease): LeaseComputation {
  const modifications = (lease.modifications || []).sort(
    (a, b) => parseISO(a.effective_date).getTime() - parseISO(b.effective_date).getTime()
  );

  // If terminated, compute up to termination
  const termination = modifications.find(m => m.modification_type === 'EARLY_TERMINATION');

  const commencementDate = parseISO(lease.rent_commencement_date);
  const originalEndDate = parseISO(lease.lease_end_date);
  const rate = lease.discount_rate_ibr / 100;

  // Step 1: Calculate initial PV
  const allPaymentDates = getPaymentDates(lease.rent_commencement_date, lease.lease_end_date, lease.payment_frequency);
  let initialLiability = 0;
  const initialPayments: { date: Date; amount: number }[] = [];

  for (const pDate of allPaymentDates) {
    const daysDiff = differenceInDays(pDate, commencementDate);
    const amount = getPaymentAmount(lease.monthly_lease_amount, lease.payment_frequency, lease.escalations, pDate);
    const pv = amount / Math.pow(1 + rate, daysDiff / 365);
    initialLiability += pv;
    initialPayments.push({ date: pDate, amount });
  }

  const initialROU = initialLiability + (lease.initial_direct_cost || 0);

  // If no modifications, compute normally
  if (modifications.length === 0) {
    const result = buildScheduleSegment(
      initialPayments, commencementDate, originalEndDate, rate,
      initialLiability, initialROU, lease.security_deposit || 0, 1
    );
    return {
      lease_id: lease.lease_id,
      lease_version: lease.lease_version,
      initial_liability: round2(initialLiability),
      initial_rou: round2(initialROU),
      total_interest: round2(result.totalInterest),
      total_depreciation: round2(result.totalDepreciation),
      schedule: result.schedule,
    };
  }

  // With modifications: build schedule in segments
  const fullSchedule: ScheduleRow[] = [];
  let currentLiab = initialLiability;
  let currentROU = initialROU;
  let currentStartDate = commencementDate;
  let currentEndDate = originalEndDate;
  let currentRate = rate;
  let currentMonthlyAmt = lease.monthly_lease_amount;
  let currentEscalations = lease.escalations || [];
  let periodCounter = 1;
  let totalInterest = 0;
  let totalDepreciation = 0;

  for (let mi = 0; mi < modifications.length; mi++) {
    const mod = modifications[mi];
    const modDate = parseISO(mod.effective_date);

    // Build schedule segment from currentStartDate to modDate (pre-modification)
    const preModPayments = getPaymentDates(
      format(currentStartDate, 'yyyy-MM-dd'),
      format(currentEndDate, 'yyyy-MM-dd'),
      lease.payment_frequency
    )
      .filter(d => isAfter(d, currentStartDate) || d.getTime() === currentStartDate.getTime())
      .filter(d => isBefore(d, modDate) || d.getTime() === modDate.getTime())
      .map(d => ({
        date: d,
        amount: getPaymentAmount(currentMonthlyAmt, lease.payment_frequency, currentEscalations, d),
      }));

    if (preModPayments.length > 0) {
      const preResult = buildScheduleSegment(
        preModPayments, currentStartDate, currentEndDate, currentRate,
        currentLiab, currentROU, lease.security_deposit || 0, periodCounter
      );
      fullSchedule.push(...preResult.schedule);
      totalInterest += preResult.totalInterest;
      totalDepreciation += preResult.totalDepreciation;
      periodCounter += preResult.schedule.length;
      currentLiab = preResult.finalLiability;
      currentROU = preResult.finalROU;
    }

    // Apply modification
    if (mod.modification_type === 'EARLY_TERMINATION') {
      // Termination: Gain/Loss = Carrying Liability − Carrying ROU − Penalty
      const gainLoss = currentLiab - currentROU - (mod.termination_penalty || 0);

      // Mark last row
      if (fullSchedule.length > 0) {
        const lastRow = fullSchedule[fullSchedule.length - 1];
        lastRow.is_modification_point = true;
        lastRow.modification_label = `TERMINATION: Gain/Loss = ${formatCurrency(gainLoss)}`;
      }

      // Update modification record
      mod.carrying_liability_at_mod = round2(currentLiab);
      mod.carrying_rou_at_mod = round2(currentROU);
      mod.new_liability = 0;
      mod.liability_adjustment = round2(-currentLiab);
      mod.rou_adjustment = round2(-currentROU);
      mod.gain_loss = round2(gainLoss);

      // No more schedule after termination
      break;
    }

    // Non-termination modification: recalculate
    const newRate = (mod.new_discount_rate || lease.discount_rate_ibr) / 100;
    const newEndDate = parseISO(mod.new_lease_end_date || format(currentEndDate, 'yyyy-MM-dd'));
    const newMonthlyAmt = mod.new_monthly_amount || currentMonthlyAmt;

    // Future payments from modification date under new terms
    const futurePaymentDates = getPaymentDates(
      mod.effective_date,
      format(newEndDate, 'yyyy-MM-dd'),
      lease.payment_frequency
    ).filter(d => isAfter(d, modDate));

    let newLiability = 0;
    const futurePayments: { date: Date; amount: number }[] = [];
    for (const pDate of futurePaymentDates) {
      const daysDiff = differenceInDays(pDate, modDate);
      const amount = getPaymentAmount(newMonthlyAmt, lease.payment_frequency, currentEscalations, pDate);
      const pv = amount / Math.pow(1 + newRate, daysDiff / 365);
      newLiability += pv;
      futurePayments.push({ date: pDate, amount });
    }

    const liabilityAdj = newLiability - currentLiab;
    let rouAdj = liabilityAdj;
    let gainLoss = 0;

    if (mod.modification_type === 'SCOPE_DECREASE' && mod.scope_decrease_percentage > 0) {
      // Proportional derecognition
      const pct = mod.scope_decrease_percentage / 100;
      const derecognizedLiab = currentLiab * pct;
      const derecognizedROU = currentROU * pct;
      gainLoss = derecognizedLiab - derecognizedROU;

      currentLiab -= derecognizedLiab;
      currentROU -= derecognizedROU;

      // Then adjust remaining for new terms
      const remainingLiabAdj = newLiability - currentLiab;
      rouAdj = remainingLiabAdj;
      currentROU += remainingLiabAdj;
      currentLiab = newLiability;
    } else {
      currentROU += rouAdj;
      currentLiab = newLiability;
    }

    // Update modification record
    mod.carrying_liability_at_mod = round2(currentLiab - liabilityAdj + (mod.modification_type === 'SCOPE_DECREASE' ? currentLiab : 0));
    mod.carrying_rou_at_mod = round2(currentROU - rouAdj);
    mod.new_liability = round2(newLiability);
    mod.liability_adjustment = round2(liabilityAdj);
    mod.rou_adjustment = round2(rouAdj);
    mod.gain_loss = round2(gainLoss);

    // Mark in schedule
    if (fullSchedule.length > 0) {
      const lastRow = fullSchedule[fullSchedule.length - 1];
      lastRow.is_modification_point = true;
      lastRow.modification_label = `MODIFICATION v${mi + 2}: Liab Adj = ${formatCurrency(liabilityAdj)}`;
    }

    // Update for next segment
    currentStartDate = modDate;
    currentEndDate = newEndDate;
    currentRate = newRate;
    currentMonthlyAmt = newMonthlyAmt;

    // Build remaining schedule if this is the last modification
    if (mi === modifications.length - 1 && futurePayments.length > 0) {
      const postResult = buildScheduleSegment(
        futurePayments, modDate, newEndDate, newRate,
        currentLiab, currentROU, lease.security_deposit || 0, periodCounter
      );
      fullSchedule.push(...postResult.schedule);
      totalInterest += postResult.totalInterest;
      totalDepreciation += postResult.totalDepreciation;
    }
  }

  return {
    lease_id: lease.lease_id,
    lease_version: lease.lease_version,
    initial_liability: round2(initialLiability),
    initial_rou: round2(initialROU),
    total_interest: round2(totalInterest),
    total_depreciation: round2(totalDepreciation),
    schedule: fullSchedule,
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

  // Modification journal entries
  for (const mod of lease.modifications || []) {
    if (mod.modification_type === 'EARLY_TERMINATION') {
      entries.push({
        date: mod.effective_date,
        description: 'Termination - Derecognize Lease Liability',
        debit_account: 'Lease Liability',
        credit_account: '',
        amount: mod.carrying_liability_at_mod,
      });
      entries.push({
        date: mod.effective_date,
        description: 'Termination - Derecognize ROU Asset',
        debit_account: '',
        credit_account: 'ROU Asset',
        amount: mod.carrying_rou_at_mod,
      });
      if (mod.gain_loss !== 0) {
        entries.push({
          date: mod.effective_date,
          description: `Termination - ${mod.gain_loss > 0 ? 'Gain' : 'Loss'} on Termination`,
          debit_account: mod.gain_loss < 0 ? 'Loss on Lease Termination' : '',
          credit_account: mod.gain_loss > 0 ? 'Gain on Lease Termination' : '',
          amount: Math.abs(mod.gain_loss),
        });
      }
      if (mod.termination_penalty > 0) {
        entries.push({
          date: mod.effective_date,
          description: 'Termination - Penalty Payment',
          debit_account: 'Termination Penalty Expense',
          credit_account: 'Bank/Cash',
          amount: mod.termination_penalty,
        });
      }
    } else {
      // Modification adjustment
      if (mod.liability_adjustment !== 0) {
        entries.push({
          date: mod.effective_date,
          description: `Modification - ${mod.description || 'Lease Adjustment'}`,
          debit_account: mod.liability_adjustment > 0 ? 'ROU Asset' : 'Lease Liability',
          credit_account: mod.liability_adjustment > 0 ? 'Lease Liability' : 'ROU Asset',
          amount: Math.abs(mod.liability_adjustment),
        });
      }
      if (mod.gain_loss !== 0) {
        entries.push({
          date: mod.effective_date,
          description: `Modification - ${mod.gain_loss > 0 ? 'Gain' : 'Loss'} on Scope Decrease`,
          debit_account: mod.gain_loss < 0 ? 'Loss on Lease Modification' : 'Lease Liability',
          credit_account: mod.gain_loss > 0 ? 'Gain on Lease Modification' : 'ROU Asset',
          amount: Math.abs(mod.gain_loss),
        });
      }
    }
  }

  return entries;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

import { Lease, ScheduleRow, LeaseComputation, JournalEntry, LeaseModification, DisclosureData } from './types';
import { differenceInDays, addMonths, addQuarters, addYears, format, parseISO, isBefore, isAfter } from 'date-fns';

/**
 * Get the periodic discount rate based on payment frequency.
 * Annual IBR is divided by the number of periods per year.
 * Monthly: rate/12, Quarterly: rate/4, Half-Yearly: rate/2, Annual: rate/1
 */
function getPeriodicRate(annualRate: number, frequency: string): number {
  switch (frequency) {
    case 'Monthly': return annualRate / 12;
    case 'Quarterly': return annualRate / 4;
    case 'Half-Yearly': return annualRate / 2;
    case 'Annual': return annualRate;
    default: return annualRate / 12;
  }
}

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
      case 'Half-Yearly': current = addMonths(current, 6); break;
      case 'Annual': current = addYears(current, 1); break;
    }
  }
  return dates;
}

/**
 * Get the number of days in the month of a given date.
 */
function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Calculate the pro-rata factor for a partial period.
 * If the lease starts mid-month, the first payment is proportionate.
 * If the lease ends mid-month, the last payment is proportionate.
 */
function getProRataFactor(
  paymentDate: Date,
  isFirst: boolean,
  isLast: boolean,
  leaseStartDate: Date,
  leaseEndDate: Date,
): number {
  const daysInMonth = getDaysInMonth(paymentDate);

  if (isFirst && leaseStartDate.getDate() > 1) {
    // Lease starts mid-month: remaining days / total days in month
    const remainingDays = daysInMonth - leaseStartDate.getDate() + 1;
    return remainingDays / daysInMonth;
  }

  if (isLast) {
    // Lease ends mid-month: days used / total days in month
    const dayOfMonth = leaseEndDate.getDate();
    if (dayOfMonth < daysInMonth) {
      return dayOfMonth / daysInMonth;
    }
  }

  return 1;
}

function getPaymentAmount(baseAmount: number, frequency: string, escalations: { escalation_start_date: string; escalation_percentage: number }[], date: Date): number {
  let amount = baseAmount;
  if (frequency === 'Quarterly') amount *= 3;
  if (frequency === 'Half-Yearly') amount *= 6;
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
  paymentTiming: string = 'Arrears',
): { schedule: ScheduleRow[]; totalInterest: number; totalDepreciation: number; finalLiability: number; finalROU: number } {
  const totalDays = differenceInDays(endDate, startDate);
  const dailyDep = totalDays > 0 ? openingROU / totalDays : 0;
  const isAdvance = paymentTiming === 'Advance';

  const schedule: ScheduleRow[] = [];
  let liab = openingLiability;
  let rou = openingROU;
  let secDep = securityDeposit;
  let totalInterest = 0;
  let totalDepreciation = 0;

  // For Arrears: insert an opening balance row at the start date (period 0)
  if (!isAdvance && startPeriod === 1) {
    schedule.push({
      period: 0,
      period_date: format(startDate, 'yyyy-MM-dd'),
      days_in_period: 0,
      lease_payment: 0,
      opening_liability: round2(openingLiability),
      interest_expense: 0,
      closing_liability: round2(openingLiability),
      opening_rou: round2(openingROU),
      depreciation: 0,
      closing_rou: round2(openingROU),
      current_liability: 0,
      non_current_liability: round2(openingLiability),
      security_deposit_opening: round2(securityDeposit),
      interest_deposit: 0,
      security_deposit_closing: round2(securityDeposit),
    });
  }

  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    const prevDate = i === 0 ? startDate : payments[i - 1].date;
    const daysInPeriod = differenceInDays(payment.date, prevDate);

    let interest: number;
    let closingLiab: number;

    if (isAdvance) {
      // Advance: payment first, then interest accrues on reduced balance
      const liabAfterPayment = liab - payment.amount;
      interest = round2(liabAfterPayment * rate);
      closingLiab = liabAfterPayment + interest;
    } else {
      // Arrears: interest accrues first, then payment
      interest = round2(liab * rate);
      closingLiab = liab + interest - payment.amount;
    }

    const dep = dailyDep * daysInPeriod;
    const closingROU = rou - dep;
    // Security deposit interest also uses periodic rate
    const depInterest = round2(secDep * rate);
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
  const annualRate = lease.discount_rate_ibr / 100;
  const periodicRate = getPeriodicRate(annualRate, lease.payment_frequency);
  const paymentTiming = lease.payment_timing || 'Arrears';
  const isAdvance = paymentTiming === 'Advance';
  // Step 1: Calculate initial PV using periodic discounting
  const allPaymentDates = getPaymentDates(lease.rent_commencement_date, lease.lease_end_date, lease.payment_frequency);
  let initialLiability = 0;
  const initialPayments: { date: Date; amount: number }[] = [];
  const leaseStart = parseISO(lease.lease_start_date);

  for (let i = 0; i < allPaymentDates.length; i++) {
    const pDate = allPaymentDates[i];
    let amount = getPaymentAmount(lease.monthly_lease_amount, lease.payment_frequency, lease.escalations, pDate);
    // Apply pro-rata for partial first/last period
    const proRata = getProRataFactor(
      pDate,
      i === 0,
      i === allPaymentDates.length - 1,
      leaseStart,
      originalEndDate,
    );
    amount = amount * proRata;
    // For Advance: first payment at period 0 (not discounted), rest at 1, 2, ...
    // For Arrears: payments at period 1, 2, 3, ...
    const periodNumber = isAdvance ? i : i + 1;
    const pv = amount / Math.pow(1 + periodicRate, periodNumber);
    initialLiability += pv;
    initialPayments.push({ date: pDate, amount });
  }

  const initialROU = initialLiability + (lease.initial_direct_cost || 0);

  // If no modifications, compute normally
  if (modifications.length === 0) {
    const result = buildScheduleSegment(
      initialPayments, commencementDate, originalEndDate, periodicRate,
      initialLiability, initialROU, lease.security_deposit || 0, 1, paymentTiming
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
  let currentRate = periodicRate;
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
        currentLiab, currentROU, lease.security_deposit || 0, periodCounter, paymentTiming
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
    const newPeriodicRate = getPeriodicRate((mod.new_discount_rate || lease.discount_rate_ibr) / 100, lease.payment_frequency);
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
    for (let pi = 0; pi < futurePaymentDates.length; pi++) {
      const pDate = futurePaymentDates[pi];
      const amount = getPaymentAmount(newMonthlyAmt, lease.payment_frequency, currentEscalations, pDate);
      const periodNumber = isAdvance ? pi : pi + 1;
      const pv = amount / Math.pow(1 + newPeriodicRate, periodNumber);
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
    currentRate = newPeriodicRate;
    currentMonthlyAmt = newMonthlyAmt;

    // Build remaining schedule if this is the last modification
    if (mi === modifications.length - 1 && futurePayments.length > 0) {
      const postResult = buildScheduleSegment(
        futurePayments, modDate, newEndDate, newPeriodicRate,
        currentLiab, currentROU, lease.security_deposit || 0, periodCounter, paymentTiming
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
    cash_flow_classification: 'Non-cash',
  });

  if (lease.initial_direct_cost > 0) {
    entries.push({
      date: commDate,
      description: 'Initial Direct Cost',
      debit_account: 'ROU Asset',
      credit_account: 'Bank/Cash',
      amount: lease.initial_direct_cost,
      cash_flow_classification: 'Financing',
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
      cash_flow_classification: 'Non-cash',
    });

    // Per Ind AS 7: Interest paid is classified as Financing activity
    // The payment itself reduces liability (principal) + covers interest
    const principalPortion = row.lease_payment - row.interest_expense;
    
    entries.push({
      date: row.period_date,
      description: `Period ${row.period} - Lease Payment (Principal)`,
      debit_account: 'Lease Liability',
      credit_account: 'Bank/Cash',
      amount: round2(Math.max(principalPortion, 0)),
      cash_flow_classification: 'Financing',
    });

    entries.push({
      date: row.period_date,
      description: `Period ${row.period} - Lease Payment (Interest)`,
      debit_account: 'Interest Expense',
      credit_account: 'Bank/Cash',
      amount: round2(Math.min(row.interest_expense, row.lease_payment)),
      cash_flow_classification: 'Financing',
    });

    entries.push({
      date: row.period_date,
      description: `Period ${row.period} - Depreciation`,
      debit_account: 'Depreciation Expense',
      credit_account: 'Accumulated Depreciation - ROU',
      amount: row.depreciation,
      cash_flow_classification: 'Non-cash',
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
        cash_flow_classification: 'Non-cash',
      });
      entries.push({
        date: mod.effective_date,
        description: 'Termination - Derecognize ROU Asset',
        debit_account: '',
        credit_account: 'ROU Asset',
        amount: mod.carrying_rou_at_mod,
        cash_flow_classification: 'Non-cash',
      });
      if (mod.gain_loss !== 0) {
        entries.push({
          date: mod.effective_date,
          description: `Termination - ${mod.gain_loss > 0 ? 'Gain' : 'Loss'} on Termination`,
          debit_account: mod.gain_loss < 0 ? 'Loss on Lease Termination' : '',
          credit_account: mod.gain_loss > 0 ? 'Gain on Lease Termination' : '',
          amount: Math.abs(mod.gain_loss),
          cash_flow_classification: 'Non-cash',
        });
      }
      if (mod.termination_penalty > 0) {
        entries.push({
          date: mod.effective_date,
          description: 'Termination - Penalty Payment',
          debit_account: 'Termination Penalty Expense',
          credit_account: 'Bank/Cash',
          amount: mod.termination_penalty,
          cash_flow_classification: 'Financing',
        });
      }
    } else {
      if (mod.liability_adjustment !== 0) {
        entries.push({
          date: mod.effective_date,
          description: `Modification - ${mod.description || 'Lease Adjustment'}`,
          debit_account: mod.liability_adjustment > 0 ? 'ROU Asset' : 'Lease Liability',
          credit_account: mod.liability_adjustment > 0 ? 'Lease Liability' : 'ROU Asset',
          amount: Math.abs(mod.liability_adjustment),
          cash_flow_classification: 'Non-cash',
        });
      }
      if (mod.gain_loss !== 0) {
        entries.push({
          date: mod.effective_date,
          description: `Modification - ${mod.gain_loss > 0 ? 'Gain' : 'Loss'} on Scope Decrease`,
          debit_account: mod.gain_loss < 0 ? 'Loss on Lease Modification' : 'Lease Liability',
          credit_account: mod.gain_loss > 0 ? 'Gain on Lease Modification' : 'ROU Asset',
          amount: Math.abs(mod.gain_loss),
          cash_flow_classification: 'Non-cash',
        });
      }
    }
  }

  return entries;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Compute Ind AS 116 disclosure data across all leases for a reporting date.
 * Maturity analysis per para 58, ROU/Liability movement per para 53,
 * Expense summary per para 53(a)-(d), Cash flow per Ind AS 7.
 */
export function computeDisclosures(leases: Lease[], reportingDate: string): DisclosureData {
  const repDate = parseISO(reportingDate);

  let within1 = 0, between1and5 = 0, beyond5 = 0;
  let totalUndiscounted = 0, totalLiability = 0;
  let rouAdditions = 0, rouDepreciation = 0, rouModifications = 0, rouDisposals = 0;
  let liabAdditions = 0, liabInterest = 0, liabPayments = 0, liabModifications = 0, liabDisposals = 0;
  let totalDepExpense = 0, totalIntExpense = 0;
  let totalCashOutflow = 0;
  let principalFinancing = 0, interestFinancing = 0;
  let shortTermExpense = 0, lowValueExpense = 0;

  for (const lease of leases) {
    // Short-term and low-value: recognised as expense, not on balance sheet
    if (lease.short_term_flag || lease.low_value_flag) {
      const comp = computeLease(lease);
      const totalPayments = comp.schedule.reduce((s, r) => s + r.lease_payment, 0);
      if (lease.short_term_flag) shortTermExpense += totalPayments;
      if (lease.low_value_flag) lowValueExpense += totalPayments;
      totalCashOutflow += totalPayments;
      continue;
    }

    try {
      const comp = computeLease(lease);
      const journals = generateJournalEntries(lease, comp);

      // ROU & Liability additions (initial recognition)
      rouAdditions += comp.initial_rou;
      liabAdditions += comp.initial_liability;

      // Accumulate from schedule
      for (const row of comp.schedule) {
        const rowDate = parseISO(row.period_date);

        rouDepreciation += row.depreciation;
        liabInterest += row.interest_expense;
        liabPayments += row.lease_payment;
        totalDepExpense += row.depreciation;
        totalIntExpense += row.interest_expense;
        totalCashOutflow += row.lease_payment;

        const principal = row.lease_payment - row.interest_expense;
        principalFinancing += Math.max(principal, 0);
        interestFinancing += Math.min(row.interest_expense, row.lease_payment);

        // Maturity analysis: future undiscounted payments from reporting date
        if (rowDate > repDate) {
          const yearsFromRep = differenceInDays(rowDate, repDate) / 365;
          if (yearsFromRep <= 1) within1 += row.lease_payment;
          else if (yearsFromRep <= 5) between1and5 += row.lease_payment;
          else beyond5 += row.lease_payment;
          totalUndiscounted += row.lease_payment;
        }
      }

      // Get closing liability at reporting date for total liability
      const lastRowBeforeRep = [...comp.schedule]
        .filter(r => parseISO(r.period_date) <= repDate)
        .pop();
      if (lastRowBeforeRep) {
        totalLiability += Math.max(lastRowBeforeRep.closing_liability, 0);
      }

      // Modification adjustments
      for (const mod of lease.modifications || []) {
        if (mod.modification_type === 'EARLY_TERMINATION') {
          rouDisposals += Math.abs(mod.carrying_rou_at_mod || 0);
          liabDisposals += Math.abs(mod.carrying_liability_at_mod || 0);
        } else {
          rouModifications += mod.rou_adjustment || 0;
          liabModifications += mod.liability_adjustment || 0;
        }
      }
    } catch {
      // skip invalid
    }
  }

  const rouClosing = rouAdditions - rouDepreciation + rouModifications - rouDisposals;
  const liabClosing = liabAdditions + liabInterest - liabPayments + liabModifications - liabDisposals;

  return {
    maturity_analysis: {
      within_1_year: round2(within1),
      between_1_and_5_years: round2(between1and5),
      beyond_5_years: round2(beyond5),
      total_undiscounted: round2(totalUndiscounted),
      total_lease_liability: round2(totalLiability),
      discount_effect: round2(totalUndiscounted - totalLiability),
    },
    rou_movement: {
      opening_balance: 0,
      additions: round2(rouAdditions),
      depreciation: round2(rouDepreciation),
      modifications: round2(rouModifications),
      disposals: round2(rouDisposals),
      closing_balance: round2(rouClosing),
    },
    liability_movement: {
      opening_balance: 0,
      additions: round2(liabAdditions),
      interest_accretion: round2(liabInterest),
      payments: round2(liabPayments),
      modifications: round2(liabModifications),
      disposals: round2(liabDisposals),
      closing_balance: round2(liabClosing),
    },
    expense_summary: {
      depreciation_expense: round2(totalDepExpense),
      interest_expense: round2(totalIntExpense),
      short_term_lease_expense: round2(shortTermExpense),
      low_value_lease_expense: round2(lowValueExpense),
      total_cash_outflow: round2(totalCashOutflow),
    },
    cash_flow: {
      principal_payments_financing: round2(principalFinancing),
      interest_payments_financing: round2(interestFinancing),
      short_term_low_value_operating: round2(shortTermExpense + lowValueExpense),
    },
  };
}

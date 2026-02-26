"""
IFRS 16 / Ind AS 116 Lease Computation Engine
Python port of src/lib/computations.ts
"""

from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Dict, Any, Optional
import math


def parse_date(s: str) -> date:
    return date.fromisoformat(s)


def format_date(d: date) -> str:
    return d.strftime('%Y-%m-%d')


def add_months(d: date, n: int) -> date:
    return d + relativedelta(months=n)


def add_years(d: date, n: int) -> date:
    return d + relativedelta(years=n)


def days_in_month(d: date) -> int:
    next_month_start = (d + relativedelta(months=1)).replace(day=1)
    return (next_month_start - d.replace(day=1)).days


def end_of_month(d: date) -> date:
    return (d + relativedelta(months=1)).replace(day=1) - timedelta(days=1)


def difference_in_days(a: date, b: date) -> int:
    return (a - b).days


def get_periodic_rate(annual_rate: float, frequency: str) -> float:
    mapping = {
        'Monthly': annual_rate / 12,
        'Quarterly': annual_rate / 4,
        'Half-Yearly': annual_rate / 2,
        'Annual': annual_rate,
    }
    return mapping.get(frequency, annual_rate / 12)


def get_payment_dates(start_date: str, end_date: str, frequency: str) -> List[date]:
    start = parse_date(start_date)
    end = parse_date(end_date)
    dates = []
    current = start
    while current <= end:
        dates.append(current)
        if frequency == 'Monthly':
            current = add_months(current, 1)
        elif frequency == 'Quarterly':
            current = add_months(current, 3)
        elif frequency == 'Half-Yearly':
            current = add_months(current, 6)
        elif frequency == 'Annual':
            current = add_years(current, 1)
        else:
            current = add_months(current, 1)
    return dates


def get_pro_rata_factor(
    payment_date: date,
    is_first: bool,
    is_last: bool,
    lease_start: date,
    lease_end: date,
) -> float:
    dim = days_in_month(payment_date)
    if is_first and lease_start.day > 1:
        remaining_days = dim - lease_start.day + 1
        return remaining_days / dim
    if is_last:
        day_of_month = lease_end.day
        if day_of_month < dim:
            return day_of_month / dim
    return 1.0


def get_payment_amount(
    base_amount: float,
    frequency: str,
    escalations: List[Dict],
    payment_date: date,
) -> float:
    amount = base_amount
    if frequency == 'Quarterly':
        amount *= 3
    elif frequency == 'Half-Yearly':
        amount *= 6
    elif frequency == 'Annual':
        amount *= 12

    for esc in (escalations or []):
        esc_date = parse_date(esc['escalation_start_date'])
        if payment_date >= esc_date:
            amount *= (1 + esc['escalation_percentage'] / 100)
    return amount


def round2(v: float) -> float:
    return round(v * 100) / 100


def get_end_of_period_date(payment_date: date, frequency: str) -> date:
    if frequency == 'Monthly':
        return end_of_month(payment_date)
    elif frequency == 'Quarterly':
        return add_months(payment_date, 3) - timedelta(days=1)
    elif frequency == 'Half-Yearly':
        return add_months(payment_date, 6) - timedelta(days=1)
    elif frequency == 'Annual':
        return add_years(payment_date, 1) - timedelta(days=1)
    else:
        return end_of_month(payment_date)


def build_schedule_segment(
    payments: List[Dict],
    start_date: date,
    end_date: date,
    rate: float,
    opening_liability: float,
    opening_rou: float,
    security_deposit: float,
    start_period: int,
    payment_timing: str = 'Arrears',
    frequency: str = 'Monthly',
) -> Dict:
    total_periods = len(payments)
    periodic_dep = opening_rou / total_periods if total_periods > 0 else 0
    is_advance = payment_timing == 'Advance'

    schedule = []
    liab = opening_liability
    rou = opening_rou
    sec_dep = security_deposit
    total_interest = 0.0
    total_depreciation = 0.0

    # For Arrears: insert opening balance row
    if not is_advance and start_period == 1:
        schedule.append({
            'period': 0,
            'period_date': format_date(start_date),
            'days_in_period': 0,
            'lease_payment': 0,
            'pv_lease_payment': 0,
            'opening_liability': round2(opening_liability),
            'interest_expense': 0,
            'closing_liability': round2(opening_liability),
            'opening_rou': 0,
            'depreciation': 0,
            'closing_rou': 0,
            'current_liability': 0,
            'non_current_liability': 0,
            'security_deposit_opening': round2(security_deposit),
            'interest_deposit': 0,
            'security_deposit_closing': round2(security_deposit),
        })

    for i, payment in enumerate(payments):
        pdate = payment['date']
        amount = payment['amount']
        prev_date = start_date if i == 0 else payments[i - 1]['date']
        days_in_period = difference_in_days(pdate, prev_date)

        if days_in_period == 0 and i == 0 and not is_advance:
            if i + 1 < len(payments):
                days_in_period = difference_in_days(payments[i + 1]['date'], start_date)
            else:
                days_in_period = difference_in_days(end_date, start_date)

        is_last_period = i == len(payments) - 1

        if is_advance:
            liab_after_payment = liab - amount
            interest = round2(liab_after_payment * rate)
            closing_liab = liab_after_payment + interest
        else:
            interest = round2(liab * rate)
            closing_liab = liab + interest - amount

        dep = rou if is_last_period else periodic_dep
        closing_rou = rou - dep
        dep_interest = round2(sec_dep * rate)
        sec_dep_closing = sec_dep + dep_interest

        # Current liability calculation
        current_liability = 0.0
        if i + 1 < len(payments):
            one_year_later = add_years(pdate, 1)
            for j in range(i + 1, len(payments)):
                if payments[j]['date'] <= one_year_later:
                    fut_int = closing_liab * rate * (difference_in_days(payments[j]['date'], pdate) / 365)
                    current_liability += payments[j]['amount'] - fut_int
                else:
                    break
            current_liability = min(current_liability, max(closing_liab, 0))
        else:
            current_liability = max(closing_liab, 0)
        non_current_liability = max(closing_liab - current_liability, 0)

        total_interest += interest
        total_depreciation += dep

        period_number = start_period + i
        pv_exp = (period_number - 1) if is_advance else period_number
        pv_payment = round2(amount / math.pow(1 + rate, pv_exp)) if rate + 1 > 0 else round2(amount)

        if not is_advance:
            period_date_str = format_date(get_end_of_period_date(pdate, frequency))
        else:
            period_date_str = format_date(pdate)

        schedule.append({
            'period': period_number,
            'period_date': period_date_str,
            'days_in_period': days_in_period,
            'lease_payment': round2(amount),
            'pv_lease_payment': pv_payment,
            'opening_liability': round2(liab),
            'interest_expense': round2(interest),
            'closing_liability': round2(closing_liab),
            'opening_rou': round2(rou),
            'depreciation': round2(dep),
            'closing_rou': round2(closing_rou),
            'current_liability': round2(current_liability),
            'non_current_liability': round2(non_current_liability),
            'security_deposit_opening': round2(sec_dep),
            'interest_deposit': round2(dep_interest),
            'security_deposit_closing': round2(sec_dep_closing),
        })

        liab = closing_liab
        rou = closing_rou
        sec_dep = sec_dep_closing

    return {
        'schedule': schedule,
        'total_interest': total_interest,
        'total_depreciation': total_depreciation,
        'final_liability': liab,
        'final_rou': rou,
    }


def compute_lease(lease: Dict) -> Dict:
    modifications = sorted(
        (lease.get('modifications') or []),
        key=lambda m: m['effective_date']
    )

    commencement_date = parse_date(lease['rent_commencement_date'])
    original_end_date = parse_date(lease['lease_end_date'])
    annual_rate = lease['discount_rate_ibr'] / 100
    periodic_rate = get_periodic_rate(annual_rate, lease['payment_frequency'])
    payment_timing = lease.get('payment_timing') or 'Arrears'
    is_advance = payment_timing == 'Advance'

    # Step 1: Calculate initial PV
    all_payment_dates = get_payment_dates(
        lease['rent_commencement_date'],
        lease['lease_end_date'],
        lease['payment_frequency']
    )
    initial_liability = 0.0
    initial_payments = []
    lease_start = parse_date(lease['lease_start_date'])

    for i, pdate in enumerate(all_payment_dates):
        amount = get_payment_amount(
            lease['monthly_lease_amount'],
            lease['payment_frequency'],
            lease.get('escalations') or [],
            pdate
        )
        pro_rata = get_pro_rata_factor(
            pdate,
            i == 0,
            i == len(all_payment_dates) - 1,
            lease_start,
            original_end_date,
        )
        amount = amount * pro_rata
        period_number = i if is_advance else i + 1
        pv = amount / math.pow(1 + periodic_rate, period_number) if periodic_rate + 1 > 0 else amount
        initial_liability += pv
        initial_payments.append({'date': pdate, 'amount': amount})

    initial_rou = initial_liability + (lease.get('initial_direct_cost') or 0)

    if not modifications:
        result = build_schedule_segment(
            initial_payments, commencement_date, original_end_date, periodic_rate,
            initial_liability, initial_rou, lease.get('security_deposit') or 0,
            1, payment_timing, lease['payment_frequency']
        )
        return {
            'lease_id': lease['lease_id'],
            'lease_version': lease.get('lease_version', 1),
            'initial_liability': round2(initial_liability),
            'initial_rou': round2(initial_rou),
            'total_interest': round2(result['total_interest']),
            'total_depreciation': round2(result['total_depreciation']),
            'schedule': result['schedule'],
        }

    # With modifications: build schedule in segments
    full_schedule = []
    current_liab = initial_liability
    current_rou = initial_rou
    current_start_date = commencement_date
    current_end_date = original_end_date
    current_rate = periodic_rate
    current_monthly_amt = lease['monthly_lease_amount']
    current_escalations = lease.get('escalations') or []
    period_counter = 1
    total_interest = 0.0
    total_depreciation = 0.0

    for mi, mod in enumerate(modifications):
        mod_date = parse_date(mod['effective_date'])

        pre_mod_payments = [
            {'date': d, 'amount': get_payment_amount(current_monthly_amt, lease['payment_frequency'], current_escalations, d)}
            for d in get_payment_dates(
                format_date(current_start_date),
                format_date(current_end_date),
                lease['payment_frequency']
            )
            if (d > current_start_date or d == current_start_date) and (d < mod_date or d == mod_date)
        ]

        if pre_mod_payments:
            pre_result = build_schedule_segment(
                pre_mod_payments, current_start_date, current_end_date, current_rate,
                current_liab, current_rou, lease.get('security_deposit') or 0,
                period_counter, payment_timing, lease['payment_frequency']
            )
            full_schedule.extend(pre_result['schedule'])
            total_interest += pre_result['total_interest']
            total_depreciation += pre_result['total_depreciation']
            period_counter += len(pre_result['schedule'])
            current_liab = pre_result['final_liability']
            current_rou = pre_result['final_rou']

        if mod.get('modification_type') == 'EARLY_TERMINATION':
            gain_loss = current_liab - current_rou - (mod.get('termination_penalty') or 0)
            if full_schedule:
                last_row = full_schedule[-1]
                last_row['is_modification_point'] = True
                last_row['modification_label'] = f"TERMINATION: Gain/Loss = {format_currency(gain_loss)}"

            mod['carrying_liability_at_mod'] = round2(current_liab)
            mod['carrying_rou_at_mod'] = round2(current_rou)
            mod['new_liability'] = 0
            mod['liability_adjustment'] = round2(-current_liab)
            mod['rou_adjustment'] = round2(-current_rou)
            mod['gain_loss'] = round2(gain_loss)
            break

        new_periodic_rate = get_periodic_rate(
            ((mod.get('new_discount_rate') or lease['discount_rate_ibr']) / 100),
            lease['payment_frequency']
        )
        new_end_date = parse_date(mod.get('new_lease_end_date') or format_date(current_end_date))
        new_monthly_amt = mod.get('new_monthly_amount') or current_monthly_amt

        future_payment_dates = [
            d for d in get_payment_dates(
                mod['effective_date'],
                format_date(new_end_date),
                lease['payment_frequency']
            )
            if d > mod_date
        ]

        new_liability = 0.0
        future_payments = []
        for pi, pdate in enumerate(future_payment_dates):
            amount = get_payment_amount(new_monthly_amt, lease['payment_frequency'], current_escalations, pdate)
            period_number = pi if is_advance else pi + 1
            pv = amount / math.pow(1 + new_periodic_rate, period_number) if new_periodic_rate + 1 > 0 else amount
            new_liability += pv
            future_payments.append({'date': pdate, 'amount': amount})

        liability_adj = new_liability - current_liab
        rou_adj = liability_adj
        gain_loss = 0.0

        if mod.get('modification_type') == 'SCOPE_DECREASE' and (mod.get('scope_decrease_percentage') or 0) > 0:
            pct = mod['scope_decrease_percentage'] / 100
            derecognized_liab = current_liab * pct
            derecognized_rou = current_rou * pct
            gain_loss = derecognized_liab - derecognized_rou

            current_liab -= derecognized_liab
            current_rou -= derecognized_rou

            remaining_liab_adj = new_liability - current_liab
            rou_adj = remaining_liab_adj
            current_rou += remaining_liab_adj
            current_liab = new_liability
        else:
            current_rou += rou_adj
            current_liab = new_liability

        mod['carrying_liability_at_mod'] = round2(current_liab - liability_adj + (current_liab if mod.get('modification_type') == 'SCOPE_DECREASE' else 0))
        mod['carrying_rou_at_mod'] = round2(current_rou - rou_adj)
        mod['new_liability'] = round2(new_liability)
        mod['liability_adjustment'] = round2(liability_adj)
        mod['rou_adjustment'] = round2(rou_adj)
        mod['gain_loss'] = round2(gain_loss)

        if full_schedule:
            last_row = full_schedule[-1]
            last_row['is_modification_point'] = True
            last_row['modification_label'] = f"MODIFICATION v{mi + 2}: Liab Adj = {format_currency(liability_adj)}"

        current_start_date = mod_date
        current_end_date = new_end_date
        current_rate = new_periodic_rate
        current_monthly_amt = new_monthly_amt

        if mi == len(modifications) - 1 and future_payments:
            post_result = build_schedule_segment(
                future_payments, mod_date, new_end_date, new_periodic_rate,
                current_liab, current_rou, lease.get('security_deposit') or 0,
                period_counter, payment_timing, lease['payment_frequency']
            )
            full_schedule.extend(post_result['schedule'])
            total_interest += post_result['total_interest']
            total_depreciation += post_result['total_depreciation']

    return {
        'lease_id': lease['lease_id'],
        'lease_version': lease.get('lease_version', 1),
        'initial_liability': round2(initial_liability),
        'initial_rou': round2(initial_rou),
        'total_interest': round2(total_interest),
        'total_depreciation': round2(total_depreciation),
        'schedule': full_schedule,
    }


def generate_journal_entries(lease: Dict, computation: Dict) -> List[Dict]:
    entries = []
    comm_date = lease['rent_commencement_date']

    entries.append({
        'date': comm_date,
        'description': 'Initial Recognition - ROU Asset',
        'debit_account': 'ROU Asset',
        'credit_account': 'Lease Liability',
        'amount': computation['initial_liability'],
        'cash_flow_classification': 'Non-cash',
    })

    if (lease.get('initial_direct_cost') or 0) > 0:
        entries.append({
            'date': comm_date,
            'description': 'Initial Direct Cost',
            'debit_account': 'ROU Asset',
            'credit_account': 'Bank/Cash',
            'amount': lease['initial_direct_cost'],
            'cash_flow_classification': 'Financing',
        })

    for row in computation['schedule']:
        entries.append({
            'date': row['period_date'],
            'description': f"Period {row['period']} - Interest Accrual",
            'debit_account': 'Interest Expense',
            'credit_account': 'Lease Liability',
            'amount': row['interest_expense'],
            'cash_flow_classification': 'Non-cash',
        })
        principal_portion = row['lease_payment'] - row['interest_expense']
        entries.append({
            'date': row['period_date'],
            'description': f"Period {row['period']} - Lease Payment (Principal)",
            'debit_account': 'Lease Liability',
            'credit_account': 'Bank/Cash',
            'amount': round2(max(principal_portion, 0)),
            'cash_flow_classification': 'Financing',
        })
        entries.append({
            'date': row['period_date'],
            'description': f"Period {row['period']} - Lease Payment (Interest)",
            'debit_account': 'Interest Expense',
            'credit_account': 'Bank/Cash',
            'amount': round2(min(row['interest_expense'], row['lease_payment'])),
            'cash_flow_classification': 'Financing',
        })
        entries.append({
            'date': row['period_date'],
            'description': f"Period {row['period']} - Depreciation",
            'debit_account': 'Depreciation Expense',
            'credit_account': 'Accumulated Depreciation - ROU',
            'amount': row['depreciation'],
            'cash_flow_classification': 'Non-cash',
        })

    for mod in (lease.get('modifications') or []):
        if mod.get('modification_type') == 'EARLY_TERMINATION':
            entries.append({
                'date': mod['effective_date'],
                'description': 'Termination - Derecognize Lease Liability',
                'debit_account': 'Lease Liability',
                'credit_account': '',
                'amount': mod.get('carrying_liability_at_mod', 0),
                'cash_flow_classification': 'Non-cash',
            })
            entries.append({
                'date': mod['effective_date'],
                'description': 'Termination - Derecognize ROU Asset',
                'debit_account': '',
                'credit_account': 'ROU Asset',
                'amount': mod.get('carrying_rou_at_mod', 0),
                'cash_flow_classification': 'Non-cash',
            })
            if (mod.get('gain_loss') or 0) != 0:
                gl = mod['gain_loss']
                entries.append({
                    'date': mod['effective_date'],
                    'description': f"Termination - {'Gain' if gl > 0 else 'Loss'} on Termination",
                    'debit_account': 'Loss on Lease Termination' if gl < 0 else '',
                    'credit_account': 'Gain on Lease Termination' if gl > 0 else '',
                    'amount': abs(gl),
                    'cash_flow_classification': 'Non-cash',
                })
            if (mod.get('termination_penalty') or 0) > 0:
                entries.append({
                    'date': mod['effective_date'],
                    'description': 'Termination - Penalty Payment',
                    'debit_account': 'Termination Penalty Expense',
                    'credit_account': 'Bank/Cash',
                    'amount': mod['termination_penalty'],
                    'cash_flow_classification': 'Financing',
                })
        else:
            if (mod.get('liability_adjustment') or 0) != 0:
                adj = mod['liability_adjustment']
                entries.append({
                    'date': mod['effective_date'],
                    'description': f"Modification - {mod.get('description') or 'Lease Adjustment'}",
                    'debit_account': 'ROU Asset' if adj > 0 else 'Lease Liability',
                    'credit_account': 'Lease Liability' if adj > 0 else 'ROU Asset',
                    'amount': abs(adj),
                    'cash_flow_classification': 'Non-cash',
                })
            if (mod.get('gain_loss') or 0) != 0:
                gl = mod['gain_loss']
                entries.append({
                    'date': mod['effective_date'],
                    'description': f"Modification - {'Gain' if gl > 0 else 'Loss'} on Scope Decrease",
                    'debit_account': 'Loss on Lease Modification' if gl < 0 else 'Lease Liability',
                    'credit_account': 'Gain on Lease Modification' if gl > 0 else 'ROU Asset',
                    'amount': abs(gl),
                    'cash_flow_classification': 'Non-cash',
                })

    return entries


def format_currency(value: float) -> str:
    # Indian number format (en-IN style)
    try:
        s = f"{abs(value):,.2f}"
        # Convert US-style thousands separators to Indian style
        parts = s.split('.')
        integer_part = parts[0].replace(',', '')
        decimal_part = parts[1] if len(parts) > 1 else '00'
        # Apply Indian grouping: last 3, then 2s
        if len(integer_part) > 3:
            last3 = integer_part[-3:]
            remaining = integer_part[:-3]
            groups = []
            while len(remaining) > 2:
                groups.append(remaining[-2:])
                remaining = remaining[:-2]
            if remaining:
                groups.append(remaining)
            groups.reverse()
            integer_part = ','.join(groups) + ',' + last3
        result = f"{integer_part}.{decimal_part}"
        return f"-{result}" if value < 0 else result
    except Exception:
        return f"{value:,.2f}"


def compute_disclosures(leases: List[Dict], reporting_date: str) -> Dict:
    rep_date = parse_date(reporting_date)

    within1 = between1and5 = beyond5 = 0.0
    total_undiscounted = total_liability_at_rep = 0.0
    rou_additions = rou_depreciation = rou_modifications = rou_disposals = 0.0
    liab_additions = liab_interest = liab_payments = liab_modifications = liab_disposals = 0.0
    total_dep_expense = total_int_expense = 0.0
    total_cash_outflow = 0.0
    principal_financing = interest_financing = 0.0
    short_term_expense = low_value_expense = 0.0

    for lease in leases:
        if lease.get('short_term_flag') or lease.get('low_value_flag'):
            try:
                comp = compute_lease(lease)
                total_payments = sum(r['lease_payment'] for r in comp['schedule'])
                if lease.get('short_term_flag'):
                    short_term_expense += total_payments
                if lease.get('low_value_flag'):
                    low_value_expense += total_payments
                total_cash_outflow += total_payments
            except Exception:
                pass
            continue

        try:
            comp = compute_lease(lease)

            rou_additions += comp['initial_rou']
            liab_additions += comp['initial_liability']

            for row in comp['schedule']:
                row_date = parse_date(row['period_date'])
                rou_depreciation += row['depreciation']
                liab_interest += row['interest_expense']
                liab_payments += row['lease_payment']
                total_dep_expense += row['depreciation']
                total_int_expense += row['interest_expense']
                total_cash_outflow += row['lease_payment']

                principal = row['lease_payment'] - row['interest_expense']
                principal_financing += max(principal, 0)
                interest_financing += min(row['interest_expense'], row['lease_payment'])

                if row_date > rep_date:
                    years_from_rep = difference_in_days(row_date, rep_date) / 365
                    if years_from_rep <= 1:
                        within1 += row['lease_payment']
                    elif years_from_rep <= 5:
                        between1and5 += row['lease_payment']
                    else:
                        beyond5 += row['lease_payment']
                    total_undiscounted += row['lease_payment']

            rows_before_rep = [r for r in comp['schedule'] if parse_date(r['period_date']) <= rep_date]
            if rows_before_rep:
                total_liability_at_rep += max(rows_before_rep[-1]['closing_liability'], 0)

            for mod in (lease.get('modifications') or []):
                if mod.get('modification_type') == 'EARLY_TERMINATION':
                    rou_disposals += abs(mod.get('carrying_rou_at_mod') or 0)
                    liab_disposals += abs(mod.get('carrying_liability_at_mod') or 0)
                else:
                    rou_modifications += mod.get('rou_adjustment') or 0
                    liab_modifications += mod.get('liability_adjustment') or 0
        except Exception:
            pass

    rou_closing = rou_additions - rou_depreciation + rou_modifications - rou_disposals
    liab_closing = liab_additions + liab_interest - liab_payments + liab_modifications - liab_disposals

    return {
        'maturity_analysis': {
            'within_1_year': round2(within1),
            'between_1_and_5_years': round2(between1and5),
            'beyond_5_years': round2(beyond5),
            'total_undiscounted': round2(total_undiscounted),
            'total_lease_liability': round2(total_liability_at_rep),
            'discount_effect': round2(total_undiscounted - total_liability_at_rep),
        },
        'rou_movement': {
            'opening_balance': 0,
            'additions': round2(rou_additions),
            'depreciation': round2(rou_depreciation),
            'modifications': round2(rou_modifications),
            'disposals': round2(rou_disposals),
            'closing_balance': round2(rou_closing),
        },
        'liability_movement': {
            'opening_balance': 0,
            'additions': round2(liab_additions),
            'interest_accretion': round2(liab_interest),
            'payments': round2(liab_payments),
            'modifications': round2(liab_modifications),
            'disposals': round2(liab_disposals),
            'closing_balance': round2(liab_closing),
        },
        'expense_summary': {
            'depreciation_expense': round2(total_dep_expense),
            'interest_expense': round2(total_int_expense),
            'short_term_lease_expense': round2(short_term_expense),
            'low_value_lease_expense': round2(low_value_expense),
            'total_cash_outflow': round2(total_cash_outflow),
        },
        'cash_flow': {
            'principal_payments_financing': round2(principal_financing),
            'interest_payments_financing': round2(interest_financing),
            'short_term_low_value_operating': round2(short_term_expense + low_value_expense),
        },
    }

import { useEffect, useState } from 'react';
import { getLeases } from '@/lib/store';
import { computeDisclosures, formatCurrency } from '@/lib/computations';
import { DisclosureData, Lease } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, FileBarChart, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

function DisclosureTable({ title, subtitle, rows }: { title: string; subtitle?: string; rows: { label: string; value: number; bold?: boolean; indent?: boolean }[] }) {
  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="divide-y">
        {rows.map((row, i) => (
          <div key={i} className={`flex items-center justify-between px-4 py-2.5 text-sm ${row.bold ? 'font-semibold bg-muted/20' : ''}`}>
            <span className={`text-foreground ${row.indent ? 'pl-4' : ''}`}>{row.label}</span>
            <span className="font-mono tabular-nums">{formatCurrency(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Disclosures() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportingDate, setReportingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [disclosure, setDisclosure] = useState<DisclosureData | null>(null);

  useEffect(() => {
    getLeases().then(setLeases).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (leases.length > 0 && reportingDate) {
      try {
        setDisclosure(computeDisclosures(leases, reportingDate));
      } catch {
        setDisclosure(null);
      }
    }
  }, [leases, reportingDate]);

  const exportDisclosures = () => {
    if (!disclosure) return;
    const lines: string[] = [];
    lines.push('Ind AS 116 / IFRS 16 Disclosure Report');
    lines.push(`Reporting Date: ${reportingDate}`);
    lines.push('');

    lines.push('MATURITY ANALYSIS OF LEASE LIABILITIES (Ind AS 116.58)');
    lines.push(`Within 1 year,${disclosure.maturity_analysis.within_1_year}`);
    lines.push(`Between 1 and 5 years,${disclosure.maturity_analysis.between_1_and_5_years}`);
    lines.push(`Beyond 5 years,${disclosure.maturity_analysis.beyond_5_years}`);
    lines.push(`Total undiscounted,${disclosure.maturity_analysis.total_undiscounted}`);
    lines.push(`Discount effect,${disclosure.maturity_analysis.discount_effect}`);
    lines.push(`Total lease liability,${disclosure.maturity_analysis.total_lease_liability}`);
    lines.push('');

    lines.push('ROU ASSET MOVEMENT (Ind AS 116.53)');
    lines.push(`Additions,${disclosure.rou_movement.additions}`);
    lines.push(`Depreciation,${disclosure.rou_movement.depreciation}`);
    lines.push(`Modifications,${disclosure.rou_movement.modifications}`);
    lines.push(`Disposals,${disclosure.rou_movement.disposals}`);
    lines.push(`Closing Balance,${disclosure.rou_movement.closing_balance}`);
    lines.push('');

    lines.push('EXPENSE SUMMARY (Ind AS 116.53)');
    lines.push(`Depreciation,${disclosure.expense_summary.depreciation_expense}`);
    lines.push(`Interest,${disclosure.expense_summary.interest_expense}`);
    lines.push(`Short-term lease expense,${disclosure.expense_summary.short_term_lease_expense}`);
    lines.push(`Low-value lease expense,${disclosure.expense_summary.low_value_lease_expense}`);
    lines.push(`Total cash outflow,${disclosure.expense_summary.total_cash_outflow}`);
    lines.push('');

    lines.push('CASH FLOW CLASSIFICATION (Ind AS 7)');
    lines.push(`Principal payments (Financing),${disclosure.cash_flow.principal_payments_financing}`);
    lines.push(`Interest payments (Financing),${disclosure.cash_flow.interest_payments_financing}`);
    lines.push(`Short-term/low-value (Operating),${disclosure.cash_flow.short_term_low_value_operating}`);

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IndAS116_Disclosures_${reportingDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div className="page-container flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Ind AS 116 Disclosures</h1>
          <p className="page-subtitle">Schedule III compliant lease disclosures per Ind AS 116 / IFRS 16</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Reporting Date:</label>
            <Input
              type="date"
              value={reportingDate}
              onChange={e => setReportingDate(e.target.value)}
              className="w-40"
            />
          </div>
          {disclosure && (
            <Button size="sm" variant="outline" onClick={exportDisclosures}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {leases.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center">
          <FileBarChart className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1">No leases found</h3>
          <p className="text-sm text-muted-foreground">Create leases to generate disclosures.</p>
        </div>
      ) : disclosure ? (
        <div className="space-y-6">
          {/* Maturity Analysis */}
          <DisclosureTable
            title="Maturity Analysis of Lease Liabilities"
            subtitle="Ind AS 116 Para 58 — Undiscounted future lease payments"
            rows={[
              { label: 'Within 1 year', value: disclosure.maturity_analysis.within_1_year, indent: true },
              { label: 'Between 1 and 5 years', value: disclosure.maturity_analysis.between_1_and_5_years, indent: true },
              { label: 'Beyond 5 years', value: disclosure.maturity_analysis.beyond_5_years, indent: true },
              { label: 'Total undiscounted lease payments', value: disclosure.maturity_analysis.total_undiscounted, bold: true },
              { label: 'Less: Effect of discounting', value: -disclosure.maturity_analysis.discount_effect },
              { label: 'Lease liability recognised in Balance Sheet', value: disclosure.maturity_analysis.total_lease_liability, bold: true },
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ROU Movement */}
            <DisclosureTable
              title="Right-of-Use Asset Movement"
              subtitle="Ind AS 116 Para 53 — ROU asset reconciliation"
              rows={[
                { label: 'Additions during the period', value: disclosure.rou_movement.additions },
                { label: 'Depreciation charge', value: -disclosure.rou_movement.depreciation },
                { label: 'Modification adjustments', value: disclosure.rou_movement.modifications },
                { label: 'Disposals / Terminations', value: -disclosure.rou_movement.disposals },
                { label: 'Closing balance', value: disclosure.rou_movement.closing_balance, bold: true },
              ]}
            />

            {/* Liability Movement */}
            <DisclosureTable
              title="Lease Liability Movement"
              subtitle="Ind AS 116 Para 53 — Liability reconciliation"
              rows={[
                { label: 'Additions during the period', value: disclosure.liability_movement.additions },
                { label: 'Interest accretion', value: disclosure.liability_movement.interest_accretion },
                { label: 'Lease payments', value: -disclosure.liability_movement.payments },
                { label: 'Modification adjustments', value: disclosure.liability_movement.modifications },
                { label: 'Disposals / Terminations', value: -disclosure.liability_movement.disposals },
                { label: 'Closing balance', value: disclosure.liability_movement.closing_balance, bold: true },
              ]}
            />
          </div>

          {/* Expense Summary */}
          <DisclosureTable
            title="Lease Expense Summary"
            subtitle="Ind AS 116 Para 53(a)–(d) — Amounts recognised in Statement of Profit & Loss"
            rows={[
              { label: 'Depreciation expense on ROU assets', value: disclosure.expense_summary.depreciation_expense },
              { label: 'Interest expense on lease liabilities', value: disclosure.expense_summary.interest_expense },
              { label: 'Short-term lease expense (recognised as expense)', value: disclosure.expense_summary.short_term_lease_expense },
              { label: 'Low-value asset lease expense (recognised as expense)', value: disclosure.expense_summary.low_value_lease_expense },
              { label: 'Total cash outflow for leases', value: disclosure.expense_summary.total_cash_outflow, bold: true },
            ]}
          />

          {/* Cash Flow Classification */}
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Cash Flow Classification</h3>
                <Badge variant="outline" className="text-[10px]">Ind AS 7</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Per Ind AS 7, interest paid on lease liabilities is classified as <strong>Financing Activity</strong> (not Operating)
              </p>
            </div>
            <div className="divide-y">
              <div className="px-4 py-2 bg-muted/10">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Financing Activities</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="pl-4">Principal portion of lease payments</span>
                <span className="font-mono tabular-nums">{formatCurrency(disclosure.cash_flow.principal_payments_financing)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="pl-4">Interest portion of lease payments</span>
                <span className="font-mono tabular-nums">{formatCurrency(disclosure.cash_flow.interest_payments_financing)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 text-sm font-semibold bg-muted/20">
                <span className="pl-4">Total financing outflow</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(disclosure.cash_flow.principal_payments_financing + disclosure.cash_flow.interest_payments_financing)}
                </span>
              </div>
              {(disclosure.cash_flow.short_term_low_value_operating > 0) && (
                <>
                  <div className="px-4 py-2 bg-muted/10">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Operating Activities</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="pl-4">Short-term & low-value lease payments</span>
                    <span className="font-mono tabular-nums">{formatCurrency(disclosure.cash_flow.short_term_low_value_operating)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

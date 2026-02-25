import { useEffect, useState, useMemo } from 'react';
import { getLeases, getGroups, getEntities } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { computeDisclosures, formatCurrency } from '@/lib/computations';
import { DisclosureData, Lease, CorporateGroup, Entity } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, FileBarChart, Loader2, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import MultiSelectFilter from '@/components/MultiSelectFilter';

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
  const [groups, setGroups] = useState<CorporateGroup[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [leaseTypes, setLeaseTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters — empty array = all selected
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectedLeaseTypes, setSelectedLeaseTypes] = useState<string[]>([]);
  const [reportingDate, setReportingDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const load = async () => {
      const [l, g, e, ltRes] = await Promise.all([
        getLeases(),
        getGroups(),
        getEntities(),
        supabase.from('lease_types').select('lease_type_name').order('created_at'),
      ]);
      setLeases(l);
      setGroups(g);
      setEntities(e);
      setLeaseTypes((ltRes.data || []).map((r: any) => r.lease_type_name));
      setLoading(false);
    };
    load();
  }, []);

  // Filter entities based on selected groups
  const filteredEntityOptions = useMemo(() => {
    if (selectedGroups.length === 0) return entities;
    return entities.filter(e => selectedGroups.includes(e.corporate_id));
  }, [entities, selectedGroups]);

  // Reset entity selection when group changes and selected entities are no longer valid
  useEffect(() => {
    if (selectedEntities.length > 0) {
      const validIds = new Set(filteredEntityOptions.map(e => e.entity_id));
      const valid = selectedEntities.filter(id => validIds.has(id));
      if (valid.length !== selectedEntities.length) {
        setSelectedEntities(valid);
      }
    }
  }, [filteredEntityOptions, selectedEntities]);

  const filteredLeases = useMemo(() => {
    return leases.filter(l => {
      // Group filter
      if (selectedGroups.length > 0) {
        const entity = entities.find(e => e.entity_id === l.entity_id);
        if (!entity || !selectedGroups.includes(entity.corporate_id)) return false;
      }
      // Entity filter
      if (selectedEntities.length > 0 && !selectedEntities.includes(l.entity_id)) return false;
      // Lease type filter
      if (selectedLeaseTypes.length > 0 && !selectedLeaseTypes.includes(l.lease_type)) return false;
      return true;
    });
  }, [leases, entities, selectedGroups, selectedEntities, selectedLeaseTypes]);

  const disclosure = useMemo<DisclosureData | null>(() => {
    if (filteredLeases.length === 0 || !reportingDate) return null;
    try {
      return computeDisclosures(filteredLeases, reportingDate);
    } catch {
      return null;
    }
  }, [filteredLeases, reportingDate]);

  const exportDisclosures = () => {
    if (!disclosure) return;
    const lines: string[] = [];
    lines.push('Ind AS 116 / IFRS 16 Disclosure Report');
    lines.push(`Reporting Date: ${reportingDate}`);
    lines.push(`Leases included: ${filteredLeases.length}`);
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
        {disclosure && (
          <Button size="sm" variant="outline" onClick={exportDisclosures}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-card border rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Filters</h3>
          <Badge variant="secondary" className="text-[10px]">{filteredLeases.length} leases</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <MultiSelectFilter
            label="Corporate Group"
            options={groups.map(g => ({ value: g.corporate_id, label: g.corporate_group_name }))}
            selected={selectedGroups}
            onChange={setSelectedGroups}
            placeholder="All Groups"
          />
          <MultiSelectFilter
            label="Entity"
            options={filteredEntityOptions.map(e => ({ value: e.entity_id, label: e.legal_entity_name }))}
            selected={selectedEntities}
            onChange={setSelectedEntities}
            placeholder="All Entities"
          />
          <MultiSelectFilter
            label="Lease Type"
            options={leaseTypes.map(lt => ({ value: lt, label: lt }))}
            selected={selectedLeaseTypes}
            onChange={setSelectedLeaseTypes}
            placeholder="All Types"
          />
          <div>
            <Label className="text-xs text-muted-foreground">Reporting Date</Label>
            <Input
              type="date"
              value={reportingDate}
              onChange={e => setReportingDate(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
        </div>
      </div>

      {filteredLeases.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center">
          <FileBarChart className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1">No leases match filters</h3>
          <p className="text-sm text-muted-foreground">Adjust your filter selections to generate disclosures.</p>
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

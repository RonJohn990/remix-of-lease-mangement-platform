import { useEffect, useState, useMemo } from 'react';
import { getLeases, getEntities, getGroups } from '@/lib/store';
import { formatCurrency } from '@/lib/computations';
import { api } from '@/lib/api';
import { Lease, Entity, CorporateGroup, LeaseComputation, JournalEntry } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileSpreadsheet, Loader2, Filter, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { parseISO, isAfter, isBefore, format } from 'date-fns';
import MultiSelectFilter from '@/components/MultiSelectFilter';

type ReportType = 'schedule' | 'journal' | 'summary' | 'version_history' | 'payment_schedule' | 'present_value';

const round2 = (v: number) => Math.round(v * 100) / 100;

export default function Reports() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [groups, setGroups] = useState<CorporateGroup[]>([]);
  const [leaseTypes, setLeaseTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [computations, setComputations] = useState<Record<string, { computation: LeaseComputation; journals: JournalEntry[] }>>({});
  const [computing, setComputing] = useState(false);

  // Filters
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectedLeaseTypes, setSelectedLeaseTypes] = useState<string[]>([]);
  const [selectedLeases, setSelectedLeases] = useState<string[]>([]);
  const [leaseSearch, setLeaseSearch] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [reportType, setReportType] = useState<ReportType>('summary');

  useEffect(() => {
    const load = async () => {
      const [l, e, g, ltRes] = await Promise.all([
        getLeases(),
        getEntities(),
        getGroups(),
        api.get<{ id: string; lease_type_name: string }[]>('/lease-types'),
      ]);
      setLeases(l);
      setEntities(e);
      setGroups(g);
      setLeaseTypes(ltRes.map((r) => r.lease_type_name));
      setLoading(false);
    };
    load();
  }, []);

  // Entities filtered by selected groups
  const filteredEntityOptions = useMemo(() => {
    if (selectedGroups.length === 0) return entities;
    return entities.filter(e => selectedGroups.includes(e.corporate_id));
  }, [entities, selectedGroups]);

  // Reset entity selection when group changes
  useEffect(() => {
    if (selectedEntities.length > 0) {
      const validIds = new Set(filteredEntityOptions.map(e => e.entity_id));
      const valid = selectedEntities.filter(id => validIds.has(id));
      if (valid.length !== selectedEntities.length) setSelectedEntities(valid);
    }
  }, [filteredEntityOptions, selectedEntities]);

  // Pre-filter leases by group, entity, type, classification
  const preFilteredLeases = useMemo(() => {
    return leases.filter(l => {
      if (selectedGroups.length > 0) {
        const entity = entities.find(e => e.entity_id === l.entity_id);
        if (!entity || !selectedGroups.includes(entity.corporate_id)) return false;
      }
      if (selectedEntities.length > 0 && !selectedEntities.includes(l.entity_id)) return false;
      if (selectedLeaseTypes.length > 0 && !selectedLeaseTypes.includes(l.lease_type)) return false;
      if (classificationFilter !== 'all' && l.lease_classification !== classificationFilter) return false;
      if (periodFrom && isBefore(parseISO(l.lease_end_date), parseISO(periodFrom))) return false;
      if (periodTo && isAfter(parseISO(l.lease_start_date), parseISO(periodTo))) return false;
      return true;
    });
  }, [leases, entities, selectedGroups, selectedEntities, selectedLeaseTypes, classificationFilter, periodFrom, periodTo]);

  // Reset selected leases when pre-filters change
  useEffect(() => {
    if (selectedLeases.length > 0) {
      const validIds = new Set(preFilteredLeases.map(l => l.lease_id));
      const valid = selectedLeases.filter(id => validIds.has(id));
      if (valid.length !== selectedLeases.length) setSelectedLeases(valid);
    }
  }, [preFilteredLeases, selectedLeases]);

  // Leases available for selection (matching search)
  const searchableLeases = useMemo(() => {
    if (!leaseSearch) return preFilteredLeases;
    const q = leaseSearch.toLowerCase();
    return preFilteredLeases.filter(l =>
      l.lease_name.toLowerCase().includes(q) ||
      l.lease_id.toLowerCase().includes(q) ||
      l.legal_entity_name.toLowerCase().includes(q)
    );
  }, [preFilteredLeases, leaseSearch]);

  // Final filtered leases
  const filteredLeases = useMemo(() => {
    if (selectedLeases.length === 0) return preFilteredLeases;
    return preFilteredLeases.filter(l => selectedLeases.includes(l.lease_id));
  }, [preFilteredLeases, selectedLeases]);

  // Fetch computations for filtered leases
  const fetchComputations = async (leasesToCompute: Lease[]) => {
    if (leasesToCompute.length === 0) return {};
    try {
      setComputing(true);
      const result = await api.post<Record<string, { computation: LeaseComputation; journals: JournalEntry[]; error?: string }>>('/compute/batch', { leases: leasesToCompute });
      setComputations(result);
      return result;
    } catch {
      return {};
    } finally {
      setComputing(false);
    }
  };

  // Recompute when filtered leases change
  useEffect(() => {
    if (!loading && filteredLeases.length > 0) {
      fetchComputations(filteredLeases);
    } else {
      setComputations({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeases, loading]);

  const getVersionInfo = (lease: Lease) => {
    const modCount = (lease.modifications || []).length;
    const currentVersion = lease.lease_version || 1;
    const amendmentDates = (lease.modifications || [])
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
      .map((m, i) => `v${i + 2}: ${m.effective_date} (${m.modification_type})`);
    return { currentVersion, modCount, amendmentDates };
  };

  const exportReport = async () => {
    if (filteredLeases.length === 0) return;

    // Ensure computations are available
    let comps = computations;
    if (Object.keys(comps).length === 0) {
      comps = await fetchComputations(filteredLeases) as typeof computations;
    }

    const lines: string[] = [];
    const periodLabel = periodFrom || periodTo
      ? `Period: ${periodFrom || 'Start'} to ${periodTo || 'End'}`
      : 'All Periods';

    if (reportType === 'summary') {
      lines.push('Lease Summary Report');
      lines.push(periodLabel);
      lines.push('');
      lines.push('Lease Name,Entity,Lease Type,Classification,Status,Current Version,Lease Event,No. of Amendments,Amendment Dates,Start Date,End Date,Monthly Amount,Discount Rate,Initial Liability,Initial ROU,Total Interest,Total Depreciation');

      for (const lease of filteredLeases) {
        const vi = getVersionInfo(lease);
        const compData = comps[lease.lease_id];
        const comp = compData?.computation;
        if (comp) {
          lines.push([
            `"${lease.lease_name}"`,
            `"${lease.legal_entity_name}"`,
            lease.lease_type,
            lease.lease_classification,
            lease.status,
            vi.currentVersion,
            lease.lease_event,
            vi.modCount,
            `"${vi.amendmentDates.join('; ')}"`,
            lease.lease_start_date,
            lease.lease_end_date,
            lease.monthly_lease_amount,
            lease.discount_rate_ibr,
            comp.initial_liability,
            comp.initial_rou,
            comp.total_interest,
            comp.total_depreciation,
          ].join(','));
        } else {
          lines.push([`"${lease.lease_name}"`, `"${lease.legal_entity_name}"`, lease.lease_type, lease.lease_classification, lease.status, vi.currentVersion, lease.lease_event, vi.modCount, `"${vi.amendmentDates.join('; ')}"`, lease.lease_start_date, lease.lease_end_date, lease.monthly_lease_amount, lease.discount_rate_ibr, 'Error', '', '', ''].join(','));
        }
      }
    } else if (reportType === 'version_history') {
      lines.push('Lease Version History Report');
      lines.push(periodLabel);
      lines.push('');
      lines.push('Lease Name,Entity,Classification,Version,Event,Event Date,Type,Description,New End Date,New Monthly Amount,New Discount Rate,Termination Penalty,Scope Decrease %,Liability Adjustment,ROU Adjustment,Gain/Loss');

      for (const lease of filteredLeases) {
        // v1 - Initial
        lines.push([
          `"${lease.lease_name}"`,
          `"${lease.legal_entity_name}"`,
          lease.lease_classification,
          1,
          'INITIAL',
          lease.rent_commencement_date,
          'Initial Recognition',
          '"Lease commencement"',
          lease.lease_end_date,
          lease.monthly_lease_amount,
          lease.discount_rate_ibr,
          '', '', '', '', '',
        ].join(','));

        // Subsequent versions
        for (const [i, mod] of (lease.modifications || []).entries()) {
          lines.push([
            `"${lease.lease_name}"`,
            `"${lease.legal_entity_name}"`,
            lease.lease_classification,
            i + 2,
            mod.modification_type,
            mod.effective_date,
            mod.modification_type.replace(/_/g, ' '),
            `"${mod.description || ''}"`,
            mod.new_lease_end_date || '',
            mod.new_monthly_amount || '',
            mod.new_discount_rate || '',
            mod.termination_penalty || '',
            mod.scope_decrease_percentage || '',
            mod.liability_adjustment || '',
            mod.rou_adjustment || '',
            mod.gain_loss || '',
          ].join(','));
        }
      }
    } else if (reportType === 'payment_schedule') {
      lines.push('Lease Payment Schedule Report');
      lines.push(periodLabel);
      lines.push('');
      lines.push('Lease Name,Entity,Classification,Period,Date,Days,Payment Amount,Payment Frequency,Escalation Applied,Cumulative Payments');

      for (const lease of filteredLeases) {
        const comp = comps[lease.lease_id]?.computation;
        if (!comp) continue;
        let cumulative = 0;
        for (const row of comp.schedule) {
          if (periodFrom && isBefore(parseISO(row.period_date), parseISO(periodFrom))) continue;
          if (periodTo && isAfter(parseISO(row.period_date), parseISO(periodTo))) continue;
          cumulative += row.lease_payment;
          const hasEscalation = (lease.escalations || []).some(e => !isAfter(parseISO(e.escalation_start_date), parseISO(row.period_date)));
          lines.push([
            `"${lease.lease_name}"`,
            `"${lease.legal_entity_name}"`,
            lease.lease_classification,
            row.period,
            row.period_date,
            row.days_in_period,
            row.lease_payment,
            lease.payment_frequency,
            hasEscalation ? 'Yes' : 'No',
            round2(cumulative),
          ].join(','));
        }
      }
    } else if (reportType === 'present_value') {
      lines.push('Present Value of Leases Report');
      lines.push(periodLabel);
      lines.push('');
      lines.push('Lease Name,Entity,Classification,Start Date,End Date,Monthly Amount,Discount Rate (%),Total Undiscounted Payments,Initial PV (Liability),Initial ROU Asset,Total Interest Over Term,Total Depreciation Over Term,Net Carrying Liability (Final),PV as % of Undiscounted');

      for (const lease of filteredLeases) {
        const comp = comps[lease.lease_id]?.computation;
        if (comp) {
          const totalPayments = comp.schedule.reduce((s, r) => s + r.lease_payment, 0);
          const finalLiab = comp.schedule.length > 0 ? comp.schedule[comp.schedule.length - 1].closing_liability : 0;
          const pvPct = totalPayments > 0 ? round2((comp.initial_liability / totalPayments) * 100) : 0;
          lines.push([
            `"${lease.lease_name}"`,
            `"${lease.legal_entity_name}"`,
            lease.lease_classification,
            lease.lease_start_date,
            lease.lease_end_date,
            lease.monthly_lease_amount,
            lease.discount_rate_ibr,
            round2(totalPayments),
            comp.initial_liability,
            comp.initial_rou,
            comp.total_interest,
            comp.total_depreciation,
            round2(finalLiab),
            pvPct,
          ].join(','));
        } else {
          lines.push([`"${lease.lease_name}"`, `"${lease.legal_entity_name}"`, lease.lease_classification, lease.lease_start_date, lease.lease_end_date, lease.monthly_lease_amount, lease.discount_rate_ibr, 'Error', '', '', '', '', '', ''].join(','));
        }
      }
    } else if (reportType === 'schedule') {
      lines.push('Lease Schedule Report');
      lines.push(periodLabel);
      lines.push('');
      lines.push('Lease Name,Entity,Classification,Version,Period,Date,Days,Payment,Opening Liability,Interest,Closing Liability,Opening ROU,Depreciation,Closing ROU,Current Liability,Non-Current Liability');

      for (const lease of filteredLeases) {
        const comp = comps[lease.lease_id]?.computation;
        if (!comp) continue;
        for (const row of comp.schedule) {
          if (periodFrom && isBefore(parseISO(row.period_date), parseISO(periodFrom))) continue;
          if (periodTo && isAfter(parseISO(row.period_date), parseISO(periodTo))) continue;
          lines.push([
            `"${lease.lease_name}"`,
            `"${lease.legal_entity_name}"`,
            lease.lease_classification,
            lease.lease_version,
            row.period,
            row.period_date,
            row.days_in_period,
            row.lease_payment,
            row.opening_liability,
            row.interest_expense,
            row.closing_liability,
            row.opening_rou,
            row.depreciation,
            row.closing_rou,
            row.current_liability,
            row.non_current_liability,
          ].join(','));
        }
      }
    } else if (reportType === 'journal') {
      lines.push('Journal Entries Report');
      lines.push(periodLabel);
      lines.push('');
      lines.push('Lease Name,Entity,Classification,Version,Date,Description,Debit Account,Credit Account,Amount,Cash Flow Classification');

      for (const lease of filteredLeases) {
        const entries = comps[lease.lease_id]?.journals || [];
        for (const entry of entries) {
          if (periodFrom && isBefore(parseISO(entry.date), parseISO(periodFrom))) continue;
          if (periodTo && isAfter(parseISO(entry.date), parseISO(periodTo))) continue;
          lines.push([
            `"${lease.lease_name}"`,
            `"${lease.legal_entity_name}"`,
            lease.lease_classification,
            lease.lease_version,
            entry.date,
            `"${entry.description}"`,
            entry.debit_account,
            entry.credit_account,
            entry.amount,
            entry.cash_flow_classification || '',
          ].join(','));
        }
      }
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const typeLabel = reportType === 'summary' ? 'Summary' : reportType === 'schedule' ? 'Schedule' : reportType === 'version_history' ? 'VersionHistory' : reportType === 'payment_schedule' ? 'PaymentSchedule' : reportType === 'present_value' ? 'PresentValue' : 'JournalEntries';
    a.download = `IndAS116_${typeLabel}_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Preview data for table using pre-computed results
  const previewData = filteredLeases.map(lease => {
    const compData = computations[lease.lease_id];
    return { lease, comp: compData?.computation ?? null, error: !compData || !!compData.error };
  });

  if (loading) return (
    <div className="page-container flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Download filtered Ind AS 116 / IFRS 16 reports</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Filters</h3>
          <Badge variant="secondary" className="text-[10px]">{filteredLeases.length} leases selected</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
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
            <Label className="text-xs text-muted-foreground">Classification</Label>
            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Operating">Operating</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Period From</Label>
            <Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Period To</Label>
            <Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Report Type</Label>
            <Select value={reportType} onValueChange={(v: ReportType) => setReportType(v)}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Lease Summary</SelectItem>
                <SelectItem value="version_history">Version History</SelectItem>
                <SelectItem value="schedule">Amortisation Schedule</SelectItem>
                <SelectItem value="payment_schedule">Payment Schedule</SelectItem>
                <SelectItem value="present_value">Present Value of Leases</SelectItem>
                <SelectItem value="journal">Journal Entries</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Lease Selector */}
      <div className="bg-card border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Select Leases</h3>
            <span className="text-xs text-muted-foreground">
              ({selectedLeases.length === 0 ? 'All' : selectedLeases.length} of {preFilteredLeases.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedLeases.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSelectedLeases([])}>
                Clear Selection
              </Button>
            )}
            <Button
              variant="outline" size="sm" className="text-xs h-7"
              onClick={() => setSelectedLeases(
                selectedLeases.length === preFilteredLeases.length ? [] : preFilteredLeases.map(l => l.lease_id)
              )}
            >
              {selectedLeases.length === preFilteredLeases.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by lease name, ID or entity..."
            value={leaseSearch}
            onChange={e => setLeaseSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
          {searchableLeases.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">No leases found</div>
          ) : (
            searchableLeases.map(lease => {
              const isSelected = selectedLeases.length === 0 || selectedLeases.includes(lease.lease_id);
              return (
                <label
                  key={lease.lease_id}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      if (selectedLeases.length === 0) {
                        // Currently "all" — click means select only this one
                        setSelectedLeases([lease.lease_id]);
                      } else if (selectedLeases.includes(lease.lease_id)) {
                        const next = selectedLeases.filter(id => id !== lease.lease_id);
                        setSelectedLeases(next);
                      } else {
                        const next = [...selectedLeases, lease.lease_id];
                        setSelectedLeases(next.length === preFilteredLeases.length ? [] : next);
                      }
                    }}
                    className="rounded border-input"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{lease.lease_name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{lease.legal_entity_name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{lease.lease_type || '—'}</Badge>
                  <Badge variant={lease.status === 'Active' ? 'default' : 'destructive'} className="text-[10px] shrink-0">{lease.status}</Badge>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{lease.lease_id.slice(0, 8)}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Preview & Download */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">
              {reportType === 'summary' ? 'Lease Summary' : reportType === 'schedule' ? 'Amortisation Schedule' : reportType === 'version_history' ? 'Version History' : reportType === 'payment_schedule' ? 'Payment Schedule' : reportType === 'present_value' ? 'Present Value of Leases' : 'Journal Entries'}
            </h3>
            <Badge variant="secondary" className="text-[10px]">{filteredLeases.length} leases</Badge>
          </div>
          <Button size="sm" onClick={exportReport} disabled={filteredLeases.length === 0 || computing}>
            {computing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />} Download CSV
          </Button>
        </div>

        {filteredLeases.length === 0 ? (
          <div className="p-8 text-center">
            <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No leases match filters</h3>
            <p className="text-sm text-muted-foreground">Adjust filters to see results.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {reportType === 'summary' && (
                <>
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="px-3 py-2 text-left font-medium">Lease Name</th>
                      <th className="px-3 py-2 text-left font-medium">Entity</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Classification</th>
                      <th className="px-3 py-2 text-center font-medium">Version</th>
                      <th className="px-3 py-2 text-left font-medium">Lease Event</th>
                      <th className="px-3 py-2 text-center font-medium">Amendments</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Initial Liability</th>
                      <th className="px-3 py-2 text-right font-medium">Initial ROU</th>
                      <th className="px-3 py-2 text-right font-medium">Total Interest</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewData.map(({ lease, comp, error }) => {
                      const vi = getVersionInfo(lease);
                      return (
                        <tr key={lease.lease_id} className="hover:bg-muted/10">
                          <td className="px-3 py-2 font-medium">{lease.lease_name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{lease.legal_entity_name}</td>
                          <td className="px-3 py-2">{lease.lease_type || '—'}</td>
                          <td className="px-3 py-2"><Badge variant={lease.lease_classification === 'Finance' ? 'default' : 'secondary'} className="text-[10px]">{lease.lease_classification}</Badge></td>
                          <td className="px-3 py-2 text-center"><Badge variant="outline" className="text-[10px]">v{vi.currentVersion}</Badge></td>
                          <td className="px-3 py-2"><Badge variant={lease.lease_event === 'TERMINATION' ? 'destructive' : lease.lease_event === 'MODIFICATION' ? 'secondary' : 'outline'} className="text-[10px]">{lease.lease_event}</Badge></td>
                          <td className="px-3 py-2 text-center">{vi.modCount > 0 ? <span className="text-xs" title={vi.amendmentDates.join('\n')}>{vi.modCount} amendment{vi.modCount > 1 ? 's' : ''}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-2"><Badge variant={lease.status === 'Active' ? 'default' : 'destructive'} className="text-[10px]">{lease.status}</Badge></td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{error ? '—' : formatCurrency(comp!.initial_liability)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{error ? '—' : formatCurrency(comp!.initial_rou)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{error ? '—' : formatCurrency(comp!.total_interest)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {!previewData.some(d => d.error) && previewData.length > 1 && (
                    <tfoot>
                      <tr className="border-t font-semibold bg-muted/20">
                        <td className="px-3 py-2" colSpan={8}>Total</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(previewData.reduce((s, d) => s + (d.comp?.initial_liability || 0), 0))}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(previewData.reduce((s, d) => s + (d.comp?.initial_rou || 0), 0))}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(previewData.reduce((s, d) => s + (d.comp?.total_interest || 0), 0))}</td>
                      </tr>
                    </tfoot>
                  )}
                </>
              )}

              {reportType === 'version_history' && (
                <>
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="px-3 py-2 text-left font-medium">Lease Name</th>
                      <th className="px-3 py-2 text-left font-medium">Entity</th>
                      <th className="px-3 py-2 text-left font-medium">Classification</th>
                      <th className="px-3 py-2 text-center font-medium">Version</th>
                      <th className="px-3 py-2 text-left font-medium">Event</th>
                      <th className="px-3 py-2 text-left font-medium">Event Date</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Gain/Loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredLeases.flatMap(lease => {
                      const rows = [];
                      rows.push(
                        <tr key={`${lease.lease_id}-v1`} className="hover:bg-muted/10">
                          <td className="px-3 py-2 font-medium">{lease.lease_name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{lease.legal_entity_name}</td>
                          <td className="px-3 py-2">{lease.lease_classification}</td>
                          <td className="px-3 py-2 text-center"><Badge variant="outline" className="text-[10px]">v1</Badge></td>
                          <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">INITIAL</Badge></td>
                          <td className="px-3 py-2">{lease.rent_commencement_date}</td>
                          <td className="px-3 py-2">Initial Recognition</td>
                          <td className="px-3 py-2 text-muted-foreground">Lease commencement</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">—</td>
                        </tr>
                      );
                      (lease.modifications || []).forEach((mod, i) => {
                        rows.push(
                          <tr key={`${lease.lease_id}-v${i + 2}`} className="hover:bg-muted/10">
                            <td className="px-3 py-2 font-medium">{lease.lease_name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{lease.legal_entity_name}</td>
                            <td className="px-3 py-2">{lease.lease_classification}</td>
                            <td className="px-3 py-2 text-center"><Badge variant="outline" className="text-[10px]">v{i + 2}</Badge></td>
                            <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{mod.modification_type}</Badge></td>
                            <td className="px-3 py-2">{mod.effective_date}</td>
                            <td className="px-3 py-2">{mod.modification_type.replace(/_/g, ' ')}</td>
                            <td className="px-3 py-2 text-muted-foreground">{mod.description || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{mod.gain_loss ? formatCurrency(mod.gain_loss) : '—'}</td>
                          </tr>
                        );
                      });
                      return rows;
                    })}
                  </tbody>
                </>
              )}

              {reportType === 'schedule' && (() => {
                const scheduleRows = filteredLeases.flatMap(lease => {
                  const comp = computations[lease.lease_id]?.computation;
                  if (!comp) return [];
                  return comp.schedule
                    .filter(row => {
                      if (periodFrom && isBefore(parseISO(row.period_date), parseISO(periodFrom))) return false;
                      if (periodTo && isAfter(parseISO(row.period_date), parseISO(periodTo))) return false;
                      return true;
                    })
                    .map(row => ({ lease, row }));
                });
                return (
                  <>
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="px-3 py-2 text-left font-medium">Lease Name</th>
                        <th className="px-3 py-2 text-center font-medium">Period</th>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Payment</th>
                        <th className="px-3 py-2 text-right font-medium">Opening Liability</th>
                        <th className="px-3 py-2 text-right font-medium">Interest</th>
                        <th className="px-3 py-2 text-right font-medium">Closing Liability</th>
                        <th className="px-3 py-2 text-right font-medium">Opening ROU</th>
                        <th className="px-3 py-2 text-right font-medium">Depreciation</th>
                        <th className="px-3 py-2 text-right font-medium">Closing ROU</th>
                        <th className="px-3 py-2 text-right font-medium">Current</th>
                        <th className="px-3 py-2 text-right font-medium">Non-Current</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scheduleRows.map(({ lease, row }, i) => (
                        <tr key={`${lease.lease_id}-${row.period}-${i}`} className="hover:bg-muted/10">
                          <td className="px-3 py-2 font-medium">{lease.lease_name}</td>
                          <td className="px-3 py-2 text-center">{row.period}</td>
                          <td className="px-3 py-2">{row.period_date}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.lease_payment)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.opening_liability)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.interest_expense)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.closing_liability)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.opening_rou)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.depreciation)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.closing_rou)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.current_liability)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.non_current_liability)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                );
              })()}

              {reportType === 'payment_schedule' && (() => {
                const paymentRows = filteredLeases.flatMap(lease => {
                  const comp = computations[lease.lease_id]?.computation;
                  if (!comp) return [];
                  let cumulative = 0;
                  return comp.schedule
                    .filter(row => {
                      if (periodFrom && isBefore(parseISO(row.period_date), parseISO(periodFrom))) return false;
                      if (periodTo && isAfter(parseISO(row.period_date), parseISO(periodTo))) return false;
                      return true;
                    })
                    .map(row => {
                      cumulative += row.lease_payment;
                      const hasEscalation = (lease.escalations || []).some(e => !isAfter(parseISO(e.escalation_start_date), parseISO(row.period_date)));
                      return { lease, row, cumulative: round2(cumulative), hasEscalation };
                    });
                });
                return (
                  <>
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="px-3 py-2 text-left font-medium">Lease Name</th>
                        <th className="px-3 py-2 text-left font-medium">Entity</th>
                        <th className="px-3 py-2 text-center font-medium">Period</th>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-center font-medium">Days</th>
                        <th className="px-3 py-2 text-right font-medium">Payment</th>
                        <th className="px-3 py-2 text-left font-medium">Frequency</th>
                        <th className="px-3 py-2 text-center font-medium">Escalation</th>
                        <th className="px-3 py-2 text-right font-medium">Cumulative</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {paymentRows.map(({ lease, row, cumulative, hasEscalation }, i) => (
                        <tr key={`${lease.lease_id}-${row.period}-${i}`} className="hover:bg-muted/10">
                          <td className="px-3 py-2 font-medium">{lease.lease_name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{lease.legal_entity_name}</td>
                          <td className="px-3 py-2 text-center">{row.period}</td>
                          <td className="px-3 py-2">{row.period_date}</td>
                          <td className="px-3 py-2 text-center">{row.days_in_period}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.lease_payment)}</td>
                          <td className="px-3 py-2">{lease.payment_frequency}</td>
                          <td className="px-3 py-2 text-center">{hasEscalation ? <Badge variant="secondary" className="text-[10px]">Yes</Badge> : '—'}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(cumulative)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                );
              })()}

              {reportType === 'present_value' && (
                <>
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="px-3 py-2 text-left font-medium">Lease Name</th>
                      <th className="px-3 py-2 text-left font-medium">Entity</th>
                      <th className="px-3 py-2 text-left font-medium">Classification</th>
                      <th className="px-3 py-2 text-left font-medium">Start</th>
                      <th className="px-3 py-2 text-left font-medium">End</th>
                      <th className="px-3 py-2 text-right font-medium">Monthly Amt</th>
                      <th className="px-3 py-2 text-right font-medium">Rate %</th>
                      <th className="px-3 py-2 text-right font-medium">Total Undiscounted</th>
                      <th className="px-3 py-2 text-right font-medium">Initial PV</th>
                      <th className="px-3 py-2 text-right font-medium">PV %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewData.map(({ lease, comp, error }) => {
                      const totalPayments = comp ? comp.schedule.reduce((s, r) => s + r.lease_payment, 0) : 0;
                      const pvPct = totalPayments > 0 && comp ? round2((comp.initial_liability / totalPayments) * 100) : 0;
                      return (
                        <tr key={lease.lease_id} className="hover:bg-muted/10">
                          <td className="px-3 py-2 font-medium">{lease.lease_name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{lease.legal_entity_name}</td>
                          <td className="px-3 py-2">{lease.lease_classification}</td>
                          <td className="px-3 py-2">{lease.lease_start_date}</td>
                          <td className="px-3 py-2">{lease.lease_end_date}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(lease.monthly_lease_amount)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{lease.discount_rate_ibr}%</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{error ? '—' : formatCurrency(round2(totalPayments))}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{error ? '—' : formatCurrency(comp!.initial_liability)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{error ? '—' : `${pvPct}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </>
              )}

              {reportType === 'journal' && (() => {
                const journalRows = filteredLeases.flatMap(lease => {
                  const entries = computations[lease.lease_id]?.journals || [];
                  return entries
                    .filter(entry => {
                      if (periodFrom && isBefore(parseISO(entry.date), parseISO(periodFrom))) return false;
                      if (periodTo && isAfter(parseISO(entry.date), parseISO(periodTo))) return false;
                      return true;
                    })
                    .map(entry => ({ lease, entry }));
                });
                return (
                  <>
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="px-3 py-2 text-left font-medium">Lease Name</th>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-left font-medium">Description</th>
                        <th className="px-3 py-2 text-left font-medium">Debit Account</th>
                        <th className="px-3 py-2 text-left font-medium">Credit Account</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                        <th className="px-3 py-2 text-left font-medium">Cash Flow</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {journalRows.map(({ lease, entry }, i) => (
                        <tr key={`${lease.lease_id}-j-${i}`} className="hover:bg-muted/10">
                          <td className="px-3 py-2 font-medium">{lease.lease_name}</td>
                          <td className="px-3 py-2">{entry.date}</td>
                          <td className="px-3 py-2 text-muted-foreground">{entry.description}</td>
                          <td className="px-3 py-2">{entry.debit_account}</td>
                          <td className="px-3 py-2">{entry.credit_account}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(entry.amount)}</td>
                          <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{entry.cash_flow_classification || '—'}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                );
              })()}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

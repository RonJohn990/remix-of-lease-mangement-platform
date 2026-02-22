import { useEffect, useState } from 'react';
import { getLeases, getEntities } from '@/lib/store';
import { computeLease, generateJournalEntries, formatCurrency } from '@/lib/computations';
import { Lease, Entity, LeaseComputation } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileSpreadsheet, Loader2, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { parseISO, isAfter, isBefore, format } from 'date-fns';

type ReportType = 'schedule' | 'journal' | 'summary' | 'version_history';

export default function Reports() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [leaseTypes, setLeaseTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [leaseTypeFilter, setLeaseTypeFilter] = useState('all');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [reportType, setReportType] = useState<ReportType>('summary');

  useEffect(() => {
    const load = async () => {
      const [l, e, ltRes] = await Promise.all([
        getLeases(),
        getEntities(),
        supabase.from('lease_types').select('lease_type_name').order('created_at'),
      ]);
      setLeases(l);
      setEntities(e);
      setLeaseTypes((ltRes.data || []).map((r: any) => r.lease_type_name));
      setLoading(false);
    };
    load();
  }, []);

  const filteredLeases = leases.filter(l => {
    if (entityFilter !== 'all' && l.entity_id !== entityFilter) return false;
    if (leaseTypeFilter !== 'all' && l.lease_type !== leaseTypeFilter) return false;
    if (classificationFilter !== 'all' && l.lease_classification !== classificationFilter) return false;
    if (periodFrom && isBefore(parseISO(l.lease_end_date), parseISO(periodFrom))) return false;
    if (periodTo && isAfter(parseISO(l.lease_start_date), parseISO(periodTo))) return false;
    return true;
  });

  const getVersionInfo = (lease: Lease) => {
    const modCount = (lease.modifications || []).length;
    const currentVersion = lease.lease_version || 1;
    const amendmentDates = (lease.modifications || [])
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
      .map((m, i) => `v${i + 2}: ${m.effective_date} (${m.modification_type})`);
    return { currentVersion, modCount, amendmentDates };
  };

  const exportReport = () => {
    if (filteredLeases.length === 0) return;

    const lines: string[] = [];
    const periodLabel = periodFrom || periodTo
      ? `Period: ${periodFrom || 'Start'} to ${periodTo || 'End'}`
      : 'All Periods';

    if (reportType === 'summary') {
      lines.push('Lease Summary Report');
      lines.push(periodLabel);
      lines.push('');
      lines.push('Lease Name,Entity,Lease Type,Classification,Status,Current Version,No. of Amendments,Amendment Dates,Start Date,End Date,Monthly Amount,Discount Rate,Initial Liability,Initial ROU,Total Interest,Total Depreciation');

      for (const lease of filteredLeases) {
        const vi = getVersionInfo(lease);
        try {
          const comp = computeLease(lease);
          lines.push([
            `"${lease.lease_name}"`,
            `"${lease.legal_entity_name}"`,
            lease.lease_type,
            lease.lease_classification,
            lease.status,
            vi.currentVersion,
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
        } catch {
          lines.push([`"${lease.lease_name}"`, `"${lease.legal_entity_name}"`, lease.lease_type, lease.lease_classification, lease.status, vi.currentVersion, vi.modCount, `"${vi.amendmentDates.join('; ')}"`, lease.lease_start_date, lease.lease_end_date, lease.monthly_lease_amount, lease.discount_rate_ibr, 'Error', '', '', ''].join(','));
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
    } else if (reportType === 'schedule') {
      lines.push('Lease Schedule Report');
      lines.push(periodLabel);
      lines.push('');
      lines.push('Lease Name,Entity,Classification,Version,Period,Date,Days,Payment,Opening Liability,Interest,Closing Liability,Opening ROU,Depreciation,Closing ROU,Current Liability,Non-Current Liability');

      for (const lease of filteredLeases) {
        try {
          const comp = computeLease(lease);
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
        } catch { /* skip */ }
      }
    } else if (reportType === 'journal') {
      lines.push('Journal Entries Report');
      lines.push(periodLabel);
      lines.push('');
      lines.push('Lease Name,Entity,Classification,Version,Date,Description,Debit Account,Credit Account,Amount,Cash Flow Classification');

      for (const lease of filteredLeases) {
        try {
          const comp = computeLease(lease);
          const entries = generateJournalEntries(lease, comp);
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
        } catch { /* skip */ }
      }
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const typeLabel = reportType === 'summary' ? 'Summary' : reportType === 'schedule' ? 'Schedule' : reportType === 'version_history' ? 'VersionHistory' : 'JournalEntries';
    a.download = `IndAS116_${typeLabel}_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Preview computations for table
  const previewData = filteredLeases.map(lease => {
    try {
      const comp = computeLease(lease);
      return { lease, comp, error: false };
    } catch {
      return { lease, comp: null as LeaseComputation | null, error: true };
    }
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
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Period From</Label>
            <Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Period To</Label>
            <Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Entity</Label>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {entities.map(e => (
                  <SelectItem key={e.entity_id} value={e.entity_id}>{e.legal_entity_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Lease Type</Label>
            <Select value={leaseTypeFilter} onValueChange={setLeaseTypeFilter}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {leaseTypes.map(lt => (
                  <SelectItem key={lt} value={lt}>{lt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Classification</Label>
            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Operating">Operating</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Report Type</Label>
            <Select value={reportType} onValueChange={(v: ReportType) => setReportType(v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Lease Summary</SelectItem>
                <SelectItem value="version_history">Version History</SelectItem>
                <SelectItem value="schedule">Amortisation Schedule</SelectItem>
                <SelectItem value="journal">Journal Entries</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Preview & Download */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">
              {reportType === 'summary' ? 'Lease Summary' : reportType === 'schedule' ? 'Amortisation Schedule' : reportType === 'version_history' ? 'Version History' : 'Journal Entries'}
            </h3>
            <Badge variant="secondary" className="text-[10px]">{filteredLeases.length} leases</Badge>
          </div>
          <Button size="sm" onClick={exportReport} disabled={filteredLeases.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV
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
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="px-3 py-2 text-left font-medium">Lease Name</th>
                  <th className="px-3 py-2 text-left font-medium">Entity</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Classification</th>
                  <th className="px-3 py-2 text-center font-medium">Version</th>
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
                    <td className="px-3 py-2">
                      <Badge variant={lease.lease_classification === 'Finance' ? 'default' : 'secondary'} className="text-[10px]">
                        {lease.lease_classification}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant="outline" className="text-[10px]">v{vi.currentVersion}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {vi.modCount > 0 ? (
                        <span className="text-xs" title={vi.amendmentDates.join('\n')}>
                          {vi.modCount} amendment{vi.modCount > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={lease.status === 'Active' ? 'default' : 'destructive'} className="text-[10px]">
                        {lease.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {error ? '—' : formatCurrency(comp!.initial_liability)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {error ? '—' : formatCurrency(comp!.initial_rou)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {error ? '—' : formatCurrency(comp!.total_interest)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              {!previewData.some(d => d.error) && previewData.length > 1 && (
                <tfoot>
                  <tr className="border-t font-semibold bg-muted/20">
                    <td className="px-3 py-2" colSpan={7}>Total</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatCurrency(previewData.reduce((s, d) => s + (d.comp?.initial_liability || 0), 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatCurrency(previewData.reduce((s, d) => s + (d.comp?.initial_rou || 0), 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatCurrency(previewData.reduce((s, d) => s + (d.comp?.total_interest || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

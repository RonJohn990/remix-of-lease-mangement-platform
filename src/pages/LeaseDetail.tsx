import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lease, LeaseComputation, JournalEntry, LeaseModification } from '@/lib/types';
import { getLease, saveLease } from '@/lib/store';
import { computeLease, generateJournalEntries, formatCurrency } from '@/lib/computations';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Edit2, GitBranch, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import ModificationDialog from '@/components/ModificationDialog';

function exportCSV(headers: string[], rows: string[][], filename: string) {
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lease, setLease] = useState<Lease | null>(null);
  const [computation, setComputation] = useState<LeaseComputation | null>(null);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [error, setError] = useState('');
  const [modDialogOpen, setModDialogOpen] = useState(false);

  const loadLease = useCallback(() => {
    if (!id) return;
    const l = getLease(id);
    if (!l) { toast.error('Lease not found'); navigate('/leases'); return; }
    // Ensure modifications array exists
    if (!l.modifications) l.modifications = [];
    setLease(l);
    try {
      const comp = computeLease(l);
      setComputation(comp);
      setJournals(generateJournalEntries(l, comp));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Computation error');
    }
  }, [id, navigate]);

  useEffect(() => { loadLease(); }, [loadLease]);

  if (!lease) return null;

  const handleModification = (mod: LeaseModification) => {
    const updatedLease: Lease = {
      ...lease,
      modifications: [...(lease.modifications || []), mod],
      lease_version: lease.lease_version + 1,
    };

    if (mod.modification_type === 'EARLY_TERMINATION') {
      updatedLease.status = 'Terminated';
      updatedLease.lease_event = 'TERMINATION';
      updatedLease.lease_end_date = mod.effective_date;
    } else {
      updatedLease.lease_event = 'MODIFICATION';
      if (mod.new_lease_end_date) updatedLease.lease_end_date = mod.new_lease_end_date;
      if (mod.new_monthly_amount > 0) updatedLease.monthly_lease_amount = mod.new_monthly_amount;
      if (mod.new_discount_rate > 0) updatedLease.discount_rate_ibr = mod.new_discount_rate;
    }

    // Save and recompute
    saveLease(updatedLease);
    setModDialogOpen(false);
    loadLease();
    toast.success(mod.modification_type === 'EARLY_TERMINATION' ? 'Lease terminated' : 'Modification applied');
  };

  const handleDeleteModification = (modId: string) => {
    if (!confirm('Remove this modification? The lease will be recomputed.')) return;
    const updatedLease: Lease = {
      ...lease,
      modifications: lease.modifications.filter(m => m.modification_id !== modId),
      lease_version: Math.max(1, lease.lease_version - 1),
    };
    // Restore status if we removed a termination
    const hadTermination = lease.modifications.some(m => m.modification_id === modId && m.modification_type === 'EARLY_TERMINATION');
    if (hadTermination) {
      updatedLease.status = 'Active';
      updatedLease.lease_event = updatedLease.modifications.length > 0 ? 'MODIFICATION' : 'INITIAL';
    }
    saveLease(updatedLease);
    loadLease();
    toast.success('Modification removed');
  };

  const exportSchedule = () => {
    if (!computation) return;
    const headers = ['Period', 'Date', 'Days', 'Payment', 'Opening Liability', 'Interest', 'Closing Liability', 'Opening ROU', 'Depreciation', 'Closing ROU'];
    const rows = computation.schedule.map(r => [
      r.period.toString(), r.period_date, r.days_in_period.toString(),
      r.lease_payment.toString(), r.opening_liability.toString(), r.interest_expense.toString(),
      r.closing_liability.toString(), r.opening_rou.toString(), r.depreciation.toString(), r.closing_rou.toString(),
    ]);
    exportCSV(headers, rows, `${lease.lease_name}_schedule.csv`);
    toast.success('Schedule exported');
  };

  const exportJournals = () => {
    const headers = ['Date', 'Description', 'Debit Account', 'Credit Account', 'Amount'];
    const rows = journals.map(j => [j.date, j.description, j.debit_account, j.credit_account, j.amount.toString()]);
    exportCSV(headers, rows, `${lease.lease_name}_journals.csv`);
    toast.success('Journal entries exported');
  };

  const modifications = lease.modifications || [];
  const isTerminated = lease.status === 'Terminated';

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={() => navigate('/leases')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title mb-0">{lease.lease_name}</h1>
              <Badge variant={lease.status === 'Active' ? 'default' : 'secondary'}>{lease.status}</Badge>
              {lease.lease_version > 1 && (
                <Badge variant="outline" className="text-xs">v{lease.lease_version}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{lease.legal_entity_name} · {lease.vendor_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isTerminated && (
            <Button size="sm" variant="outline" onClick={() => setModDialogOpen(true)}>
              <GitBranch className="w-4 h-4 mr-1.5" /> Modify / Terminate
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => navigate(`/leases/${id}/edit`)}>
            <Edit2 className="w-4 h-4 mr-1.5" /> Edit
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {computation && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="stat-card">
            <p className="text-xs text-muted-foreground">Initial Liability</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(computation.initial_liability)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-muted-foreground">ROU Asset</p>
            <p className="text-lg font-bold text-accent">{formatCurrency(computation.initial_rou)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-muted-foreground">Total Interest</p>
            <p className="text-lg font-bold">{formatCurrency(computation.total_interest)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-muted-foreground">Total Depreciation</p>
            <p className="text-lg font-bold">{formatCurrency(computation.total_depreciation)}</p>
          </div>
        </div>
      )}

      {/* Modification History */}
      {modifications.length > 0 && (
        <div className="bg-card border rounded-lg p-5 mb-6">
          <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Modification History
          </h3>
          <div className="space-y-3">
            {modifications.map((mod, idx) => (
              <div key={mod.modification_id} className={`border rounded-md p-4 ${mod.modification_type === 'EARLY_TERMINATION' ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/30'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={mod.modification_type === 'EARLY_TERMINATION' ? 'destructive' : 'outline'} className="text-xs">
                        {mod.modification_type === 'EARLY_TERMINATION' && <XCircle className="w-3 h-3 mr-1" />}
                        {mod.modification_type === 'EARLY_TERMINATION' ? 'Termination' : `Modification v${idx + 2}`}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Effective: {mod.effective_date}</span>
                    </div>
                    <p className="text-sm">{mod.description}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-xs">
                      {mod.modification_type !== 'EARLY_TERMINATION' && (
                        <>
                          <div><span className="text-muted-foreground">New End Date:</span> <span className="font-medium ml-1">{mod.new_lease_end_date}</span></div>
                          <div><span className="text-muted-foreground">New Amount:</span> <span className="font-medium ml-1">{formatCurrency(mod.new_monthly_amount)}</span></div>
                          <div><span className="text-muted-foreground">Discount Rate:</span> <span className="font-medium ml-1">{mod.new_discount_rate}%</span></div>
                        </>
                      )}
                      {mod.modification_type === 'EARLY_TERMINATION' && mod.termination_penalty > 0 && (
                        <div><span className="text-muted-foreground">Penalty:</span> <span className="font-medium ml-1">{formatCurrency(mod.termination_penalty)}</span></div>
                      )}
                      {mod.modification_type === 'SCOPE_DECREASE' && (
                        <div><span className="text-muted-foreground">Scope Decrease:</span> <span className="font-medium ml-1">{mod.scope_decrease_percentage}%</span></div>
                      )}
                      {mod.gain_loss !== 0 && (
                        <div>
                          <span className="text-muted-foreground">Gain/Loss:</span>
                          <span className={`font-medium ml-1 ${mod.gain_loss > 0 ? 'text-success' : 'text-destructive'}`}>
                            {mod.gain_loss > 0 ? '+' : ''}{formatCurrency(mod.gain_loss)}
                          </span>
                        </div>
                      )}
                      {mod.liability_adjustment !== 0 && (
                        <div><span className="text-muted-foreground">Liab. Adj:</span> <span className="font-medium ml-1">{formatCurrency(mod.liability_adjustment)}</span></div>
                      )}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0" onClick={() => handleDeleteModification(mod.modification_id)}>
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lease details */}
      <div className="bg-card border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-primary mb-3">Lease Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 text-sm">
          <div><span className="text-muted-foreground">Start Date:</span> <span className="ml-1 font-medium">{lease.lease_start_date}</span></div>
          <div><span className="text-muted-foreground">End Date:</span> <span className="ml-1 font-medium">{lease.lease_end_date}</span></div>
          <div><span className="text-muted-foreground">Commencement:</span> <span className="ml-1 font-medium">{lease.rent_commencement_date}</span></div>
          <div><span className="text-muted-foreground">Frequency:</span> <span className="ml-1 font-medium">{lease.payment_frequency}</span></div>
          <div><span className="text-muted-foreground">Monthly Amount:</span> <span className="ml-1 font-medium">{formatCurrency(lease.monthly_lease_amount)}</span></div>
          <div><span className="text-muted-foreground">Discount Rate:</span> <span className="ml-1 font-medium">{lease.discount_rate_ibr}%</span></div>
          <div><span className="text-muted-foreground">Security Deposit:</span> <span className="ml-1 font-medium">{formatCurrency(lease.security_deposit)}</span></div>
          <div><span className="text-muted-foreground">Initial Direct Cost:</span> <span className="ml-1 font-medium">{formatCurrency(lease.initial_direct_cost)}</span></div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {computation && (
        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule">Amortization Schedule</TabsTrigger>
            <TabsTrigger value="journals">Journal Entries</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule">
            <div className="data-table-container">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="text-sm font-medium">Liability & ROU Schedule {modifications.length > 0 && `(${modifications.length} modification${modifications.length > 1 ? 's' : ''} applied)`}</span>
                <Button size="sm" variant="outline" onClick={exportSchedule}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Days</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Payment</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Open Liab.</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Interest</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Close Liab.</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Open ROU</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Depreciation</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Close ROU</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {computation.schedule.map(row => (
                      <>
                        <tr key={row.period} className={`hover:bg-muted/30 ${row.is_modification_point ? 'bg-warning/5' : ''}`}>
                          <td className="px-3 py-2">{row.period}</td>
                          <td className="px-3 py-2">{row.period_date}</td>
                          <td className="px-3 py-2 text-right">{row.days_in_period}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.lease_payment)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.opening_liability)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.interest_expense)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.closing_liability)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.opening_rou)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.depreciation)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.closing_rou)}</td>
                        </tr>
                        {row.is_modification_point && (
                          <tr key={`mod-${row.period}`} className="bg-warning/10 border-y border-warning/30">
                            <td colSpan={10} className="px-3 py-1.5 text-xs font-medium text-warning flex items-center gap-1.5">
                              <GitBranch className="w-3 h-3" /> {row.modification_label}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="journals">
            <div className="data-table-container">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="text-sm font-medium">Journal Entries</span>
                <Button size="sm" variant="outline" onClick={exportJournals}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Debit</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Credit</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {journals.map((j, idx) => (
                      <tr key={idx} className={`hover:bg-muted/30 ${j.description.includes('Modification') || j.description.includes('Termination') ? 'bg-warning/5' : ''}`}>
                        <td className="px-3 py-2">{j.date}</td>
                        <td className="px-3 py-2">{j.description}</td>
                        <td className="px-3 py-2 font-medium">{j.debit_account}</td>
                        <td className="px-3 py-2 font-medium">{j.credit_account}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(j.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Modification Dialog */}
      <ModificationDialog
        open={modDialogOpen}
        onClose={() => setModDialogOpen(false)}
        onSave={handleModification}
        currentEndDate={lease.lease_end_date}
        currentMonthlyAmount={lease.monthly_lease_amount}
        currentDiscountRate={lease.discount_rate_ibr}
      />
    </div>
  );
}

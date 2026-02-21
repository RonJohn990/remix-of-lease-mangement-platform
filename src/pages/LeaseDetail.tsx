import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lease, LeaseComputation, JournalEntry } from '@/lib/types';
import { getLease } from '@/lib/store';
import { computeLease, generateJournalEntries, formatCurrency } from '@/lib/computations';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Edit2, FileText } from 'lucide-react';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (!id) return;
    const l = getLease(id);
    if (!l) { toast.error('Lease not found'); navigate('/leases'); return; }
    setLease(l);
    try {
      const comp = computeLease(l);
      setComputation(comp);
      setJournals(generateJournalEntries(l, comp));
    } catch (e: any) {
      setError(e.message || 'Computation error');
    }
  }, [id]);

  if (!lease) return null;

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
            </div>
            <p className="text-sm text-muted-foreground">{lease.legal_entity_name} · {lease.vendor_name}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate(`/leases/${id}/edit`)}>
          <Edit2 className="w-4 h-4 mr-1.5" /> Edit
        </Button>
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
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6 text-destructive text-sm">{error}</div>
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
                <span className="text-sm font-medium">Liability & ROU Schedule</span>
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
                      <tr key={row.period} className="hover:bg-muted/30">
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
                      <tr key={idx} className="hover:bg-muted/30">
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
    </div>
  );
}

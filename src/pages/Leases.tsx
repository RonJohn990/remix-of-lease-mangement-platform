import { useEffect, useState } from 'react';
import { Lease } from '@/lib/types';
import { getLeases, deleteLease } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Eye, Edit2, FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { safeErrorMessage } from '@/lib/safeError';
import { formatCurrency } from '@/lib/computations';
import BulkImportDialog from '@/components/BulkImportDialog';

export default function Leases() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const navigate = useNavigate();

  const reload = async () => {
    const data = await getLeases();
    setLeases(data);
  };

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  const filtered = leases.filter(l =>
    l.lease_name.toLowerCase().includes(search.toLowerCase()) ||
    l.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
    l.legal_entity_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (confirm('Delete this lease and all its data?')) {
      try {
        await deleteLease(id);
        await reload();
        toast.success('Lease deleted');
      } catch (e: any) { toast.error(safeErrorMessage(e, 'Failed to delete lease')); }
    }
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
          <h1 className="page-title">Lease Management</h1>
          <p className="text-sm text-muted-foreground">View and manage all leases</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload className="w-4 h-4 mr-1.5" /> Bulk Import
          </Button>
          <Button size="sm" onClick={() => navigate('/leases/new')}>
            <Plus className="w-4 h-4 mr-1.5" /> New Lease
          </Button>
        </div>
      </div>

      <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} onComplete={reload} />

      <div className="data-table-container">
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search leases..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {leases.length === 0 ? 'No leases created yet.' : 'No leases match your search.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Lease Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Entity</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Vendor</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Start</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">End</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Monthly Amt</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Frequency</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(lease => (
                  <tr key={lease.lease_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{lease.lease_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{lease.legal_entity_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{lease.vendor_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{lease.lease_start_date}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{lease.lease_end_date}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(lease.monthly_lease_amount)}</td>
                    <td className="px-4 py-2.5">{lease.payment_frequency}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={lease.status === 'Active' ? 'default' : 'secondary'}>
                        {lease.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/leases/${lease.lease_id}`)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/leases/${lease.lease_id}/edit`)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(lease.lease_id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

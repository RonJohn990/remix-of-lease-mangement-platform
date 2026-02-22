import { useEffect, useState } from 'react';
import { getDashboardStats } from '@/lib/store';
import { formatCurrency } from '@/lib/computations';
import { DashboardStats } from '@/lib/types';
import { Building2, FileText, TrendingUp, Landmark, Building, Users, Loader2 } from 'lucide-react';

const statCards = [
  { key: 'total_groups' as const, label: 'Corporate Groups', icon: Building, color: 'text-primary' },
  { key: 'total_entities' as const, label: 'Legal Entities', icon: Building2, color: 'text-accent' },
  { key: 'total_leases' as const, label: 'Total Leases', icon: FileText, color: 'text-info' },
  { key: 'active_leases' as const, label: 'Active Leases', icon: TrendingUp, color: 'text-success' },
];

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-container flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!stats) return null;

  return (
    <div className="page-container animate-fade-in">
      <h1 className="page-title">UB Lease Portfolio Overview</h1>
      <p className="page-subtitle">IFRS 16 / Ind AS 116 Lease Management</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="stat-card flex items-center gap-4">
            <div className={`p-2.5 rounded-lg bg-muted ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats[key]}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-2">
            <Landmark className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Total Lease Liability</span>
          </div>
          <p className="text-3xl font-bold text-primary">{formatCurrency(stats.total_liability)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-accent" />
            <span className="text-sm font-medium text-muted-foreground">Total ROU Assets</span>
          </div>
          <p className="text-3xl font-bold text-accent">{formatCurrency(stats.total_rou)}</p>
        </div>
      </div>

      {stats.total_leases === 0 && (
        <div className="bg-card border rounded-lg p-8 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1">No leases yet</h3>
          <p className="text-sm text-muted-foreground">
            Start by creating a Corporate Group, then add Entities and Leases.
          </p>
        </div>
      )}
    </div>
  );
}

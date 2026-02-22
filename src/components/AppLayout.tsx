import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, LayoutDashboard, FileText, Building, ChevronLeft, ChevronRight, Users, Database, LogOut, FileBarChart } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const mainItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leases', icon: FileText, label: 'Leases' },
  { to: '/disclosures', icon: FileBarChart, label: 'Disclosures' },
];

const masterDataItems = [
  { to: '/master/users', icon: Users, label: 'Users', adminOnly: true },
  { to: '/master/groups', icon: Building, label: 'Corporate Groups' },
  { to: '/master/entities', icon: Building2, label: 'Entities' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const visibleMasterItems = masterDataItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={`bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border">
          <Building className="w-6 h-6 text-sidebar-primary shrink-0" />
          {!collapsed && (
            <span className="font-bold text-sm text-sidebar-accent-foreground tracking-wide">
              IFRS 16 / Ind AS 116
            </span>
          )}
        </div>

        <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
          {mainItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`
              }
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}

          {/* Master Data section */}
          {!collapsed && (
            <div className="pt-4 pb-1 px-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Master Data
              </span>
            </div>
          )}
          {collapsed && <div className="border-t border-sidebar-border my-2" />}

          {visibleMasterItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`
              }
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User info + sign out */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          {!collapsed && user && (
            <div className="px-3 py-1.5 text-xs text-sidebar-muted truncate">
              {user.email}
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center h-8 w-full text-sidebar-muted hover:text-sidebar-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  );
}

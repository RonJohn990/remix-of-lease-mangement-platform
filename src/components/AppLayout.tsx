import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, LayoutDashboard, FileText, ChevronLeft, ChevronRight, Users, Database, LogOut, FileBarChart, Settings, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

const mainItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leases', icon: FileText, label: 'Leases' },
  { to: '/disclosures', icon: FileBarChart, label: 'Disclosures' },
  { to: '/reports', icon: FileSpreadsheet, label: 'Reports' },
];

const masterDataItems = [
  { to: '/master/users', icon: Users, label: 'Users', adminOnly: true },
  { to: '/master/groups', icon: Building2, label: 'Corporate Groups' },
  { to: '/master/entities', icon: Building2, label: 'Entities' },
  { to: '/master/config', icon: Settings, label: 'Configuration', adminOnly: true },
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
      {/* Sidebar */}
      <aside
        className={`bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo area */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border">
          <div className="h-7 w-7 rounded bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-xs">EY</span>
          </div>
          {!collapsed && (
            <span className="font-bold text-sm text-sidebar-accent-foreground tracking-tight leading-tight">
              Lease Manager
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {mainItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}

          {/* Section divider */}
          {!collapsed && (
            <div className="pt-5 pb-1.5 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Master Data
              </span>
            </div>
          )}
          {collapsed && <div className="border-t border-sidebar-border my-3" />}

          {visibleMasterItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-2 space-y-0.5">
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
            className="flex items-center justify-center h-7 w-full text-sidebar-muted hover:text-sidebar-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  );
}

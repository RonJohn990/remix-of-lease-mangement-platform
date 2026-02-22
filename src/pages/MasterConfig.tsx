import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Edit2, Loader2, Car, Building2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface MasterItem {
  id: string;
  name: string;
}

interface WorkflowRole {
  id: string;
  role_name: string;
  description: string;
}

export default function MasterConfig() {
  const { isAdmin } = useAuth();
  const [leaseTypes, setLeaseTypes] = useState<MasterItem[]>([]);
  const [assetLocations, setAssetLocations] = useState<MasterItem[]>([]);
  const [workflowRoles, setWorkflowRoles] = useState<WorkflowRole[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state for lease types / asset locations
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'lease_type' | 'asset_location'>('lease_type');
  const [editItem, setEditItem] = useState<MasterItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [saving, setSaving] = useState(false);

  // Dialog state for workflow roles
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<WorkflowRole | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');

  const reload = async () => {
    const [ltRes, alRes, wrRes] = await Promise.all([
      supabase.from('lease_types').select('*').order('created_at', { ascending: true }),
      supabase.from('asset_locations').select('*').order('created_at', { ascending: true }),
      supabase.from('workflow_roles').select('*').order('created_at', { ascending: true }),
    ]);
    setLeaseTypes((ltRes.data || []).map((r: any) => ({ id: r.id, name: r.lease_type_name })));
    setAssetLocations((alRes.data || []).map((r: any) => ({ id: r.id, name: r.location_name })));
    setWorkflowRoles((wrRes.data || []).map((r: any) => ({ id: r.id, role_name: r.role_name, description: r.description })));
  };

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  const openAdd = (type: 'lease_type' | 'asset_location') => {
    setDialogType(type);
    setEditItem(null);
    setItemName('');
    setDialogOpen(true);
  };

  const openEdit = (type: 'lease_type' | 'asset_location', item: MasterItem) => {
    setDialogType(type);
    setEditItem(item);
    setItemName(item.name);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!itemName.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (dialogType === 'lease_type') {
        if (editItem) {
          await supabase.from('lease_types').update({ lease_type_name: itemName.trim() }).eq('id', editItem.id);
        } else {
          await supabase.from('lease_types').insert({ lease_type_name: itemName.trim() });
        }
      } else {
        if (editItem) {
          await supabase.from('asset_locations').update({ location_name: itemName.trim() }).eq('id', editItem.id);
        } else {
          await supabase.from('asset_locations').insert({ location_name: itemName.trim() });
        }
      }
      setDialogOpen(false);
      await reload();
      toast.success('Saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (type: 'lease_type' | 'asset_location', id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      if (type === 'lease_type') {
        await supabase.from('lease_types').delete().eq('id', id);
      } else {
        await supabase.from('asset_locations').delete().eq('id', id);
      }
      await reload();
      toast.success('Deleted');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  // Workflow role handlers
  const openAddRole = () => {
    setEditRole(null);
    setRoleName('');
    setRoleDesc('');
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: WorkflowRole) => {
    setEditRole(role);
    setRoleName(role.role_name);
    setRoleDesc(role.description);
    setRoleDialogOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleName.trim()) { toast.error('Role name is required'); return; }
    setSaving(true);
    try {
      if (editRole) {
        const { error } = await supabase.from('workflow_roles').update({ role_name: roleName.trim(), description: roleDesc.trim() }).eq('id', editRole.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('workflow_roles').insert({ role_name: roleName.trim(), description: roleDesc.trim() });
        if (error) throw error;
      }
      setRoleDialogOpen(false);
      await reload();
      toast.success('Saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save role');
    } finally { setSaving(false); }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm('Delete this user role?')) return;
    try {
      const { error } = await supabase.from('workflow_roles').delete().eq('id', id);
      if (error) throw error;
      await reload();
      toast.success('Deleted');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  if (!isAdmin) {
    return (
      <div className="page-container flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">You do not have permission to access this page.</p>
      </div>
    );
  }

  if (loading) return (
    <div className="page-container flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  const renderList = (type: 'lease_type' | 'asset_location', items: MasterItem[], icon: React.ReactNode) => (
    <div className="space-y-2">
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => openAdd(type)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add {type === 'lease_type' ? 'Lease Type' : 'Asset Location'}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">No items defined yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-card border rounded-lg flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                {icon}
                <span className="font-medium text-sm">{item.name}</span>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(type, item)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(type, item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6">
        <h1 className="page-title">Configuration</h1>
        <p className="text-sm text-muted-foreground">Define lease types, asset locations, and user roles</p>
      </div>

      <Tabs defaultValue="lease_types">
        <TabsList>
          <TabsTrigger value="lease_types">Lease Types</TabsTrigger>
          <TabsTrigger value="asset_locations">Asset Locations</TabsTrigger>
          <TabsTrigger value="workflow_roles">User Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="lease_types">
          {renderList('lease_type', leaseTypes, <Car className="w-4 h-4 text-primary" />)}
        </TabsContent>
        <TabsContent value="asset_locations">
          {renderList('asset_location', assetLocations, <Building2 className="w-4 h-4 text-accent" />)}
        </TabsContent>
        <TabsContent value="workflow_roles">
          <div className="space-y-2">
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={openAddRole}>
                <Plus className="w-4 h-4 mr-1.5" /> Add User Role
              </Button>
            </div>
            {workflowRoles.length === 0 ? (
              <div className="bg-card border rounded-lg p-8 text-center">
                <p className="text-sm text-muted-foreground">No user roles defined yet. Add one to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {workflowRoles.map(role => (
                  <div key={role.id} className="bg-card border rounded-lg flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <div>
                        <span className="font-medium text-sm">{role.role_name}</span>
                        {role.description && (
                          <p className="text-xs text-muted-foreground">{role.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditRole(role)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteRole(role.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Lease Type / Asset Location Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editItem ? 'Edit' : 'Add'} {dialogType === 'lease_type' ? 'Lease Type' : 'Asset Location'}
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder={dialogType === 'lease_type' ? 'e.g. Building, Vehicle, Equipment' : 'e.g. Head Office, Godown, Branch'}
            value={itemName}
            onChange={e => setItemName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflow Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editRole ? 'Edit' : 'Add'} User Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Role Name *</Label>
              <Input placeholder="e.g. Approver, Reviewer, Checker" value={roleName} onChange={e => setRoleName(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea placeholder="What this role does in workflows" value={roleDesc} onChange={e => setRoleDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRole} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

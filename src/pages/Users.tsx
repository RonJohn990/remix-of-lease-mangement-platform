import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users as UsersIcon, Plus, Trash2, Shield, Loader2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { safeErrorMessage } from '@/lib/safeError';
import { CorporateGroup, Entity } from '@/lib/types';
import { getGroups, getEntities } from '@/lib/store';

interface UserProfile {
  user_id: string;
  full_name: string;
  email: string;
  roles: string[];
}

interface Assignment {
  id: string;
  user_id: string;
  corporate_id: string;
  entity_id: string | null;
}

export default function Users() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<CorporateGroup[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // New user dialog
  const [showNewUser, setShowNewUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<string>('viewer');
  const [saving, setSaving] = useState(false);

  // Assignment dialog
  const [showAssign, setShowAssign] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignGroupId, setAssignGroupId] = useState('');
  const [assignEntityId, setAssignEntityId] = useState('');

  // Role edit dialog
  const [showRoleEdit, setShowRoleEdit] = useState(false);
  const [roleEditUserId, setRoleEditUserId] = useState('');
  const [roleEditValue, setRoleEditValue] = useState<string>('viewer');
  const reload = async () => {
    const [profilesRes, rolesRes, groupsData, entitiesData, assignRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('user_roles').select('*'),
      getGroups(),
      getEntities(),
      supabase.from('user_entity_assignments').select('*'),
    ]);

    const profiles = profilesRes.data || [];
    const roles = rolesRes.data || [];
    const merged: UserProfile[] = profiles.map((p: any) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      roles: roles.filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role),
    }));

    setUsers(merged);
    setGroups(groupsData);
    setEntities(entitiesData);
    setAssignments((assignRes.data || []).map((a: any) => ({
      id: a.id,
      user_id: a.user_id,
      corporate_id: a.corporate_id,
      entity_id: a.entity_id,
    })));
  };

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || !newName) {
      toast.error('All fields are required');
      return;
    }
    setSaving(true);
    try {
      // Use edge function to create user (admin-only)
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email: newEmail, password: newPassword, full_name: newName, role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShowNewUser(false);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('viewer');
      await reload();
      toast.success('User created successfully');
    } catch (e: any) {
      toast.error(safeErrorMessage(e, 'Failed to create user'));
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!assignUserId || !assignGroupId) {
      toast.error('Select user and group');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('user_entity_assignments').insert({
        user_id: assignUserId,
        corporate_id: assignGroupId,
        entity_id: assignEntityId || null,
      });
      if (error) throw error;
      setShowAssign(false);
      setAssignUserId('');
      setAssignGroupId('');
      setAssignEntityId('');
      await reload();
      toast.success('Assignment added');
    } catch (e: any) {
      toast.error(safeErrorMessage(e, 'Failed to assign'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    try {
      await supabase.from('user_entity_assignments').delete().eq('id', id);
      await reload();
      toast.success('Assignment removed');
    } catch (e: any) {
      toast.error(safeErrorMessage(e, 'Failed to remove assignment'));
    }
  };

  const openRoleEdit = (user: UserProfile) => {
    setRoleEditUserId(user.user_id);
    setRoleEditValue(user.roles[0] || 'viewer');
    setShowRoleEdit(true);
  };

  const handleRoleChange = async () => {
    setSaving(true);
    try {
      // Delete existing roles for user
      await supabase.from('user_roles').delete().eq('user_id', roleEditUserId);
      // Insert new role
      const { error } = await supabase.from('user_roles').insert({ user_id: roleEditUserId, role: roleEditValue as any });
      if (error) throw error;
      setShowRoleEdit(false);
      await reload();
      toast.success('Role updated');
    } catch (e: any) {
      toast.error(safeErrorMessage(e, 'Failed to update role'));
    } finally { setSaving(false); }
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'lease_creator': return 'default';
      case 'viewer': return 'secondary';
      default: return 'outline';
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

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="text-sm text-muted-foreground">Register users and assign access to groups & entities</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}>
            <Shield className="w-4 h-4 mr-1.5" /> Assign Access
          </Button>
          <Button size="sm" onClick={() => setShowNewUser(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Register User
          </Button>
        </div>
      </div>

      {/* Users list */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-5 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground">Roles</th>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map(u => {
              const userAssignments = assignments.filter(a => a.user_id === u.user_id);
              return (
                <tr key={u.user_id}>
                  <td className="px-5 py-3 font-medium">{u.full_name || '—'}</td>
                  <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1 flex-wrap items-center">
                      {u.roles.length ? u.roles.map(r => (
                        <Badge key={r} variant={roleColor(r) as any} className="text-xs">{r}</Badge>
                      )) : <span className="text-muted-foreground text-xs">No role</span>}
                      <Button size="icon" variant="ghost" className="h-6 w-6 ml-1" onClick={() => openRoleEdit(u)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {userAssignments.map(a => {
                        const group = groups.find(g => g.corporate_id === a.corporate_id);
                        const entity = a.entity_id ? entities.find(e => e.entity_id === a.entity_id) : null;
                        return (
                          <Badge key={a.id} variant="outline" className="text-xs gap-1">
                            {group?.corporate_group_name}{entity ? ` / ${entity.legal_entity_name}` : ' (all)'}
                            <button onClick={() => handleRemoveAssignment(a.id)} className="ml-1 hover:text-destructive">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </Badge>
                        );
                      })}
                      {userAssignments.length === 0 && <span className="text-xs text-muted-foreground">No access</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No users yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* New User Dialog */}
      <Dialog open={showNewUser} onOpenChange={setShowNewUser}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register New User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} />
            <Input placeholder="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            <Input placeholder="Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="lease_creator">Lease Creator</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewUser(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={saving}>{saving ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Access Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Entity Access</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assignGroupId} onValueChange={v => { setAssignGroupId(v); setAssignEntityId(''); }}>
              <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectItem key={g.corporate_id} value={g.corporate_id}>{g.corporate_group_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assignEntityId} onValueChange={setAssignEntityId}>
              <SelectTrigger><SelectValue placeholder="All entities (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All entities in group</SelectItem>
                {entities.filter(e => e.corporate_id === assignGroupId).map(e => (
                  <SelectItem key={e.entity_id} value={e.entity_id}>{e.legal_entity_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving}>{saving ? 'Assigning...' : 'Assign'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={showRoleEdit} onOpenChange={setShowRoleEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change System Role</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              User: {users.find(u => u.user_id === roleEditUserId)?.full_name || users.find(u => u.user_id === roleEditUserId)?.email}
            </p>
            <Select value={roleEditValue} onValueChange={setRoleEditValue}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="lease_creator">Lease Creator</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleEdit(false)}>Cancel</Button>
            <Button onClick={handleRoleChange} disabled={saving}>{saving ? 'Saving...' : 'Update Role'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { CorporateGroup, Entity } from '@/lib/types';
import { getGroups, getEntities, saveGroup, saveEntity, deleteGroup, deleteEntity, generateId } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Building2, Building, Plus, Trash2, Edit2, Loader2, MapPin, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { safeErrorMessage } from '@/lib/safeError';
import { useLocation } from 'react-router-dom';

interface UserProfile {
  user_id: string;
  full_name: string;
  email: string;
}

interface Assignment {
  id: string;
  user_id: string;
  entity_id: string | null;
  corporate_id: string;
}

export default function Entities() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const isGroupsView = location.pathname === '/master/groups';

  const [groups, setGroups] = useState<CorporateGroup[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupDialog, setGroupDialog] = useState(false);
  const [entityDialog, setEntityDialog] = useState(false);
  const [editGroup, setEditGroup] = useState<CorporateGroup | null>(null);
  const [editEntity, setEditEntity] = useState<Entity | null>(null);
  const [groupName, setGroupName] = useState('');

  // Entity form state
  const [entityName, setEntityName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [entityAddress, setEntityAddress] = useState('');
  const [entityLocation, setEntityLocation] = useState('');
  const [entityPinCode, setEntityPinCode] = useState('');
  const [entityFYStart, setEntityFYStart] = useState('04-01');
  const [entityFYEnd, setEntityFYEnd] = useState('03-31');
  const [saving, setSaving] = useState(false);

  // User assignment state (admin only)
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignEntityId, setAssignEntityId] = useState('');
  const [assignEntityName, setAssignEntityName] = useState('');
  const [assignUserId, setAssignUserId] = useState('');

  const reload = async () => {
    const [g, e] = await Promise.all([getGroups(), getEntities()]);
    setGroups(g);
    setEntities(e);
    if (isAdmin) {
      const [profilesRes, assignRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, email'),
        supabase.from('user_entity_assignments').select('*'),
      ]);
      setUsers((profilesRes.data || []).map((p: any) => ({ user_id: p.user_id, full_name: p.full_name, email: p.email })));
      setAssignments((assignRes.data || []).map((a: any) => ({ id: a.id, user_id: a.user_id, entity_id: a.entity_id, corporate_id: a.corporate_id })));
    }
  };

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  const handleSaveGroup = async () => {
    if (!groupName.trim()) { toast.error('Group name is required'); return; }
    setSaving(true);
    try {
      await saveGroup({
        corporate_id: editGroup?.corporate_id || generateId(),
        corporate_group_name: groupName.trim(),
        created_at: editGroup?.created_at || new Date().toISOString(),
      });
      setGroupDialog(false);
      setEditGroup(null);
      setGroupName('');
      await reload();
      toast.success('Corporate group saved');
    } catch (e: any) {
      toast.error(safeErrorMessage(e, 'Failed to save'));
    } finally { setSaving(false); }
  };

  const handleSaveEntity = async () => {
    if (!entityName.trim() || !selectedGroupId) { toast.error('Name and group are required'); return; }
    setSaving(true);
    try {
      await saveEntity({
        entity_id: editEntity?.entity_id || generateId(),
        corporate_id: selectedGroupId,
        legal_entity_name: entityName.trim(),
        address: entityAddress,
        location: entityLocation,
        pin_code: entityPinCode,
        financial_year_start: entityFYStart,
        financial_year_end: entityFYEnd,
        created_at: editEntity?.created_at || new Date().toISOString(),
      });
      setEntityDialog(false);
      resetEntityForm();
      await reload();
      toast.success('Entity saved');
    } catch (e: any) {
      toast.error(safeErrorMessage(e, 'Failed to save'));
    } finally { setSaving(false); }
  };

  const resetEntityForm = () => {
    setEditEntity(null);
    setEntityName('');
    setSelectedGroupId('');
    setEntityAddress('');
    setEntityLocation('');
    setEntityPinCode('');
    setEntityFYStart('04-01');
    setEntityFYEnd('03-31');
  };

  const handleDeleteGroup = async (id: string) => {
    if (confirm('Delete this group and all its entities/leases?')) {
      try {
        await deleteGroup(id);
        await reload();
        toast.success('Group deleted');
      } catch (e: any) { toast.error(safeErrorMessage(e, 'Failed to delete group')); }
    }
  };

  const handleDeleteEntity = async (id: string) => {
    if (confirm('Delete this entity and all its leases?')) {
      try {
        await deleteEntity(id);
        await reload();
        toast.success('Entity deleted');
      } catch (e: any) { toast.error(safeErrorMessage(e, 'Failed to delete entity')); }
    }
  };

  const openEditGroup = (g: CorporateGroup) => {
    setEditGroup(g);
    setGroupName(g.corporate_group_name);
    setGroupDialog(true);
  };

  const openEditEntity = (e: Entity) => {
    setEditEntity(e);
    setEntityName(e.legal_entity_name);
    setSelectedGroupId(e.corporate_id);
    setEntityAddress(e.address);
    setEntityLocation(e.location);
    setEntityPinCode(e.pin_code);
    setEntityFYStart(e.financial_year_start);
    setEntityFYEnd(e.financial_year_end);
    setEntityDialog(true);
  };

  const openAssignUsers = (entity: Entity) => {
    setAssignEntityId(entity.entity_id);
    setAssignEntityName(entity.legal_entity_name);
    setAssignUserId('');
    setAssignDialog(true);
  };

  const handleAssignUser = async () => {
    if (!assignUserId) { toast.error('Select a user'); return; }
    const entity = entities.find(e => e.entity_id === assignEntityId);
    if (!entity) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('user_entity_assignments').insert({
        user_id: assignUserId,
        corporate_id: entity.corporate_id,
        entity_id: assignEntityId,
      });
      if (error) throw error;
      await reload();
      toast.success('User assigned to entity');
    } catch (e: any) {
      toast.error(safeErrorMessage(e, 'Failed to assign'));
    } finally { setSaving(false); }
  };

  const handleRemoveEntityAssignment = async (assignmentId: string) => {
    try {
      await supabase.from('user_entity_assignments').delete().eq('id', assignmentId);
      await reload();
      toast.success('Assignment removed');
    } catch (e: any) { toast.error(safeErrorMessage(e, 'Failed to remove assignment')); }
  };

  const getEntityAssignments = (entityId: string) => 
    assignments.filter(a => a.entity_id === entityId);

  if (loading) return (
    <div className="page-container flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">{isGroupsView ? 'Corporate Groups' : 'Legal Entities'}</h1>
          <p className="text-sm text-muted-foreground">
            {isGroupsView ? 'Manage corporate group structure' : 'Manage legal entities and their details'}
          </p>
        </div>
        <div className="flex gap-2">
          {isGroupsView ? (
            <Button size="sm" onClick={() => { setEditGroup(null); setGroupName(''); setGroupDialog(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Group
            </Button>
          ) : (
            <Button size="sm" onClick={() => { resetEntityForm(); setEntityDialog(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Entity
            </Button>
          )}
        </div>
      </div>

      {isGroupsView ? (
        /* Groups View */
        groups.length === 0 ? (
          <div className="bg-card border rounded-lg p-8 text-center">
            <Building className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No corporate groups</h3>
            <p className="text-sm text-muted-foreground">Create a corporate group to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => {
              const count = entities.filter(e => e.corporate_id === group.corporate_id).length;
              return (
                <div key={group.corporate_id} className="bg-card border rounded-lg flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Building className="w-5 h-5 text-primary" />
                    <div>
                      <span className="font-semibold text-sm">{group.corporate_group_name}</span>
                      <p className="text-xs text-muted-foreground">{count} entities</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditGroup(group)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteGroup(group.corporate_id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Entities View */
        entities.length === 0 ? (
          <div className="bg-card border rounded-lg p-8 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No entities</h3>
            <p className="text-sm text-muted-foreground">Create a legal entity to get started.</p>
          </div>
        ) : (
          <div className="bg-card border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Entity</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Group</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Location</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Financial Year</th>
                  {isAdmin && <th className="text-left px-5 py-3 font-medium text-muted-foreground">Assigned Users</th>}
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entities.map(entity => {
                  const group = groups.find(g => g.corporate_id === entity.corporate_id);
                  return (
                    <tr key={entity.entity_id}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-accent shrink-0" />
                          <span className="font-medium">{entity.legal_entity_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{group?.corporate_group_name || '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{entity.location || entity.address || '—'}</span>
                          {entity.pin_code && <span className="text-xs">({entity.pin_code})</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {entity.financial_year_start} to {entity.financial_year_end}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-3">
                          <div className="flex gap-1 flex-wrap items-center">
                            {getEntityAssignments(entity.entity_id).map(a => {
                              const user = users.find(u => u.user_id === a.user_id);
                              return (
                                <Badge key={a.id} variant="outline" className="text-xs gap-1">
                                  {user?.full_name || user?.email || 'Unknown'}
                                  <button onClick={() => handleRemoveEntityAssignment(a.id)} className="ml-0.5 hover:text-destructive">
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                </Badge>
                              );
                            })}
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openAssignUsers(entity)}>
                              <UserPlus className="w-3.5 h-3.5 text-primary" />
                            </Button>
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditEntity(entity)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteEntity(entity.entity_id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Group Dialog */}
      <Dialog open={groupDialog} onOpenChange={setGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editGroup ? 'Edit' : 'New'} Corporate Group</DialogTitle>
          </DialogHeader>
          <Input placeholder="Group name" value={groupName} onChange={e => setGroupName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entity Dialog */}
      <Dialog open={entityDialog} onOpenChange={setEntityDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editEntity ? 'Edit' : 'New'} Legal Entity</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger><SelectValue placeholder="Select corporate group" /></SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectItem key={g.corporate_id} value={g.corporate_id}>{g.corporate_group_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Entity name" value={entityName} onChange={e => setEntityName(e.target.value)} />
            <Input placeholder="Address" value={entityAddress} onChange={e => setEntityAddress(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Location / City" value={entityLocation} onChange={e => setEntityLocation(e.target.value)} />
              <Input placeholder="Pin code" value={entityPinCode} onChange={e => setEntityPinCode(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">FY Start (MM-DD)</label>
                <Input placeholder="04-01" value={entityFYStart} onChange={e => setEntityFYStart(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">FY End (MM-DD)</label>
                <Input placeholder="03-31" value={entityFYEnd} onChange={e => setEntityFYEnd(e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntityDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEntity} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign User to Entity Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign User to {assignEntityName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {users
                  .filter(u => !getEntityAssignments(assignEntityId).some(a => a.user_id === u.user_id))
                  .map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.full_name || u.email}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignUser} disabled={saving}>{saving ? 'Assigning...' : 'Assign'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

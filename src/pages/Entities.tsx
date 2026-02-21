import { useEffect, useState } from 'react';
import { CorporateGroup, Entity } from '@/lib/types';
import { getGroups, getEntities, saveGroup, saveEntity, deleteGroup, deleteEntity, generateId } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Building, Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Entities() {
  const [groups, setGroups] = useState<CorporateGroup[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [groupDialog, setGroupDialog] = useState(false);
  const [entityDialog, setEntityDialog] = useState(false);
  const [editGroup, setEditGroup] = useState<CorporateGroup | null>(null);
  const [editEntity, setEditEntity] = useState<Entity | null>(null);
  const [groupName, setGroupName] = useState('');
  const [entityName, setEntityName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const reload = () => {
    setGroups(getGroups());
    setEntities(getEntities());
  };

  useEffect(() => { reload(); }, []);

  const handleSaveGroup = () => {
    if (!groupName.trim()) { toast.error('Group name is required'); return; }
    saveGroup({
      corporate_id: editGroup?.corporate_id || generateId(),
      corporate_group_name: groupName.trim(),
      created_at: editGroup?.created_at || new Date().toISOString(),
    });
    setGroupDialog(false);
    setEditGroup(null);
    setGroupName('');
    reload();
    toast.success('Corporate group saved');
  };

  const handleSaveEntity = () => {
    if (!entityName.trim() || !selectedGroupId) { toast.error('All fields are required'); return; }
    saveEntity({
      entity_id: editEntity?.entity_id || generateId(),
      corporate_id: selectedGroupId,
      legal_entity_name: entityName.trim(),
      created_at: editEntity?.created_at || new Date().toISOString(),
    });
    setEntityDialog(false);
    setEditEntity(null);
    setEntityName('');
    setSelectedGroupId('');
    reload();
    toast.success('Entity saved');
  };

  const handleDeleteGroup = (id: string) => {
    if (confirm('Delete this group and all its entities/leases?')) {
      deleteGroup(id);
      reload();
      toast.success('Group deleted');
    }
  };

  const handleDeleteEntity = (id: string) => {
    if (confirm('Delete this entity and all its leases?')) {
      deleteEntity(id);
      reload();
      toast.success('Entity deleted');
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
    setEntityDialog(true);
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Entity Management</h1>
          <p className="text-sm text-muted-foreground">Manage corporate groups and legal entities</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEditGroup(null); setGroupName(''); setGroupDialog(true); }}>
            <Building className="w-4 h-4 mr-1.5" /> Add Group
          </Button>
          <Button size="sm" onClick={() => { setEditEntity(null); setEntityName(''); setSelectedGroupId(''); setEntityDialog(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Entity
          </Button>
        </div>
      </div>

      {/* Groups with nested entities */}
      {groups.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center">
          <Building className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1">No corporate groups</h3>
          <p className="text-sm text-muted-foreground">Create a corporate group to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const groupEntities = entities.filter(e => e.corporate_id === group.corporate_id);
            return (
              <div key={group.corporate_id} className="bg-card border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">{group.corporate_group_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{groupEntities.length} entities</span>
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
                {groupEntities.length > 0 ? (
                  <div className="divide-y">
                    {groupEntities.map(entity => (
                      <div key={entity.entity_id} className="flex items-center justify-between px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-accent" />
                          <span className="text-sm">{entity.legal_entity_name}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditEntity(entity)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteEntity(entity.entity_id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-5 py-3 text-xs text-muted-foreground">No entities in this group yet.</p>
                )}
              </div>
            );
          })}
        </div>
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
            <Button onClick={handleSaveGroup}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entity Dialog */}
      <Dialog open={entityDialog} onOpenChange={setEntityDialog}>
        <DialogContent>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntityDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEntity}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

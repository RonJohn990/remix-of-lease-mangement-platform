import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lease, Entity, Escalation, PaymentFrequency } from '@/lib/types';
import { getEntities, getLease, saveLease, generateId } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeft, Save } from 'lucide-react';

const defaultLease: Partial<Lease> = {
  lease_version: 1,
  lease_event: 'INITIAL',
  payment_frequency: 'Monthly',
  lease_type: 'Finance',
  discount_rate_ibr: 8,
  monthly_lease_amount: 0,
  number_installments: 12,
  security_deposit: 0,
  initial_direct_cost: 0,
  short_term_flag: false,
  low_value_flag: false,
  status: 'Active',
  escalations: [],
  modifications: [],
};

export default function LeaseForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = id && id !== 'new';
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm] = useState<Partial<Lease>>(defaultLease);

  useEffect(() => {
    setEntities(getEntities());
    if (isEdit) {
      const lease = getLease(id!);
      if (lease) setForm(lease);
      else { toast.error('Lease not found'); navigate('/leases'); }
    }
  }, [id]);

  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const addEscalation = () => {
    const escalations = [...(form.escalations || []), { escalation_start_date: '', escalation_percentage: 0 }];
    update('escalations', escalations);
  };

  const updateEscalation = (idx: number, field: keyof Escalation, value: any) => {
    const escalations = [...(form.escalations || [])];
    escalations[idx] = { ...escalations[idx], [field]: value };
    update('escalations', escalations);
  };

  const removeEscalation = (idx: number) => {
    update('escalations', (form.escalations || []).filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!form.entity_id) { toast.error('Select an entity'); return; }
    if (!form.lease_name?.trim()) { toast.error('Lease name is required'); return; }
    if (!form.lease_start_date || !form.lease_end_date || !form.rent_commencement_date) {
      toast.error('All dates are required'); return;
    }
    if (!form.discount_rate_ibr || form.discount_rate_ibr <= 0 || form.discount_rate_ibr >= 100) {
      toast.error('Discount rate must be > 0 and < 100'); return;
    }
    if (!form.monthly_lease_amount || form.monthly_lease_amount <= 0) {
      toast.error('Monthly lease amount must be > 0'); return;
    }

    const entity = entities.find(e => e.entity_id === form.entity_id);
    const lease: Lease = {
      ...defaultLease,
      ...form,
      lease_id: form.lease_id || generateId(),
      legal_entity_name: entity?.legal_entity_name || '',
      created_at: form.created_at || new Date().toISOString(),
    } as Lease;

    saveLease(lease);
    toast.success('Lease saved');
    navigate(`/leases/${lease.lease_id}`);
  };

  return (
    <div className="page-container animate-fade-in max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Button size="icon" variant="ghost" onClick={() => navigate('/leases')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="page-title">{isEdit ? 'Edit Lease' : 'New Lease'}</h1>
          <p className="text-sm text-muted-foreground">IFRS 16 compliant lease entry</p>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-6">
        {/* Entity & Basic Info */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-primary">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Legal Entity *</Label>
              <Select value={form.entity_id || ''} onValueChange={v => update('entity_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
                <SelectContent>
                  {entities.map(e => (
                    <SelectItem key={e.entity_id} value={e.entity_id}>{e.legal_entity_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lease Name *</Label>
              <Input value={form.lease_name || ''} onChange={e => update('lease_name', e.target.value)} />
            </div>
            <div>
              <Label>Vendor Name</Label>
              <Input value={form.vendor_name || ''} onChange={e => update('vendor_name', e.target.value)} />
            </div>
            <div>
              <Label>Lease Type</Label>
              <Input value={form.lease_type || ''} onChange={e => update('lease_type', e.target.value)} />
            </div>
            <div>
              <Label>Tagged Employee</Label>
              <Input value={form.tagged_employee || ''} onChange={e => update('tagged_employee', e.target.value)} />
            </div>
            <div>
              <Label>Asset Unit</Label>
              <Input value={form.asset_unit || ''} onChange={e => update('asset_unit', e.target.value)} />
            </div>
            <div>
              <Label>Concerned Person</Label>
              <Input value={form.concerned_person || ''} onChange={e => update('concerned_person', e.target.value)} />
            </div>
            <div>
              <Label>Payment Frequency</Label>
              <Select value={form.payment_frequency} onValueChange={(v: PaymentFrequency) => update('payment_frequency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                  <SelectItem value="Quarterly">Quarterly</SelectItem>
                  <SelectItem value="Annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Dates */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-primary">Lease Dates</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Lease Start Date *</Label>
              <Input type="date" value={form.lease_start_date || ''} onChange={e => update('lease_start_date', e.target.value)} />
            </div>
            <div>
              <Label>Lease End Date *</Label>
              <Input type="date" value={form.lease_end_date || ''} onChange={e => update('lease_end_date', e.target.value)} />
            </div>
            <div>
              <Label>Rent Commencement Date *</Label>
              <Input type="date" value={form.rent_commencement_date || ''} onChange={e => update('rent_commencement_date', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Financial */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-primary">Financial Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Monthly Lease Amount *</Label>
              <Input type="number" value={form.monthly_lease_amount || ''} onChange={e => update('monthly_lease_amount', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Discount Rate (IBR %) *</Label>
              <Input type="number" step="0.01" value={form.discount_rate_ibr || ''} onChange={e => update('discount_rate_ibr', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Number of Installments</Label>
              <Input type="number" value={form.number_installments || ''} onChange={e => update('number_installments', parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Security Deposit</Label>
              <Input type="number" value={form.security_deposit || ''} onChange={e => update('security_deposit', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Initial Direct Cost</Label>
              <Input type="number" value={form.initial_direct_cost || ''} onChange={e => update('initial_direct_cost', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        </div>

        {/* Flags */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-primary">Classification</h3>
          <div className="flex gap-8">
            <div className="flex items-center gap-2">
              <Switch checked={form.short_term_flag || false} onCheckedChange={v => update('short_term_flag', v)} />
              <Label>Short-term Lease (&lt; 1 year)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.low_value_flag || false} onCheckedChange={v => update('low_value_flag', v)} />
              <Label>Low-value Lease (&lt; USD 5,000)</Label>
            </div>
          </div>
        </div>

        {/* Escalations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-primary">Escalations</h3>
            <Button size="sm" variant="outline" onClick={addEscalation}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Escalation
            </Button>
          </div>
          {(form.escalations || []).map((esc, idx) => (
            <div key={idx} className="flex gap-3 items-end mb-2">
              <div className="flex-1">
                <Label>Start Date</Label>
                <Input type="date" value={esc.escalation_start_date} onChange={e => updateEscalation(idx, 'escalation_start_date', e.target.value)} />
              </div>
              <div className="flex-1">
                <Label>Percentage (%)</Label>
                <Input type="number" step="0.01" value={esc.escalation_percentage} onChange={e => updateEscalation(idx, 'escalation_percentage', parseFloat(e.target.value) || 0)} />
              </div>
              <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => removeEscalation(idx)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Comments */}
        <div>
          <Label>Comments</Label>
          <Textarea value={form.lease_comments || ''} onChange={e => update('lease_comments', e.target.value)} rows={3} />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button variant="outline" onClick={() => navigate('/leases')}>Cancel</Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-1.5" /> Save Lease
          </Button>
        </div>
      </div>
    </div>
  );
}

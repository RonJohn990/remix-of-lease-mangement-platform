import { useState } from 'react';
import { LeaseModification, ModificationType } from '@/lib/types';
import { generateId } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (mod: LeaseModification) => void;
  currentEndDate: string;
  currentMonthlyAmount: number;
  currentDiscountRate: number;
}

const modTypes: { value: ModificationType; label: string; description: string }[] = [
  { value: 'TERM_CHANGE', label: 'Term Extension/Reduction', description: 'Change the lease end date' },
  { value: 'PAYMENT_CHANGE', label: 'Payment Change', description: 'Change monthly payment amount' },
  { value: 'SCOPE_INCREASE', label: 'Scope Increase', description: 'Increase in leased asset scope' },
  { value: 'SCOPE_DECREASE', label: 'Scope Decrease', description: 'Partial derecognition with gain/loss' },
  { value: 'EARLY_TERMINATION', label: 'Early Termination', description: 'Terminate the lease early' },
];

export default function ModificationDialog({ open, onClose, onSave, currentEndDate, currentMonthlyAmount, currentDiscountRate }: Props) {
  const [modType, setModType] = useState<ModificationType>('TERM_CHANGE');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [description, setDescription] = useState('');
  const [newEndDate, setNewEndDate] = useState(currentEndDate);
  const [newMonthlyAmount, setNewMonthlyAmount] = useState(currentMonthlyAmount);
  const [newDiscountRate, setNewDiscountRate] = useState(currentDiscountRate);
  const [terminationPenalty, setTerminationPenalty] = useState(0);
  const [scopeDecreasePercentage, setScopeDecreasePercentage] = useState(0);

  const isTermination = modType === 'EARLY_TERMINATION';
  const isScopeDecrease = modType === 'SCOPE_DECREASE';

  const handleSave = () => {
    if (!effectiveDate) { toast.error('Effective date is required'); return; }
    if (!description.trim()) { toast.error('Description is required'); return; }
    if (isScopeDecrease && (scopeDecreasePercentage <= 0 || scopeDecreasePercentage >= 100)) {
      toast.error('Scope decrease must be between 0% and 100%'); return;
    }
    if (newDiscountRate <= 0 || newDiscountRate >= 100) {
      toast.error('Discount rate must be > 0 and < 100'); return;
    }

    const mod: LeaseModification = {
      modification_id: generateId(),
      modification_date: new Date().toISOString().split('T')[0],
      modification_type: modType,
      effective_date: effectiveDate,
      description: description.trim(),
      new_lease_end_date: isTermination ? effectiveDate : newEndDate,
      new_monthly_amount: isTermination ? 0 : newMonthlyAmount,
      new_discount_rate: newDiscountRate,
      termination_penalty: isTermination ? terminationPenalty : 0,
      scope_decrease_percentage: isScopeDecrease ? scopeDecreasePercentage : 0,
      // These will be computed
      carrying_liability_at_mod: 0,
      carrying_rou_at_mod: 0,
      new_liability: 0,
      liability_adjustment: 0,
      rou_adjustment: 0,
      gain_loss: 0,
      created_at: new Date().toISOString(),
    };

    onSave(mod);
    // Reset
    setModType('TERM_CHANGE');
    setEffectiveDate('');
    setDescription('');
    setTerminationPenalty(0);
    setScopeDecreasePercentage(0);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Lease Modification
          </DialogTitle>
          <DialogDescription>
            Record a modification per IFRS 16.44–46 / Ind AS 116. The system will recalculate liability, ROU, and gain/loss.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Modification Type</Label>
            <Select value={modType} onValueChange={(v: ModificationType) => setModType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {modTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <div>
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">— {t.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Effective Date *</Label>
              <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
            </div>
            <div>
              <Label>New Discount Rate (%)</Label>
              <Input type="number" step="0.01" value={newDiscountRate} onChange={e => setNewDiscountRate(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          {!isTermination && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>New End Date</Label>
                <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
              </div>
              <div>
                <Label>New Monthly Amount</Label>
                <Input type="number" value={newMonthlyAmount} onChange={e => setNewMonthlyAmount(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          )}

          {isTermination && (
            <div>
              <Label>Termination Penalty</Label>
              <Input type="number" value={terminationPenalty} onChange={e => setTerminationPenalty(parseFloat(e.target.value) || 0)} />
            </div>
          )}

          {isScopeDecrease && (
            <div>
              <Label>Scope Decrease Percentage (%)</Label>
              <Input type="number" step="0.1" value={scopeDecreasePercentage} onChange={e => setScopeDecreasePercentage(parseFloat(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground mt-1">
                Proportional derecognition of liability and ROU. Gain/loss recognized in P&L.
              </p>
            </div>
          )}

          <div>
            <Label>Description *</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="e.g., Extended lease term by 2 years due to renewal option exercise" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>
            {isTermination ? 'Record Termination' : 'Apply Modification'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, Download, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Lease } from '@/lib/types';
import { saveLease, generateId, getEntities } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const REQUIRED_COLUMNS = [
  'lease_name', 'entity_id', 'lease_start_date', 'lease_end_date',
  'rent_commencement_date', 'monthly_lease_amount', 'discount_rate_ibr',
];

const OPTIONAL_COLUMNS = [
  'vendor_name', 'tagged_employee', 'asset_unit', 'concerned_person',
  'lease_comments', 'payment_frequency', 'lease_type', 'lease_classification',
  'number_installments', 'security_deposit', 'initial_direct_cost',
  'short_term_flag', 'low_value_flag',
];

const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

interface RowResult {
  row: number;
  leaseName: string;
  status: 'success' | 'error';
  message: string;
}

export default function BulkImportDialog({ open, onOpenChange, onComplete }: BulkImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [step, setStep] = useState<'upload' | 'preview' | 'results'>('upload');

  const reset = () => {
    setFile(null);
    setParsedData([]);
    setResults([]);
    setStep('upload');
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const downloadTemplate = () => {
    const csv = Papa.unparse({ fields: ALL_COLUMNS, data: [] });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lease_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }
    setFile(f);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0) {
          toast.error(`CSV parse error: ${result.errors[0].message}`);
          return;
        }
        const data = result.data as Record<string, string>[];
        if (data.length === 0) {
          toast.error('CSV file is empty');
          return;
        }
        // Check required columns
        const headers = Object.keys(data[0]);
        const missing = REQUIRED_COLUMNS.filter(c => !headers.includes(c));
        if (missing.length > 0) {
          toast.error(`Missing required columns: ${missing.join(', ')}`);
          return;
        }
        setParsedData(data);
        setStep('preview');
      },
    });
  };

  const handleImport = async () => {
    setImporting(true);
    const entities = await getEntities();
    const entityMap = new Map(entities.map(e => [e.entity_id, e]));
    // Also allow matching by name
    const entityNameMap = new Map(entities.map(e => [e.legal_entity_name.toLowerCase(), e]));

    const importResults: RowResult[] = [];

    for (let i = 0; i < parsedData.length; i++) {
      const row = parsedData[i];
      const rowNum = i + 2; // 1-indexed + header
      const leaseName = row.lease_name?.trim() || `Row ${rowNum}`;

      try {
        // Resolve entity
        let entityId = row.entity_id?.trim();
        let entityName = '';
        if (entityId && entityMap.has(entityId)) {
          entityName = entityMap.get(entityId)!.legal_entity_name;
        } else if (entityId && entityNameMap.has(entityId.toLowerCase())) {
          const ent = entityNameMap.get(entityId.toLowerCase())!;
          entityId = ent.entity_id;
          entityName = ent.legal_entity_name;
        } else {
          throw new Error(`Entity "${entityId}" not found`);
        }

        // Validate required fields
        if (!row.lease_name?.trim()) throw new Error('Missing lease_name');
        if (!row.lease_start_date?.trim()) throw new Error('Missing lease_start_date');
        if (!row.lease_end_date?.trim()) throw new Error('Missing lease_end_date');
        if (!row.rent_commencement_date?.trim()) throw new Error('Missing rent_commencement_date');

        const monthlyAmt = parseFloat(row.monthly_lease_amount);
        if (!monthlyAmt || monthlyAmt <= 0) throw new Error('Invalid monthly_lease_amount');

        const discountRate = parseFloat(row.discount_rate_ibr);
        if (!discountRate || discountRate <= 0 || discountRate >= 100) throw new Error('Invalid discount_rate_ibr');

        const freq = row.payment_frequency?.trim();
        const validFreqs = ['Monthly', 'Quarterly', 'Annual'];
        const paymentFrequency = validFreqs.includes(freq) ? freq : 'Monthly';

        const classification = row.lease_classification?.trim();
        const validClass = ['Finance', 'Operating'];
        const leaseClassification = validClass.includes(classification) ? classification : 'Finance';

        const lease: Lease = {
          lease_id: generateId(),
          entity_id: entityId,
          legal_entity_name: entityName,
          lease_version: 1,
          lease_event: 'INITIAL',
          lease_name: row.lease_name.trim(),
          vendor_name: row.vendor_name?.trim() || '',
          tagged_employee: row.tagged_employee?.trim() || '',
          asset_unit: row.asset_unit?.trim() || '',
          concerned_person: row.concerned_person?.trim() || '',
          lease_comments: row.lease_comments?.trim() || '',
          payment_frequency: paymentFrequency as any,
          lease_type: row.lease_type?.trim() || '',
          lease_classification: leaseClassification as any,
          lease_start_date: row.lease_start_date.trim(),
          lease_end_date: row.lease_end_date.trim(),
          rent_commencement_date: row.rent_commencement_date.trim(),
          discount_rate_ibr: discountRate,
          monthly_lease_amount: monthlyAmt,
          number_installments: parseInt(row.number_installments) || 0,
          security_deposit: parseFloat(row.security_deposit) || 0,
          initial_direct_cost: parseFloat(row.initial_direct_cost) || 0,
          short_term_flag: row.short_term_flag?.toLowerCase() === 'true',
          low_value_flag: row.low_value_flag?.toLowerCase() === 'true',
          status: 'Active',
          created_at: new Date().toISOString(),
          escalations: [],
          modifications: [],
        };

        await saveLease(lease);
        importResults.push({ row: rowNum, leaseName, status: 'success', message: 'Imported' });
      } catch (err: any) {
        importResults.push({ row: rowNum, leaseName, status: 'error', message: err.message });
      }
    }

    setResults(importResults);
    setStep('results');
    setImporting(false);

    const successCount = importResults.filter(r => r.status === 'success').length;
    if (successCount > 0) {
      toast.success(`${successCount} lease(s) imported successfully`);
      onComplete();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Import Leases</DialogTitle>
          <DialogDescription>Upload a CSV file to import multiple leases at once.</DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">
                Drop a CSV file here or click to browse
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileText className="w-4 h-4 mr-1.5" /> Select CSV File
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Need the format? Download the template first.
              </p>
              <Button variant="link" size="sm" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5 mr-1" /> Download Template
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{file?.name}</span>
              <Badge variant="secondary">{parsedData.length} rows</Badge>
            </div>

            <ScrollArea className="h-48 border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Lease Name</th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Entity</th>
                    <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsedData.slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1">{i + 1}</td>
                      <td className="px-2 py-1">{row.lease_name || '—'}</td>
                      <td className="px-2 py-1 text-muted-foreground">{row.entity_id || '—'}</td>
                      <td className="px-2 py-1 text-right">{row.monthly_lease_amount || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={reset}>Back</Button>
              <Button size="sm" onClick={handleImport} disabled={importing}>
                {importing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                {importing ? 'Importing...' : `Import ${parsedData.length} Leases`}
              </Button>
            </div>
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {results.filter(r => r.status === 'success').length} success
              </Badge>
              {results.some(r => r.status === 'error') && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="w-3 h-3" />
                  {results.filter(r => r.status === 'error').length} failed
                </Badge>
              )}
            </div>

            <ScrollArea className="h-48 border rounded-md">
              <div className="divide-y">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                    {r.status === 'success' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    )}
                    <span className="font-medium">Row {r.row}</span>
                    <span className="text-muted-foreground truncate">{r.leaseName}</span>
                    {r.status === 'error' && (
                      <span className="ml-auto text-destructive">{r.message}</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => handleClose(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

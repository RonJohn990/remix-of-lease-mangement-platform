import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export default function MultiSelectFilter({ label, options, selected, onChange, placeholder = 'All' }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selected.length === 0 || selected.length === options.length;

  const toggleAll = () => {
    onChange([]);
  };

  const toggle = (value: string) => {
    if (selected.length === 0) {
      // Currently "all" — selecting one means only that one
      onChange([value]);
    } else if (selected.includes(value)) {
      const next = selected.filter(v => v !== value);
      onChange(next); // empty = all
    } else {
      const next = [...selected, value];
      onChange(next.length === options.length ? [] : next);
    }
  };

  const displayLabel = allSelected
    ? placeholder
    : selected.length === 1
      ? options.find(o => o.value === selected[0])?.label || selected[0]
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-between h-9 text-sm font-normal"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 ml-1 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-popover border rounded-md shadow-md max-h-60 overflow-y-auto">
          {/* Select All */}
          <button
            className={cn(
              'flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left',
              allSelected && 'font-semibold'
            )}
            onClick={toggleAll}
          >
            <div className={cn(
              'w-4 h-4 rounded border flex items-center justify-center shrink-0',
              allSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
            )}>
              {allSelected && <Check className="w-3 h-3" />}
            </div>
            Select All
          </button>
          <div className="border-t" />
          {options.map(opt => {
            const checked = selected.length === 0 || selected.includes(opt.value);
            const isExplicit = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                onClick={() => toggle(opt.value)}
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                  (allSelected || isExplicit) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                )}>
                  {(allSelected || isExplicit) && <Check className="w-3 h-3" />}
                </div>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

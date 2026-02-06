'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getStatusLabel, getStatusPillClass } from '@/lib/opsStatuses';
import { cn } from '@/lib/utils';

export type StatusSelectOption = { value: string; label: string };

interface StatusSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: StatusSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Status dropdown that looks like the old badge (pill + chevron).
 * Reuses STATUS_UI colour mapping from opsStatuses.
 */
export function StatusSelect({
  value,
  onValueChange,
  options,
  disabled,
  placeholder = 'Status',
  className,
}: StatusSelectProps) {
  const label = value ? getStatusLabel(value) : placeholder;
  const pillClass = value ? getStatusPillClass(value) : 'bg-gray-50 text-gray-500 border-gray-200';

  return (
    <Select value={value === '' ? undefined : value} onValueChange={(v) => onValueChange(v ?? '')} disabled={disabled}>
      <SelectTrigger
        className={cn(
          'h-7 min-w-0 w-auto px-0 py-0 border-0 bg-transparent shadow-none gap-1 cursor-pointer',
          'focus:ring-0 focus:ring-offset-0',
          className
        )}
      >
        <SelectValue className="sr-only" />
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none',
            pillClass
          )}
        >
          {label}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
      </SelectTrigger>
      <SelectContent align="end" className="z-[100]">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

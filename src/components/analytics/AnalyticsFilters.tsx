'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addDays, formatISO } from 'date-fns';

export type Filters = {
  tz: string;
  vehicle: string | null;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (exclusive)
};

type Props = {
  initial: Filters;
  onChange: (f: Filters) => void;
};

const tzOptions = ['UTC', 'Europe/London'];

export default function AnalyticsFilters({ initial, onChange }: Props) {
  const [state, setState] = React.useState<Filters>(initial);

  React.useEffect(() => { onChange(state); }, [state, onChange]);

  const setRange = (days: number) => {
    const today = new Date();
    const start = addDays(today, -days + 1);
    setState(s => ({
      ...s,
      start: formatISO(start, { representation: 'date' }),
      end:   formatISO(addDays(today, 1), { representation: 'date' }), // exclusive
    }));
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Timezone</span>
        <Select
          value={state.tz}
          onValueChange={(v) => setState(s => ({ ...s, tz: v }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Timezone" />
          </SelectTrigger>
          <SelectContent>
            {tzOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Vehicle</span>
        <Select
          value={state.vehicle ?? 'all'}
          onValueChange={(v) => setState(s => ({ ...s, vehicle: v === 'all' ? null : v }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Vehicle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="car">Car</SelectItem>
            <SelectItem value="van">Van</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" onClick={() => setRange(7)}>Last 7 days</Button>
        <Button variant="outline" onClick={() => setRange(14)}>Last 14</Button>
        <Button variant="outline" onClick={() => setRange(28)}>Last 28</Button>
      </div>
    </div>
  );
}

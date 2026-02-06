'use client';

import React, { useState, useEffect, useMemo, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, Car, DollarSign, ArrowUpDown, ChevronDown, ChevronUp, KeyRound } from 'lucide-react';
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal';
import DateRangeSelector from '@/components/admin/DateRangeSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useToast, toast as toastFn } from '@/hooks/use-toast';
import { BookingHighlightIcon } from '@/components/bookings/BookingHighlightIcon';
import { DynamicPricingBadge } from '@/components/bookings/DynamicPricingBadge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  GATE_STATUS,
  GATE_STATUS_OPTIONS,
  gateStatusLabel,
  gateStatusPillClass,
} from '@/lib/gateStatus';

import { BookingHighlightCode } from '@/types/bookings';

/** Parse response as JSON; throw a clear error if server returned HTML (e.g. 404/500 page). */
async function parseJsonFromResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (e) {
    if (text.trimStart().startsWith('<')) {
      throw new Error('Server returned an HTML page instead of JSON. The API may be missing or returned an error.');
    }
    throw e;
  }
}

interface Booking {
  id: string;
  tenant_id: string;
  reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  plate: string;
  car_make: string | null;
  car_model: string | null;
  car_color: string | null;
  start_at: string;
  end_at: string;
  status: string;
  money_received: number;
  money_charged: number;
  source: string;
  flight_number: string;
  notes: string | null;
  stripe_payment_intent_id?: string | null;
  payment_status?: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  gate_status?: string | null;
  highlight_code: BookingHighlightCode;
  ops_hidden?: boolean;
  ops_hidden_reason?: string | null;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  default_capacity: number;
}

interface KPIs {
  arrivals: number;
  departures: number;
  checkedIn: number;
  capacityLeft: number;
  totalRevenue: number;
}

interface TodayServerClientProps {
  tenant: Tenant;
  kpis: KPIs;
  arrivals: Booking[];
  departures: Booking[];
  currentlyParked: Booking[];
}

export default function TodayServerClient({ 
  tenant, 
  kpis: initialKpis, 
  arrivals: initialArrivals, 
  departures: initialDepartures, 
  currentlyParked: initialCurrentlyParked 
}: TodayServerClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState(initialKpis);
  const [arrivals, setArrivals] = useState(initialArrivals);
  const [departures, setDepartures] = useState(initialDepartures);
  const [currentlyParked, setCurrentlyParked] = useState(initialCurrentlyParked);
  const [arrivalsSort, setArrivalsSort] = useState<'closest' | 'most_recent'>('closest');
  const [departuresSort, setDeparturesSort] = useState<'closest' | 'most_recent'>('closest');
  const [parkedSort, setParkedSort] = useState<'closest' | 'most_recent'>('closest');
  const [highlightMode, setHighlightMode] = useState(false);
  const [updatingHighlightId, setUpdatingHighlightId] = useState<string | null>(null);
  const [arrivalsDeparturesCollapsed, setArrivalsDeparturesCollapsed] = useState(false);
  const [showHidden, setShowHidden] = useState(false); // show departed/no_show rows so you can unhide
  const [filterKeysTaken, setFilterKeysTaken] = useState(false);
  const [filterArrivedKeyTaken, setFilterArrivedKeyTaken] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [collapsedParkedDates, setCollapsedParkedDates] = useState<Set<string>>(new Set());
  // Initialize date range to today
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const [currentDateRange, setCurrentDateRange] = useState<{ from: string; to: string }>({ from: todayStr, to: todayStr });

  const handleBookingClick = (booking: Booking) => {
    setSelectedBookingId(booking.id);
  };

  const handleBookingUpdated = () => {
    router.refresh();
  };

  const handleUnhide = (booking: Booking) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/bookings/${booking.id}/unhide`, { method: 'PATCH' });
        const data = (await parseJsonFromResponse(res)) as { booking?: { ops_hidden?: boolean; ops_hidden_reason?: string | null }; error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to unhide');
        }
        const updated = { ...booking, ops_hidden: false, ops_hidden_reason: null };
        if (data.booking) {
          Object.assign(updated, { ops_hidden: data.booking.ops_hidden ?? false, ops_hidden_reason: data.booking.ops_hidden_reason ?? null });
        }
        setArrivals(prev => prev.map(b => b.id === booking.id ? updated : b));
        setDepartures(prev => prev.map(b => b.id === booking.id ? updated : b));
        setCurrentlyParked(prev => prev.map(b => b.id === booking.id ? updated : b));
        toast({ title: 'Booking unhidden' });
        handleBookingUpdated();
        setTimeout(() => router.refresh(), 300);
      } catch (err: unknown) {
        toast({ title: 'Error', description: err instanceof Error ? err.message : 'Could not unhide', variant: 'destructive' });
      }
    });
  };

  const updateHighlight = async (bookingId: string, highlightCode: BookingHighlightCode) => {
    try {
      setUpdatingHighlightId(bookingId);

      const res = await fetch('/api/bookings/highlight', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bookingId, 
          tenantId: tenant.id, 
          highlightCode 
        }),
      });

      const json = (await parseJsonFromResponse(res)) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update highlight');
      }

      // Update local state
      const updateBookingInState = (booking: Booking) => 
        booking.id === bookingId ? { ...booking, highlight_code: highlightCode } : booking;

      setArrivals(prev => prev.map(updateBookingInState));
      setDepartures(prev => prev.map(updateBookingInState));
      setCurrentlyParked(prev => prev.map(updateBookingInState));

      toastFn({
        title: 'Highlight updated',
        description: 'Booking highlight has been saved',
      });
    } catch (err: any) {
      console.error('Failed to update highlight:', err);
      toastFn({
        title: 'Error',
        description: err.message || 'Could not update highlight',
        variant: 'destructive',
      });
    } finally {
      setUpdatingHighlightId(null);
    }
  };

  const fetchDataForDateRange = async (from: string, to: string) => {
    // Clear previous data
    setKpis({ arrivals: 0, departures: 0, checkedIn: 0, capacityLeft: 0, totalRevenue: 0 });
    setArrivals([]);
    setDepartures([]);
    setCurrentlyParked([]);
    setLoading(true);
    
    try {
      const response = await fetch(`/api/admin/today?from=${from}&to=${to}`, { 
        cache: "no-store" 
      });
      const data = (await parseJsonFromResponse(response)) as { kpis?: KPIs; arrivals?: Booking[]; departures?: Booking[]; currentlyParked?: Booking[] };
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const defaultKpis: KPIs = { arrivals: 0, departures: 0, checkedIn: 0, capacityLeft: 0, totalRevenue: 0 };
      setKpis(data.kpis ?? defaultKpis);
      setArrivals(data.arrivals ?? []);
      setDepartures(data.departures ?? []);
      setCurrentlyParked(data.currentlyParked ?? []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (dateRange: { from: string; to: string }) => {
    setCurrentDateRange(dateRange);
    fetchDataForDateRange(dateRange.from, dateRange.to);
  };

  const sortBookings = (bookings: Booking[], sortOrder: 'closest' | 'most_recent', dateField: 'start_at' | 'end_at') => {
    const sorted = [...bookings];
    sorted.sort((a, b) => {
      const dateA = new Date(a[dateField]).getTime();
      const dateB = new Date(b[dateField]).getTime();
      
      if (sortOrder === 'closest') {
        // Closest date first (ascending)
        return dateA - dateB;
      } else {
        // Most recent first (descending)
        return dateB - dateA;
      }
    });
    return sorted;
  };

  const sortedArrivals = useMemo(() => {
    return sortBookings(arrivals, arrivalsSort, 'start_at');
  }, [arrivals, arrivalsSort]);

  const sortedDepartures = useMemo(() => {
    return sortBookings(departures, departuresSort, 'end_at');
  }, [departures, departuresSort]);

  // One central filter: hidden (Show hidden), cancelled, then Keys Taken / Arrived & Key Taken.
  // Bookings with status cancelled or ops_hidden are hidden by default; "Show hidden" reveals them.
  function applyStatusFilters<T extends { ops_hidden?: boolean; gate_status?: string | null; status?: string }>(bookings: T[]): T[] {
    return bookings.filter((b) => {
      if (!showHidden && (b.ops_hidden || b.status === 'cancelled')) return false;
      if (filterArrivedKeyTaken) return b.gate_status === 'arrived_key_taken';
      if (filterKeysTaken) return b.gate_status === 'take_key' || b.gate_status === 'arrived_key_taken';
      return true;
    });
  }

  const visibleArrivals = useMemo(
    () => applyStatusFilters(sortedArrivals),
    [sortedArrivals, showHidden, filterKeysTaken, filterArrivedKeyTaken]
  );

  const visibleDepartures = useMemo(() => {
    const filtered = applyStatusFilters(sortedDepartures);
    // Hide departures marked as "Departed" unless "Show hidden" is on
    if (showHidden) return filtered;
    return filtered.filter((b) => b.gate_status !== GATE_STATUS.DEPARTED);
  }, [sortedDepartures, showHidden, filterKeysTaken, filterArrivedKeyTaken]);

  // Counts for filter buttons (among rows visible when Show hidden is considered; cancelled hidden by default)
  const allVisibleToday = useMemo(() => {
    const hide = (b: Booking) => b.ops_hidden || b.status === 'cancelled';
    const a = showHidden ? sortedArrivals : sortedArrivals.filter((b) => !hide(b as Booking));
    const d = showHidden ? sortedDepartures : sortedDepartures.filter((b) => !hide(b as Booking));
    return [...a, ...d];
  }, [sortedArrivals, sortedDepartures, showHidden]);

  const keysTakenCount = useMemo(
    () => allVisibleToday.filter((b) => b.gate_status === 'take_key' || b.gate_status === 'arrived_key_taken').length,
    [allVisibleToday]
  );

  const arrivedKeyTakenCount = useMemo(
    () => allVisibleToday.filter((b) => b.gate_status === 'arrived_key_taken').length,
    [allVisibleToday]
  );

  const sortedCurrentlyParked = useMemo(() => {
    return sortBookings(currentlyParked, parkedSort, 'start_at');
  }, [currentlyParked, parkedSort]);

  // Group bookings by date
  const groupBookingsByDate = (bookings: Booking[], dateField: 'start_at' | 'end_at') => {
    const grouped: Record<string, Booking[]> = {};
    
    bookings.forEach(booking => {
      const date = new Date(booking[dateField]);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(booking);
    });
    
    // Sort dates
    const sortedDates = Object.keys(grouped).sort();
    
    return sortedDates.map(date => ({
      date,
      bookings: grouped[date],
      displayDate: new Date(date).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    }));
  };

  const groupedArrivals = useMemo(() => {
    return groupBookingsByDate(sortedArrivals, 'start_at');
  }, [sortedArrivals]);

  const groupedDepartures = useMemo(() => {
    return groupBookingsByDate(sortedDepartures, 'end_at');
  }, [sortedDepartures]);

  // Group currently parked by day - shows who is/will be parked on each day in the date range
  const groupedCurrentlyParked = useMemo(() => {
    // Debug: log if we have bookings but they're not showing
    if (sortedCurrentlyParked.length > 0) {
      console.log('Currently Parked - Total bookings:', sortedCurrentlyParked.length, {
        sample: sortedCurrentlyParked[0] ? {
          id: sortedCurrentlyParked[0].id,
          start: sortedCurrentlyParked[0].start_at,
          end: sortedCurrentlyParked[0].end_at,
          status: sortedCurrentlyParked[0].status
        } : null
      });
    }

    if (sortedCurrentlyParked.length === 0) {
      return [];
    }

    // Get date range
    const fromDate = currentDateRange.from;
    const toDate = currentDateRange.to;

    // Generate all days in the date range
    const days: string[] = [];
    const start = new Date(fromDate + 'T00:00:00.000Z');
    const end = new Date(toDate + 'T00:00:00.000Z');
    const current = new Date(start);
    
    while (current <= end) {
      days.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    // For each day, find bookings that are active on that day
    const grouped: Record<string, Booking[]> = {};
    
    const DAY_MS = 1000 * 60 * 60 * 24;
    
    days.forEach(dayStr => {
      const dayStart = new Date(dayStr + 'T00:00:00Z');
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      
      const activeBookings = sortedCurrentlyParked.filter(booking => {
        const bookingStart = new Date(booking.start_at);
        const bookingEnd = new Date(booking.end_at);
        
        // Booking is active on this day if it overlaps: start < dayEnd AND end > dayStart
        // (matches bookingTouchesDate logic from engine.ts)
        const isActive = bookingStart < dayEnd && bookingEnd > dayStart;
        return isActive;
      });
      
      if (activeBookings.length > 0) {
        grouped[dayStr] = activeBookings;
      }
    });

    // Sort dates and format
    const sortedDates = Object.keys(grouped).sort();
    
    const result = sortedDates.map(date => ({
      date,
      bookings: grouped[date],
      displayDate: new Date(date).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    }));

    // If we have bookings but no grouped dates, show them all under today as fallback
    if (result.length === 0 && sortedCurrentlyParked.length > 0) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      return [{
        date: todayStr,
        bookings: sortedCurrentlyParked,
        displayDate: new Date(todayStr).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      }];
    }

    return result;
  }, [sortedCurrentlyParked, currentDateRange]);

  // Group arrivals and departures by date (using visible lists so hidden rows stay hidden until "Show hidden")
  const groupedByDay = useMemo(() => {
    const allDates = new Set<string>();
    visibleArrivals.forEach((booking) => {
      allDates.add(new Date(booking.start_at).toISOString().split('T')[0]);
    });
    visibleDepartures.forEach((booking) => {
      allDates.add(new Date(booking.end_at).toISOString().split('T')[0]);
    });
    const sortedDates = Array.from(allDates).sort();
    return sortedDates.map((date) => {
      const arrivalsForDate = visibleArrivals.filter(
        (b) => new Date(b.start_at).toISOString().split('T')[0] === date
      );
      const departuresForDate = visibleDepartures.filter(
        (b) => new Date(b.end_at).toISOString().split('T')[0] === date
      );
      return {
        date,
        displayDate: new Date(date).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        arrivals: arrivalsForDate,
        departures: departuresForDate
      };
    });
  }, [visibleArrivals, visibleDepartures]);

  const StatCard = ({ label, value, delta, variant, rightSlot }: {
    label: string;
    value: number;
    delta?: string;
    variant?: 'success' | 'danger' | 'info' | 'warning';
    rightSlot?: React.ReactNode;
  }) => {
    const variantClasses = {
      success: 'text-green-600 bg-green-50',
      danger: 'text-red-600 bg-red-50',
      info: 'text-blue-600 bg-blue-50',
      warning: 'text-yellow-600 bg-yellow-50'
    };

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {delta && (
              <p className={`text-sm ${variantClasses[variant || 'info']}`}>
                {delta}
              </p>
            )}
          </div>
          {rightSlot && (
            <div className="flex-shrink-0">
              {rightSlot}
            </div>
          )}
        </div>
      </div>
    );
  };

  const BookingRow = ({
    booking,
    type,
    section,
    onBookingUpdated,
    showHidden,
    onUnhide,
  }: {
    booking: Booking;
    type: 'arrival' | 'departure' | 'parked';
    section?: 'arrivals' | 'departures' | 'parked';
    onBookingUpdated?: () => void;
    showHidden?: boolean;
    onUnhide?: (booking: Booking) => void;
  }) => {
    const { toast } = useToast();
    const time = type === 'arrival' ? booking.start_at : booking.end_at;
    
    // Calculate number of days staying
    const calculateDays = () => {
      const start = new Date(booking.start_at);
      const end = new Date(booking.end_at);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    };
    
    const [gateStatusLocal, setGateStatusLocal] = useState<string | null>(booking.gate_status ?? null);
    const [isPending, startTransition] = useTransition();
    const lastUpdateRef = useRef<{ gate_status: string | null } | null>(null);

    useEffect(() => {
      const next = booking.gate_status ?? null;
      if (lastUpdateRef.current && booking.gate_status === lastUpdateRef.current.gate_status) return;
      setGateStatusLocal(next);
    }, [booking.gate_status]);

    const handleRowClick = () => {
      if (!highlightMode) handleBookingClick(booking);
    };

    const isKeyTaken = Boolean(
      booking.gate_status === GATE_STATUS.TAKE_KEY ||
      booking.gate_status === GATE_STATUS.ARRIVED_KEY_TAKEN ||
      booking.highlight_code === 'key'
    );
    const effectiveHighlightCode: BookingHighlightCode = isKeyTaken ? 'key' : (booking.highlight_code || 'none');
    const displayGateStatus = gateStatusLocal ?? GATE_STATUS.NONE;

    const rowClass = cn(
      'group border-b transition-colors',
      highlightMode && 'cursor-pointer',
      'hover:bg-muted/30',
      section === 'arrivals' && 'bg-blue-50/40',
      section === 'departures' && 'bg-green-50/40'
    );

    const handleGateStatusChange = (value: string) => {
      const next = value === GATE_STATUS.NONE ? null : value;
      setGateStatusLocal(next);
      startTransition(async () => {
        try {
          const res = await fetch(`/api/admin/bookings/${booking.id}/gate-status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gateStatus: next }),
          });
          const data = (await parseJsonFromResponse(res)) as { booking?: Record<string, unknown>; error?: string };
          if (!res.ok) {
            throw new Error(data.error || 'Failed to update gate status');
          }
          const b = data?.booking;
          const updated: Booking = {
            ...booking,
            gate_status: (b?.gate_status as string | null | undefined) ?? next ?? undefined,
            checked_in_at: (b?.checked_in_at as string | null | undefined) ?? booking.checked_in_at,
            checked_out_at: (b?.checked_out_at as string | null | undefined) ?? booking.checked_out_at,
            status: (b?.status as string | undefined) ?? booking.status,
            highlight_code: (b?.highlight_code as Booking['highlight_code'] | undefined) ?? booking.highlight_code,
            ...(b && (b.ops_hidden !== undefined || b.ops_hidden_reason !== undefined)
              ? { ops_hidden: Boolean(b.ops_hidden), ops_hidden_reason: (b.ops_hidden_reason as string | null) ?? null }
              : {}),
          };
          setArrivals((prev) => prev.map((x) => (x.id === booking.id ? updated : x)));
          setDepartures((prev) => prev.map((x) => (x.id === booking.id ? updated : x)));
          setCurrentlyParked((prev) => prev.map((x) => (x.id === booking.id ? updated : x)));
          lastUpdateRef.current = { gate_status: next };
          toast({ title: 'Gate status updated', description: gateStatusLabel(next) });
          onBookingUpdated?.();
          setTimeout(() => router.refresh(), 300);
        } catch (err: unknown) {
          setGateStatusLocal(booking.gate_status ?? null);
          lastUpdateRef.current = null;
          toast({ title: 'Error', description: err instanceof Error ? err.message : 'Could not update', variant: 'destructive' });
        }
      });
    };

    const gateStatusOptions = useMemo(() => {
      if (section === 'departures') {
        return GATE_STATUS_OPTIONS.filter((o) => o.value === GATE_STATUS.NONE || o.value === GATE_STATUS.DEPARTED);
      }
      return GATE_STATUS_OPTIONS;
    }, [section]);

    // Single dropdown: gate_status only (— Status — / Arrived / No Show / Take Key / Arrived & Key Taken / Departed).
    return (
      <tr className={rowClass}>
        <td colSpan={3} className="px-1.5 py-1 cursor-pointer align-middle" onClick={handleRowClick}>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            {isKeyTaken && (
              <span className="inline-flex items-center text-amber-600" title="Key taken">
                <KeyRound className="h-4 w-4 shrink-0" />
              </span>
            )}
            <span className="font-medium">{booking.reference}</span>
            {highlightMode ? (
              <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="inline-flex">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex focus:outline-none hover:opacity-80 cursor-pointer min-w-[20px] min-h-[20px] rounded"
                      disabled={updatingHighlightId === booking.id}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <BookingHighlightIcon highlightCode={effectiveHighlightCode} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-[100] bg-white border border-gray-200 shadow-lg" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateHighlight(booking.id, 'key'); }} className="flex items-center gap-2">
                      <BookingHighlightIcon highlightCode="key" /><span>Key icon</span>{(effectiveHighlightCode === 'key') && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateHighlight(booking.id, 'dot_green'); }} className="flex items-center gap-2">
                      <BookingHighlightIcon highlightCode="dot_green" /><span>Green dot</span>{booking.highlight_code === 'dot_green' && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateHighlight(booking.id, 'dot_amber'); }} className="flex items-center gap-2">
                      <BookingHighlightIcon highlightCode="dot_amber" /><span>Amber dot</span>{booking.highlight_code === 'dot_amber' && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateHighlight(booking.id, 'dot_red'); }} className="flex items-center gap-2">
                      <BookingHighlightIcon highlightCode="dot_red" /><span>Red dot</span>{booking.highlight_code === 'dot_red' && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateHighlight(booking.id, 'none'); }} className="flex items-center gap-2">
                      <BookingHighlightIcon highlightCode="none" /><span>No highlight</span>{effectiveHighlightCode === 'none' && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : !isKeyTaken ? (
              <BookingHighlightIcon highlightCode={effectiveHighlightCode} />
            ) : null}
            <span>{booking.customer_name}</span>
            <span className="text-xs text-gray-600 font-mono">{booking.plate}</span>
            {(booking as any).is_incomplete && (
              <span className="inline-flex items-center h-5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-800">Incomplete</span>
            )}
            {booking.status === 'cancelled' && (
              <span className="inline-flex items-center h-5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-800">Cancelled</span>
            )}
            {(booking as any).dynamic_pricing_applied && (
              <DynamicPricingBadge applied={(booking as any).dynamic_pricing_applied} multiplier={(booking as any).dynamic_pricing_multiplier} occupancyPercent={(booking as any).dynamic_pricing_occupancy_percent} ruleId={(booking as any).dynamic_pricing_rule_id} />
            )}
            {booking.ops_hidden && (
              <span className="inline-flex items-center h-5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600" title={booking.ops_hidden_reason || 'Hidden'}>
                HIDDEN
              </span>
            )}
            {booking.ops_hidden && showHidden && onUnhide && (
              <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); onUnhide(booking); }}>
                Unhide
              </Button>
            )}
          </div>
        </td>
        <td colSpan={3} className="px-1.5 py-1 cursor-pointer align-middle" onClick={handleRowClick}>
          <span className="text-xs text-muted-foreground font-normal">
            {new Date(booking.start_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, {new Date(booking.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </td>
        <td colSpan={3} className="px-1.5 py-1 cursor-pointer align-middle" onClick={handleRowClick}>
          <span className="text-xs text-muted-foreground font-normal">
            {new Date(booking.end_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, {new Date(booking.end_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </td>
        <td colSpan={3} className="px-1.5 py-1 align-middle" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-1 md:gap-2">
            <div className="flex flex-wrap justify-end gap-1 text-sm">
              <span>{calculateDays()}d</span>
              <span>£{booking.money_charged || 0}</span>
            </div>
            <Select value={displayGateStatus === '' ? undefined : displayGateStatus} onValueChange={handleGateStatusChange} disabled={isPending}>
              <SelectTrigger className="h-7 px-1 py-0 bg-transparent border-0 shadow-none gap-1 cursor-pointer focus:ring-0 focus:ring-offset-0 min-w-0 w-auto [&>svg]:shrink-0">
                <SelectValue className="sr-only" />
                <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none', gateStatusPillClass(displayGateStatus))}>
                  {gateStatusLabel(displayGateStatus)}
                </span>
              </SelectTrigger>
              <SelectContent align="end" className="z-[100]">
                {gateStatusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Today's Overview</h1>
            <p className="text-gray-600">Welcome to {tenant.name}</p>
          </div>
          <Button
            variant={highlightMode ? 'default' : 'outline'}
            onClick={() => setHighlightMode((v) => !v)}
            className="shrink-0 w-full sm:w-auto"
          >
            {highlightMode ? 'Done highlighting' : 'Highlight bookings'}
          </Button>
        </div>

        {/* Date Range Selector */}
        <div className="max-w-xs">
          <DateRangeSelector onDateRangeChange={handleDateRangeChange} />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">Loading data...</span>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="Arrivals" 
            value={kpis.arrivals} 
            variant="success" 
            rightSlot={<LogIn className="h-4 w-4 text-blue-500" />} 
          />
          <StatCard 
            label="Departures" 
            value={kpis.departures} 
            variant="danger" 
            rightSlot={<LogOut className="h-4 w-4 text-red-500" />} 
          />
          <StatCard 
            label="Currently Parked" 
            value={kpis.checkedIn} 
            variant="info" 
            rightSlot={<Car className="h-4 w-4 text-blue-500" />}
          />
          <StatCard 
            label="Capacity Remaining" 
            value={kpis.capacityLeft}
            rightSlot={<DollarSign className="h-4 w-4 text-green-500" />}
          />
        </div>

        {/* Revenue Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Revenue</h3>
          <p className="text-3xl font-bold text-green-600">£{kpis.totalRevenue.toFixed(2)}</p>
        </div>

        {/* Arrivals and Departures by Day */}
        <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">Arrivals & Departures</h2>
                <p className="text-sm text-gray-600">Organized by day</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0 sm:justify-end">
                <Button
                  variant={showHidden ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowHidden((v) => !v)}
                  className="shrink-0"
                >
                  {showHidden ? 'Hide hidden' : 'Show hidden'}
                </Button>
                <Button
                  variant={filterKeysTaken ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setFilterKeysTaken((v) => !v);
                    if (filterArrivedKeyTaken) setFilterArrivedKeyTaken(false);
                  }}
                  className="shrink-0"
                >
                  Keys Taken{keysTakenCount > 0 ? ` (${keysTakenCount})` : ''}
                </Button>
                <Button
                  variant={filterArrivedKeyTaken ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setFilterArrivedKeyTaken((v) => !v);
                    if (filterKeysTaken) setFilterKeysTaken(false);
                  }}
                  className="shrink-0"
                >
                  Arrived & Key Taken{arrivedKeyTakenCount > 0 ? ` (${arrivedKeyTakenCount})` : ''}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setArrivalsDeparturesCollapsed(!arrivalsDeparturesCollapsed)}
                  className="flex items-center gap-2 shrink-0"
                >
                  {arrivalsDeparturesCollapsed ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      <span>Expand</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      <span>Minimize</span>
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-2 shrink-0">
                  <Label htmlFor="arrivalsSort" className="text-sm text-gray-600 shrink-0">Arrivals Sort:</Label>
                  <Select value={arrivalsSort} onValueChange={(value: 'closest' | 'most_recent') => setArrivalsSort(value)}>
                    <SelectTrigger className="w-[140px]">
                      <div className="flex items-center gap-2">
                        <ArrowUpDown className="w-4 h-4 text-gray-400" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closest">Closest First</SelectItem>
                      <SelectItem value="most_recent">Most Recent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label htmlFor="departuresSort" className="text-sm text-gray-600 shrink-0">Departures Sort:</Label>
                  <Select value={departuresSort} onValueChange={(value: 'closest' | 'most_recent') => setDeparturesSort(value)}>
                    <SelectTrigger className="w-[140px]">
                      <div className="flex items-center gap-2">
                        <ArrowUpDown className="w-4 h-4 text-gray-400" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closest">Closest First</SelectItem>
                      <SelectItem value="most_recent">Most Recent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          {!arrivalsDeparturesCollapsed && (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th colSpan={3} className="px-1.5 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref / Customer / Plate</th>
                    <th colSpan={3} className="px-1.5 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arrival</th>
                    <th colSpan={3} className="px-1.5 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Departure</th>
                    <th colSpan={3} className="px-1.5 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days / Amount / Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupedByDay.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                        No arrivals or departures in this period
                      </td>
                    </tr>
                  ) : (
                    groupedByDay.map((dayGroup) => {
                      const isCollapsed = collapsedDates.has(dayGroup.date);
                      return (
                        <React.Fragment key={dayGroup.date}>
                          {/* Date Header */}
                          <tr className="bg-gray-100 border-t-2 border-gray-300">
                            <td colSpan={12} className="px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-semibold text-gray-700">
                                    {dayGroup.displayDate}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setCollapsedDates(prev => {
                                        const next = new Set(prev);
                                        if (next.has(dayGroup.date)) {
                                          next.delete(dayGroup.date);
                                        } else {
                                          next.add(dayGroup.date);
                                        }
                                        return next;
                                      });
                                    }}
                                    className="h-6 w-6 p-0"
                                  >
                                    {isCollapsed ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronUp className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                                <span className="text-xs text-gray-500">
                                  {dayGroup.arrivals.length} {dayGroup.arrivals.length === 1 ? 'arrival' : 'arrivals'}, {dayGroup.departures.length} {dayGroup.departures.length === 1 ? 'departure' : 'departures'}
                                </span>
                              </div>
                            </td>
                          </tr>
                          {!isCollapsed && (
                            <>
                              {/* Arrivals for this date — blue header pill + count */}
                              {dayGroup.arrivals.length > 0 && (
                                <>
                                  <tr className="bg-blue-50/40 border-t border-blue-100">
                                    <td colSpan={12} className="py-1">
                                      <div className="flex items-center justify-between">
                                        <span className="inline-flex items-center rounded-full bg-blue-600 text-white px-2 py-0.5 text-xs font-semibold uppercase">
                                          Arrivals
                                        </span>
                                        <span className="rounded-full bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5">
                                          {dayGroup.arrivals.length}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                  {dayGroup.arrivals.map((booking) => (
                                    <BookingRow key={`arrival-${booking.id}`} booking={booking} type="arrival" section="arrivals" onBookingUpdated={handleBookingUpdated} showHidden={showHidden} onUnhide={handleUnhide} />
                                  ))}
                                </>
                              )}
                              {/* Departures for this date — green header pill + count */}
                              {dayGroup.departures.length > 0 && (
                                <>
                                  <tr className="bg-green-50/40 border-t border-green-100">
                                    <td colSpan={12} className="py-1">
                                      <div className="flex items-center justify-between">
                                        <span className="inline-flex items-center rounded-full bg-green-600 text-white px-2 py-0.5 text-xs font-semibold uppercase">
                                          Departures
                                        </span>
                                        <span className="rounded-full bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5">
                                          {dayGroup.departures.length}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                  {dayGroup.departures.map((booking) => (
                                    <BookingRow key={`departure-${booking.id}`} booking={booking} type="departure" section="departures" onBookingUpdated={handleBookingUpdated} showHidden={showHidden} onUnhide={handleUnhide} />
                                  ))}
                                </>
                              )}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Currently Parked */}
        <section className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Currently Parked</h2>
                <p className="text-sm text-gray-600">Cars currently in the parking lot</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="parkedSort" className="text-sm text-gray-600">Sort:</Label>
                <Select value={parkedSort} onValueChange={(value: 'closest' | 'most_recent') => setParkedSort(value)}>
                  <SelectTrigger className="w-[140px]">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4 text-gray-400" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closest">Closest First</SelectItem>
                    <SelectItem value="most_recent">Most Recent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
<div className="overflow-x-auto">
            <table className="min-w-full table-fixed divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th colSpan={3} className="px-1.5 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref / Customer / Plate</th>
                  <th colSpan={3} className="px-1.5 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arrival</th>
                  <th colSpan={3} className="px-1.5 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Departure</th>
                  <th colSpan={3} className="px-1.5 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days / Amount / Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedCurrentlyParked.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                      No cars currently parked
                    </td>
                  </tr>
                ) : (
                  groupedCurrentlyParked.map((group, groupIndex) => {
                    const isCollapsed = collapsedParkedDates.has(group.date);
                    return (
                      <React.Fragment key={group.date}>
                        {/* Date Header */}
                        <tr className="bg-gray-100 border-t-2 border-gray-300">
                          <td colSpan={12} className="px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-gray-700">
                                  {group.displayDate}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setCollapsedParkedDates(prev => {
                                      const next = new Set(prev);
                                      if (next.has(group.date)) {
                                        next.delete(group.date);
                                      } else {
                                        next.add(group.date);
                                      }
                                      return next;
                                    });
                                  }}
                                  className="h-6 w-6 p-0"
                                >
                                  {isCollapsed ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronUp className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                              <span className="text-xs text-gray-500">
                                {group.bookings.length} {group.bookings.length === 1 ? 'vehicle' : 'vehicles'}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {!isCollapsed && (
                          <>
                            {group.bookings.map((booking) => (
                              <BookingRow key={booking.id} booking={booking} type="parked" section="parked" onBookingUpdated={handleBookingUpdated} showHidden={showHidden} onUnhide={handleUnhide} />
                            ))}
                          </>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Booking Details Modal */}
      {selectedBookingId && (
        <BookingDetailsModal
          booking={[...arrivals, ...departures, ...currentlyParked].find(b => b.id === selectedBookingId) || null}
          open={!!selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onBookingUpdated={() => {
            router.refresh();
          }}
        />
      )}
    </>
  );
}

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
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  formatBookingDateTimeForTenant,
  tenantDateKeyFromUtc,
} from '@/lib/datetime/parse';

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

type BoardSection = 'arrivals' | 'departures' | 'parked';
type OpsAction = 'reserved' | 'arrived' | 'arrived_key_taken' | 'take_key' | 'departed' | 'no_show' | 'cancelled';

function formatDisplayDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Spreadsheet-style row colours: row background + text colour for entire row. */
function getRowStyleClasses(
  b: { gate_status?: string | null },
  section: BoardSection | undefined,
  gateStatusOverride?: string | null
): string {
  const s = gateStatusOverride ?? b.gate_status;
  const isTakeKey = s === 'take_key';
  const isArrivedKeyTaken = s === 'arrived_key_taken';
  let rowBg = 'bg-white';
  let text = 'text-black';

  if (section === 'arrivals') {
    if (s === 'no_show') {
      rowBg = 'bg-red-600';
      text = 'text-black [&_*]:!text-black';
    } else if (s === 'cancelled') {
      rowBg = 'bg-red-600';
      text = 'text-black [&_*]:!text-black';
    } else if (isArrivedKeyTaken) {
      rowBg = 'bg-yellow-400';
      text = 'text-red-600 [&_*]:!text-red-600';
    } else if (isTakeKey) {
      rowBg = 'bg-yellow-400';
      text = 'text-black [&_*]:!text-black';
    } else if (s === 'arrived') {
      rowBg = 'bg-white';
      text = 'text-red-600';
    }
  } else if (section === 'departures') {
    if (s === 'no_show') {
      rowBg = 'bg-red-600';
      text = 'text-black [&_*]:!text-black';
    } else if (isArrivedKeyTaken) {
      rowBg = 'bg-yellow-400';
      text = 'text-red-600 [&_*]:!text-red-600';
    } else if (isTakeKey) {
      rowBg = 'bg-yellow-400';
      text = 'text-black [&_*]:!text-black';
    } else {
      rowBg = 'bg-green-600';
      text = 'text-black';
    }
  } else if (section === 'parked' || section === undefined) {
    if (s === 'no_show') {
      rowBg = 'bg-red-600';
      text = 'text-black [&_*]:!text-black';
    } else if (isArrivedKeyTaken) {
      rowBg = 'bg-yellow-400';
      text = 'text-red-600 [&_*]:!text-red-600';
    } else if (isTakeKey) {
      rowBg = 'bg-yellow-400';
      text = 'text-black [&_*]:!text-black';
    }
  }
  // else: default white/black

  return `${rowBg} ${text}`;
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
  start_at_local?: string | null;
  end_at_local?: string | null;
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
  arrived_at?: string | null;
  departed_at?: string | null;
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
  const [pendingById, setPendingById] = useState<Record<string, boolean>>({});
  const pendingByIdRef = useRef<Record<string, boolean>>({});
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());
  const [recentlyUpdatedById, setRecentlyUpdatedById] = useState<Record<string, number>>({});
  // Initialize date range to today
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const [currentDateRange, setCurrentDateRange] = useState<{ from: string; to: string }>({ from: todayStr, to: todayStr });

  const handleBookingClick = (booking: Booking) => {
    setSelectedBookingId(booking.id);
  };

  const handleBookingUpdated = () => {};

  const logOpsClick = (message: string, details: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ops-click] ${message}`, details);
    }
  };

  const patchBookingInLists = (bookingId: string, patch: Partial<Booking>) => {
    const apply = (b: Booking) => (b.id === bookingId ? { ...b, ...patch } : b);
    setArrivals((prev) => prev.map(apply));
    setDepartures((prev) => prev.map(apply));
    setCurrentlyParked((prev) => prev.map(apply));
  };

  const restoreBookingInLists = (bookingId: string, snapshot: Booking | null) => {
    if (!snapshot) return;
    patchBookingInLists(bookingId, snapshot);
  };

  const findBookingById = (bookingId: string): Booking | null =>
    [...arrivals, ...departures, ...currentlyParked].find((b) => b.id === bookingId) ?? null;

  const getBookingDateKey = (booking: Booking, dateField: 'start_at' | 'end_at') =>
    tenantDateKeyFromUtc(booking[dateField], tenant.timezone || 'Europe/London');

  const formatBookingDateTime = (booking: Booking, dateField: 'start_at' | 'end_at') =>
    formatBookingDateTimeForTenant({
      timestamp: booking[dateField],
      timezone: tenant.timezone || 'Europe/London',
    });

  const optimisticPatchForAction = (booking: Booking, action: OpsAction): Partial<Booking> => {
    const now = new Date().toISOString();
    switch (action) {
      case 'reserved':
        return {
          gate_status: GATE_STATUS.RESERVED,
          status: 'reserved',
          arrived_at: null,
          departed_at: null,
          checked_in_at: null,
          checked_out_at: null,
          highlight_code: 'none',
          ops_hidden: false,
          ops_hidden_reason: null,
        };
      case 'arrived':
        return { gate_status: GATE_STATUS.ARRIVED, status: 'checked_in', arrived_at: booking.arrived_at || now, checked_in_at: booking.checked_in_at || now, checked_out_at: null, highlight_code: 'none', ops_hidden: false, ops_hidden_reason: null };
      case 'arrived_key_taken':
        return { gate_status: GATE_STATUS.ARRIVED_KEY_TAKEN, status: 'checked_in', arrived_at: booking.arrived_at || now, checked_in_at: booking.checked_in_at || now, checked_out_at: null, highlight_code: 'key', ops_hidden: false, ops_hidden_reason: null };
      case 'take_key':
        return { gate_status: GATE_STATUS.TAKE_KEY, highlight_code: 'key' };
      case 'departed':
        return { gate_status: GATE_STATUS.DEPARTED, status: 'checked_out', departed_at: booking.departed_at || now, checked_in_at: booking.checked_in_at || now, checked_out_at: booking.checked_out_at || now, ops_hidden: true, ops_hidden_reason: 'departed' };
      case 'no_show':
        return { gate_status: GATE_STATUS.NO_SHOW, highlight_code: 'none', ops_hidden: false, ops_hidden_reason: null };
      case 'cancelled':
        return { gate_status: GATE_STATUS.CANCELLED, status: 'cancelled', checked_in_at: null, checked_out_at: null, highlight_code: 'none', ops_hidden: true, ops_hidden_reason: 'cancelled' };
      default:
        return {};
    }
  };

  const updateBookingStatus = async (bookingId: string, action: OpsAction): Promise<boolean> => {
    const booking = findBookingById(bookingId);
    if (!booking || pendingByIdRef.current[bookingId]) return false;

    logOpsClick('clicked', { bookingId, reference: booking.reference, action });
    const snapshot = { ...booking };
    pendingByIdRef.current = { ...pendingByIdRef.current, [bookingId]: true };
    setPendingById((prev) => ({ ...prev, [bookingId]: true }));
    setRecentlyUpdatedById((prev) => ({ ...prev, [bookingId]: Date.now() }));
    patchBookingInLists(bookingId, optimisticPatchForAction(booking, action));
    logOpsClick('optimistic update applied', { bookingId });

    try {
      const res = await fetch('/api/admin/bookings/ops-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action }),
      });
      const data = (await parseJsonFromResponse(res)) as { booking?: Partial<Booking>; error?: string };
      if (!res.ok || !data.booking) {
        throw new Error(data.error || 'Failed to update booking');
      }

      patchBookingInLists(bookingId, data.booking);
      logOpsClick('save success', { bookingId, action });
      return true;
    } catch (err: unknown) {
      restoreBookingInLists(bookingId, snapshot);
      setRecentlyUpdatedById((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
      const message = err instanceof Error ? err.message : 'Could not update booking';
      logOpsClick('save failed', { bookingId, action, error: message });
      toast({ title: 'Update failed', description: `${booking.reference}: ${message}`, variant: 'destructive' });
      return false;
    } finally {
      setPendingById((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        pendingByIdRef.current = next;
        return next;
      });
    }
  };

  const toggleSelected = (bookingId: string, checked: boolean) => {
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(bookingId);
      else next.delete(bookingId);
      return next;
    });
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

  function isCancelledBooking(b: { gate_status?: string | null; status?: string }) {
    return b.status === 'cancelled' || b.gate_status === GATE_STATUS.CANCELLED;
  }

  function isNoShowBooking(b: { gate_status?: string | null }) {
    return b.gate_status === GATE_STATUS.NO_SHOW;
  }

  function isArrivalRemaining(b: { gate_status?: string | null; status?: string }) {
    return !isCancelledBooking(b) && !isNoShowBooking(b) && ![
      GATE_STATUS.ARRIVED,
      GATE_STATUS.ARRIVED_KEY_TAKEN,
      GATE_STATUS.DEPARTED,
    ].includes(b.gate_status as any);
  }

  function isDepartureRemaining(b: { gate_status?: string | null; status?: string }) {
    return !isCancelledBooking(b) && !isNoShowBooking(b) && b.gate_status !== GATE_STATUS.DEPARTED;
  }

  function isKeysToTakeRemaining(b: { gate_status?: string | null; status?: string }) {
    return !isCancelledBooking(b) && b.gate_status === GATE_STATUS.TAKE_KEY;
  }

  function matchesKeyFilters<T extends { gate_status?: string | null }>(b: T) {
    if (filterArrivedKeyTaken) return b.gate_status === GATE_STATUS.ARRIVED_KEY_TAKEN;
    if (filterKeysTaken) return b.gate_status === GATE_STATUS.TAKE_KEY || b.gate_status === GATE_STATUS.ARRIVED_KEY_TAKEN;
    return true;
  }

  // Operational lists hide cancelled bookings permanently; reports still retain the records.
  function applyStatusFilters<T extends { ops_hidden?: boolean; gate_status?: string | null; status?: string }>(
    bookings: T[],
    section: 'arrivals' | 'departures'
  ): T[] {
    return bookings.filter((b) => {
      const id = (b as { id?: string }).id;
      const keepVisible = Boolean(id && recentlyUpdatedById[id]);
      if (!keepVisible && isCancelledBooking(b)) return false;
      if (!keepVisible && section === 'departures' && isNoShowBooking(b)) return false;
      if (!keepVisible && !showHidden && b.ops_hidden && !(section === 'arrivals' && isNoShowBooking(b))) return false;
      return matchesKeyFilters(b);
    });
  }

  const visibleArrivals = useMemo(() => {
    return applyStatusFilters(sortedArrivals, 'arrivals');
  }, [sortedArrivals, showHidden, filterKeysTaken, filterArrivedKeyTaken, recentlyUpdatedById]);

  const visibleDepartures = useMemo(() => {
    const filtered = applyStatusFilters(sortedDepartures, 'departures');
    // Hide departures marked as "Departed" unless "Show hidden" is on
    return showHidden
      ? filtered
      : filtered.filter((b) => b.gate_status !== GATE_STATUS.DEPARTED);
  }, [sortedDepartures, showHidden, filterKeysTaken, filterArrivedKeyTaken, recentlyUpdatedById]);

  // Counts for filter buttons (among rows visible when Show hidden is considered; cancelled/no-show departures excluded)
  const allVisibleToday = useMemo(() => {
    const a = applyStatusFilters(sortedArrivals, 'arrivals');
    const d = applyStatusFilters(sortedDepartures, 'departures');
    return [...a, ...d];
  }, [sortedArrivals, sortedDepartures, showHidden, filterKeysTaken, filterArrivedKeyTaken, recentlyUpdatedById]);

  const keysTakenCount = useMemo(
    () => allVisibleToday.filter((b) => b.gate_status === 'take_key' || b.gate_status === 'arrived_key_taken').length,
    [allVisibleToday]
  );

  const arrivedKeyTakenCount = useMemo(
    () => allVisibleToday.filter((b) => b.gate_status === 'arrived_key_taken').length,
    [allVisibleToday]
  );

  const liveKpis = useMemo(() => ({
    arrivalsRemaining: visibleArrivals.filter(isArrivalRemaining).length,
    departuresRemaining: visibleDepartures.filter(isDepartureRemaining).length,
    keysToTake: visibleArrivals.filter(isKeysToTakeRemaining).length,
  }), [visibleArrivals, visibleDepartures]);

  const sortedCurrentlyParked = useMemo(() => {
    return sortBookings(currentlyParked, parkedSort, 'start_at');
  }, [currentlyParked, parkedSort]);

  // Group bookings by date
  const groupBookingsByDate = (bookings: Booking[], dateField: 'start_at' | 'end_at') => {
    const grouped: Record<string, Booking[]> = {};
    
    bookings.forEach(booking => {
      const dateKey = getBookingDateKey(booking, dateField);
      
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
      displayDate: formatDisplayDate(date)
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
      allDates.add(getBookingDateKey(booking, 'start_at'));
    });
    visibleDepartures.forEach((booking) => {
      allDates.add(getBookingDateKey(booking, 'end_at'));
    });
    const sortedDates = Array.from(allDates).sort();
    return sortedDates.map((date) => {
      const arrivalsForDate = visibleArrivals.filter(
        (b) => getBookingDateKey(b, 'start_at') === date
      );
      const departuresForDate = visibleDepartures.filter(
        (b) => getBookingDateKey(b, 'end_at') === date
      );
      return {
        date,
        displayDate: formatDisplayDate(date),
        arrivals: arrivalsForDate,
        departures: departuresForDate
      };
    });
  }, [visibleArrivals, visibleDepartures]);

  const visibleOperationalBookings = useMemo(
    () => [...visibleArrivals, ...visibleDepartures],
    [visibleArrivals, visibleDepartures]
  );
  const visibleOperationalIds = useMemo(
    () => Array.from(new Set(visibleOperationalBookings.map((booking) => booking.id))),
    [visibleOperationalBookings]
  );
  const selectedVisibleCount = visibleOperationalIds.filter((id) => selectedBookingIds.has(id)).length;
  const allVisibleSelected = visibleOperationalIds.length > 0 && selectedVisibleCount === visibleOperationalIds.length;

  const selectAllVisible = (checked: boolean) => {
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleOperationalIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedBookingIds(new Set());

  const runBulkAction = async (action: OpsAction) => {
    const ids = Array.from(selectedBookingIds);
    if (ids.length === 0) return;
    if (action === 'cancelled' && !window.confirm(`Cancel ${ids.length} selected booking${ids.length === 1 ? '' : 's'}?`)) {
      return;
    }

    const results = await Promise.all(ids.map(async (id) => ({ id, ok: await updateBookingStatus(id, action) })));
    const failed = results.filter((result) => !result.ok);
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      for (const result of results) {
        if (result.ok) next.delete(result.id);
      }
      return next;
    });
    if (failed.length > 0) {
      toast({
        title: 'Bulk update partially failed',
        description: `${failed.length} booking${failed.length === 1 ? '' : 's'} could not be updated.`,
        variant: 'destructive',
      });
    }
  };

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
    showHidden,
    onUnhide,
    isSelected,
    isPending,
    onSelectChange,
    onQuickAction,
  }: {
    booking: Booking;
    type: 'arrival' | 'departure' | 'parked';
    section?: 'arrivals' | 'departures' | 'parked';
    showHidden?: boolean;
    onUnhide?: (booking: Booking) => void;
    isSelected: boolean;
    isPending: boolean;
    onSelectChange: (checked: boolean) => void;
    onQuickAction: (action: OpsAction) => void;
  }) => {
    // Calculate number of days staying
    const calculateDays = () => {
      const start = new Date(booking.start_at);
      const end = new Date(booking.end_at);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    };
    
    const handleRowClick = () => {
      if (!highlightMode) handleBookingClick(booking);
    };

    const isKeyTaken = Boolean(
      booking.gate_status === GATE_STATUS.TAKE_KEY ||
      booking.gate_status === GATE_STATUS.ARRIVED_KEY_TAKEN ||
      booking.highlight_code === 'key'
    );
    const effectiveHighlightCode: BookingHighlightCode = isKeyTaken ? 'key' : (booking.highlight_code || 'none');
    const displayGateStatus = booking.gate_status ?? GATE_STATUS.RESERVED;

    const rowClass = cn(
      'group border-b transition-colors',
      highlightMode && 'cursor-pointer',
      getRowStyleClasses(booking, section, displayGateStatus)
    );

    const handleGateStatusChange = (value: string) => {
      if (value === GATE_STATUS.NONE) return;
      onQuickAction(value as OpsAction);
    };

    const handleQuickKey = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button,input,select,textarea,[role='button']")) return;
      const key = event.key.toLowerCase();
      if (key === "a" && section !== "departures") {
        event.preventDefault();
        handleGateStatusChange(GATE_STATUS.ARRIVED);
      } else if (key === "k" && section !== "departures") {
        event.preventDefault();
        handleGateStatusChange(GATE_STATUS.ARRIVED_KEY_TAKEN);
      } else if (key === "d") {
        event.preventDefault();
        handleGateStatusChange(GATE_STATUS.DEPARTED);
      }
    };

    const gateStatusOptions = useMemo(() => {
      return GATE_STATUS_OPTIONS;
    }, []);

    // Single dropdown: gate_status only (— Status — / Arrived / No Show / Take Key / Arrived & Key Taken / Departed).
    return (
      <tr className={rowClass} tabIndex={0} onKeyDown={handleQuickKey}>
        <td colSpan={3} className="px-1.5 py-1 cursor-pointer align-middle text-inherit" onClick={handleRowClick}>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="inline-flex items-center">
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelectChange(checked === true)}
                aria-label={`Select booking ${booking.reference}`}
                className="bg-white border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            </span>
            {isKeyTaken && (
              <span className="inline-flex items-center text-inherit" title="Key taken">
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
            <span className="text-sm font-semibold font-mono text-gray-900 bg-gray-200 px-2 py-0.5 rounded tracking-wide">{booking.plate}</span>
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
            {isPending && (
              <span className="inline-flex items-center h-5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-800">
                Saving...
              </span>
            )}
            {booking.ops_hidden && showHidden && onUnhide && (
              <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); onUnhide(booking); }}>
                Unhide
              </Button>
            )}
          </div>
        </td>
        <td colSpan={3} className="px-1.5 py-1 cursor-pointer align-middle text-inherit" onClick={handleRowClick}>
          <span className="text-xs font-normal">
            {formatBookingDateTime(booking, 'start_at')}
          </span>
        </td>
        <td colSpan={3} className="px-1.5 py-1 cursor-pointer align-middle text-inherit" onClick={handleRowClick}>
          <span className="text-xs font-normal">
            {formatBookingDateTime(booking, 'end_at')}
          </span>
        </td>
        <td colSpan={3} className="px-1.5 py-1 align-middle text-inherit" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-1 md:gap-2">
            <div className="flex flex-wrap justify-end gap-1 text-sm">
              <span>{calculateDays()}d</span>
              <span>£{booking.money_charged || 0}</span>
            </div>
            <Select value={displayGateStatus === '' ? undefined : displayGateStatus} onValueChange={handleGateStatusChange} disabled={isPending}>
              <SelectTrigger className="h-7 px-1 py-0 bg-transparent border-0 shadow-none gap-1 cursor-pointer focus:ring-0 focus:ring-offset-0 min-w-0 w-auto [&>svg]:shrink-0 [&>span:first-of-type]:sr-only">
                <SelectValue />
                <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none text-inherit', gateStatusPillClass(displayGateStatus))}>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard 
            label="Arrivals Remaining" 
            value={liveKpis.arrivalsRemaining} 
            variant="success" 
            rightSlot={<LogIn className="h-4 w-4 text-blue-500" />} 
          />
          <StatCard 
            label="Departures Remaining" 
            value={liveKpis.departuresRemaining} 
            variant="danger" 
            rightSlot={<LogOut className="h-4 w-4 text-red-500" />} 
          />
          <StatCard
            label="Keys to Take"
            value={liveKpis.keysToTake}
            variant="warning"
            rightSlot={<KeyRound className="h-4 w-4 text-yellow-600" />}
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
          <div className="p-4 md:p-6 border-b border-gray-200">
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
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-3 md:px-6">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) => selectAllVisible(checked === true)}
                  disabled={visibleOperationalIds.length === 0}
                  aria-label="Select all visible bookings"
                  className="bg-white border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span>Select visible</span>
              </label>
              {selectedBookingIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                  <span className="text-sm font-medium text-blue-900">
                    {selectedBookingIds.size} selected
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={() => runBulkAction('arrived')}>
                    Mark Arrived
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => runBulkAction('arrived_key_taken')}>
                    Mark Arrived + Key Taken
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => runBulkAction('take_key')}>
                    Mark Take Key
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => runBulkAction('departed')}>
                    Mark Departed
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => runBulkAction('no_show')}>
                    Mark No Show
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => runBulkAction('reserved')}>
                    Reset to Reserved
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => runBulkAction('cancelled')}>
                    Cancel Booking
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              )}
            </div>
          )}
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
                      const arrivalRemainingCount = dayGroup.arrivals.filter(isArrivalRemaining).length;
                      const departureRemainingCount = dayGroup.departures.filter(isDepartureRemaining).length;
                      const keysToTakeCount = dayGroup.arrivals.filter(isKeysToTakeRemaining).length;
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
                                <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800">
                                    {arrivalRemainingCount} {arrivalRemainingCount === 1 ? 'arrival' : 'arrivals'}
                                  </span>
                                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 font-medium text-yellow-900">
                                    {keysToTakeCount} keys to take
                                  </span>
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">
                                    {departureRemainingCount} {departureRemainingCount === 1 ? 'departure' : 'departures'}
                                  </span>
                                </div>
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
                                      <div className="flex items-center justify-center relative py-2">
                                        <span className="inline-flex items-center rounded-full bg-blue-600 text-white px-4 py-1 text-sm font-semibold uppercase">
                                          Arrivals
                                        </span>
                                        <span className="absolute right-4 rounded-full bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5">
                                          {arrivalRemainingCount}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                  {dayGroup.arrivals.map((booking) => (
                                    <BookingRow
                                      key={`arrival-${booking.id}`}
                                      booking={booking}
                                      type="arrival"
                                      section="arrivals"
                                      showHidden={showHidden}
                                      onUnhide={handleUnhide}
                                      isSelected={selectedBookingIds.has(booking.id)}
                                      isPending={Boolean(pendingById[booking.id])}
                                      onSelectChange={(checked) => toggleSelected(booking.id, checked)}
                                      onQuickAction={(action) => updateBookingStatus(booking.id, action)}
                                    />
                                  ))}
                                </>
                              )}
                              {/* Departures for this date — prominent green banner */}
                              {dayGroup.departures.length > 0 && (
                                <>
                                  <tr className="bg-green-600 border-t border-green-700">
                                    <td colSpan={12} className="py-1">
                                      <div className="flex items-center justify-center relative py-2">
                                        <span className="inline-flex items-center rounded-full bg-green-500 text-white px-4 py-1 text-sm font-semibold uppercase">
                                          Departures
                                        </span>
                                        <span className="absolute right-4 rounded-full bg-white/25 text-white text-xs font-medium px-2 py-0.5">
                                          {departureRemainingCount}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                  {dayGroup.departures.map((booking) => (
                                    <BookingRow
                                      key={`departure-${booking.id}`}
                                      booking={booking}
                                      type="departure"
                                      section="departures"
                                      showHidden={showHidden}
                                      onUnhide={handleUnhide}
                                      isSelected={selectedBookingIds.has(booking.id)}
                                      isPending={Boolean(pendingById[booking.id])}
                                      onSelectChange={(checked) => toggleSelected(booking.id, checked)}
                                      onQuickAction={(action) => updateBookingStatus(booking.id, action)}
                                    />
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
                              <BookingRow
                                key={booking.id}
                                booking={booking}
                                type="parked"
                                section="parked"
                                showHidden={showHidden}
                                onUnhide={handleUnhide}
                                isSelected={selectedBookingIds.has(booking.id)}
                                isPending={Boolean(pendingById[booking.id])}
                                onSelectChange={(checked) => toggleSelected(booking.id, checked)}
                                onQuickAction={(action) => updateBookingStatus(booking.id, action)}
                              />
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

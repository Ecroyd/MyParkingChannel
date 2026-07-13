'use client';

import React, { useState, useEffect, useMemo, useTransition, useRef, useCallback } from 'react';
import { LogIn, LogOut, Car, DollarSign, ArrowUpDown, ChevronDown, ChevronUp, KeyRound, Plus } from 'lucide-react';
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal';
import NewBookingModal from '@/components/bookings/NewBookingModal';
import DateRangeSelector from '@/components/admin/DateRangeSelector';
import TodayBookingRow, { type TodayBoardBooking, type TodayOpsAction } from './TodayBookingRow';
import type { TodayBookingRow as TodayBooking } from '@/lib/today/bookingSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  groupArrivalsAndDeparturesByDay,
} from '@/lib/today/groupBookingsByDay';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  GATE_STATUS,
} from '@/lib/gateStatus';
import {
  isArrivalRemaining,
  isCancelledBooking,
  isCurrentlyParked,
  isDepartureRemaining,
  isKeysToTakeRemaining,
  isNoShowBooking,
} from '@/lib/ops/parkedState';
import { formatBookingDateTimeForTenant } from '@/lib/datetime/parse';
import { createClient } from '@/lib/supabase/client';

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

type OpsAction = TodayOpsAction;

type Booking = TodayBooking;

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
  initialDateRange: { from: string; to: string };
  queryError?: string;
}

export default function TodayServerClient({ 
  tenant, 
  kpis: initialKpis, 
  arrivals: initialArrivals, 
  departures: initialDepartures, 
  currentlyParked: initialCurrentlyParked,
  initialDateRange,
  queryError: initialQueryError,
}: TodayServerClientProps) {
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
  const [arrivalsDeparturesCollapsed, setArrivalsDeparturesCollapsed] = useState(false);
  const [showHidden, setShowHidden] = useState(false); // show departed/no_show rows so you can unhide
  const [filterKeysTaken, setFilterKeysTaken] = useState(false);
  const [filterArrivedKeyTaken, setFilterArrivedKeyTaken] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [pendingById, setPendingById] = useState<Record<string, boolean>>({});
  const pendingByIdRef = useRef<Record<string, boolean>>({});
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());
  const [recentlyUpdatedById, setRecentlyUpdatedById] = useState<Record<string, number>>({});
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [parkedSheetOpen, setParkedSheetOpen] = useState(false);
  const [currentDateRange, setCurrentDateRange] = useState(initialDateRange);
  const [queryError, setQueryError] = useState(initialQueryError);
  const loadedRangeRef = useRef(`${initialDateRange.from}:${initialDateRange.to}`);
  const bulkToolbarRef = useRef<HTMLDivElement>(null);
  const tenantTz = tenant.timezone || 'Europe/London';

  function compensateBulkToolbarScroll(delta: number) {
    if (delta === 0) return;
    const main = document.querySelector('main.overflow-y-auto');
    if (main instanceof HTMLElement) {
      main.scrollTop += delta;
    }
  }

  function updateSelectionWithScrollAnchor(buildNext: (prev: Set<string>) => Set<string>) {
    const prev = selectedBookingIds;
    const next = buildNext(new Set(prev));
    const appearing = prev.size === 0 && next.size > 0;
    const disappearing = prev.size > 0 && next.size === 0;
    const toolbarHeightBeforeHide = disappearing ? (bulkToolbarRef.current?.offsetHeight ?? 0) : 0;

    setSelectedBookingIds(next);

    if (appearing) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const height = bulkToolbarRef.current?.offsetHeight ?? 0;
          compensateBulkToolbarScroll(height);
        });
      });
    } else if (disappearing && toolbarHeightBeforeHide > 0) {
      requestAnimationFrame(() => {
        compensateBulkToolbarScroll(-toolbarHeightBeforeHide);
      });
    }
  }

  const handleBookingClick = useCallback((bookingId: string) => {
    setSelectedBookingId(bookingId);
  }, []);

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
    setCurrentlyParked((prev) => {
      const existing = prev.find((b) => b.id === bookingId);
      const fromOthers =
        arrivals.find((b) => b.id === bookingId) ||
        departures.find((b) => b.id === bookingId) ||
        existing;
      if (!fromOthers && !existing) return prev;

      const updated = { ...(existing || fromOthers)!, ...patch } as Booking;
      const without = prev.filter((b) => b.id !== bookingId);
      if (isCurrentlyParked(updated)) {
        return [updated, ...without];
      }
      return without;
    });
  };

  const restoreBookingInLists = (bookingId: string, snapshot: Booking | null) => {
    if (!snapshot) return;
    patchBookingInLists(bookingId, snapshot);
  };

  const findBookingById = (bookingId: string): Booking | null =>
    [...arrivals, ...departures, ...currentlyParked].find((b) => b.id === bookingId) ?? null;

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

  const handleUnhide = useCallback((booking: TodayBoardBooking) => {
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
        setArrivals(prev => prev.map(b => b.id === booking.id ? updated as Booking : b));
        setDepartures(prev => prev.map(b => b.id === booking.id ? updated as Booking : b));
        setCurrentlyParked(prev => prev.map(b => b.id === booking.id ? updated as Booking : b));
        toast({ title: 'Booking unhidden' });
      } catch (err: unknown) {
        toast({ title: 'Error', description: err instanceof Error ? err.message : 'Could not unhide', variant: 'destructive' });
      }
    });
  }, [toast]);

  const bookingsRef = useRef({ arrivals, departures, currentlyParked });
  bookingsRef.current = { arrivals, departures, currentlyParked };

  const updateHighlight = useCallback((bookingId: string, highlightCode: BookingHighlightCode) => {
    const lists = bookingsRef.current;
    const snapshot =
      lists.arrivals.find((b) => b.id === bookingId) ??
      lists.departures.find((b) => b.id === bookingId) ??
      lists.currentlyParked.find((b) => b.id === bookingId);
    if (!snapshot) return;
    const previous = snapshot.highlight_code;

    patchBookingInLists(bookingId, { highlight_code: highlightCode });

    void fetch('/api/admin/bookings/highlight', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId,
        tenantId: tenant.id,
        highlightCode,
      }),
    })
      .then(async (res) => {
        const json = (await parseJsonFromResponse(res)) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error || 'Failed to update highlight');
        }
      })
      .catch((err: unknown) => {
        patchBookingInLists(bookingId, { highlight_code: previous });
        const message = err instanceof Error ? err.message : 'Could not update highlight';
        toast({ title: 'Highlight not saved', description: message, variant: 'destructive' });
      });
  }, [tenant.id, toast]);

  const handleRowSelectChange = useCallback((bookingId: string, checked: boolean) => {
    updateSelectionWithScrollAnchor((prev) => {
      const next = new Set(prev);
      if (checked) next.add(bookingId);
      else next.delete(bookingId);
      return next;
    });
  }, [selectedBookingIds]);

  const updateBookingStatusRef = useRef(updateBookingStatus);
  updateBookingStatusRef.current = updateBookingStatus;

  const handleRowQuickAction = useCallback((bookingId: string, action: OpsAction) => {
    void updateBookingStatusRef.current(bookingId, action);
  }, []);

  const fetchDataForDateRange = useCallback(async (from: string, to: string) => {
    const rangeKey = `${from}:${to}`;
    if (loadedRangeRef.current === rangeKey) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/admin/today?from=${from}&to=${to}`);
      const data = (await parseJsonFromResponse(response)) as {
        kpis?: KPIs;
        arrivals?: Booking[];
        departures?: Booking[];
        currentlyParked?: Booking[];
        queryError?: string;
      };
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const defaultKpis: KPIs = { arrivals: 0, departures: 0, checkedIn: 0, capacityLeft: 0, totalRevenue: 0 };
      setKpis(data.kpis ?? defaultKpis);
      setArrivals(data.arrivals ?? []);
      setDepartures(data.departures ?? []);
      setCurrentlyParked((data.currentlyParked ?? []).filter(isCurrentlyParked));
      setQueryError(data.queryError);
      loadedRangeRef.current = rangeKey;
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Tenant-scoped realtime: keep parked/arrival/departure KPIs in sync across devices.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`today-ops-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          loadedRangeRef.current = '';
          void fetchDataForDateRange(currentDateRange.from, currentDateRange.to);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenant.id, currentDateRange.from, currentDateRange.to, fetchDataForDateRange]);

  const handleDateRangeChange = useCallback((dateRange: { from: string; to: string }) => {
    setCurrentDateRange(dateRange);
    void fetchDataForDateRange(dateRange.from, dateRange.to);
  }, [fetchDataForDateRange]);

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

  function matchesKeyFilters<T extends { gate_status?: string | null }>(b: T) {
    if (filterArrivedKeyTaken) return b.gate_status === GATE_STATUS.ARRIVED_KEY_TAKEN;
    if (filterKeysTaken) return b.gate_status === GATE_STATUS.TAKE_KEY || b.gate_status === GATE_STATUS.ARRIVED_KEY_TAKEN;
    return true;
  }

  // Operational lists hide cancelled bookings permanently; reports still retain the records.
  function applyStatusFilters<T extends { ops_hidden?: boolean | null; gate_status?: string | null; status?: string | null }>(
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

  const liveParked = useMemo(
    () => currentlyParked.filter(isCurrentlyParked),
    [currentlyParked]
  );

  const liveKpis = useMemo(() => ({
    arrivalsRemaining: visibleArrivals.filter(isArrivalRemaining).length,
    departuresRemaining: visibleDepartures.filter(isDepartureRemaining).length,
    keysToTake: visibleArrivals.filter(isKeysToTakeRemaining).length,
    currentlyParked: liveParked.length,
  }), [visibleArrivals, visibleDepartures, liveParked]);

  const capacityRemaining = Math.max(0, (kpis.capacityLeft + kpis.checkedIn) - liveParked.length);

  const sortedCurrentlyParked = useMemo(() => {
    return sortBookings(liveParked, parkedSort, 'start_at');
  }, [liveParked, parkedSort]);

  const groupedByDay = useMemo(() => {
    return groupArrivalsAndDeparturesByDay(visibleArrivals, visibleDepartures, tenantTz);
  }, [visibleArrivals, visibleDepartures, tenantTz]);

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
  const hasBulkSelection = selectedBookingIds.size > 0;

  const selectAllVisible = (checked: boolean) => {
    updateSelectionWithScrollAnchor((prev) => {
      const next = new Set(prev);
      for (const id of visibleOperationalIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    updateSelectionWithScrollAnchor(() => new Set());
  };

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

  const StatCard = ({
    label,
    value,
    delta,
    variant,
    rightSlot,
    onClick,
  }: {
    label: string;
    value: number;
    delta?: string;
    variant?: 'success' | 'danger' | 'info' | 'warning';
    rightSlot?: React.ReactNode;
    onClick?: () => void;
  }) => {
    const color =
      variant === 'success' ? 'border-green-200' :
      variant === 'danger' ? 'border-red-200' :
      variant === 'warning' ? 'border-yellow-200' :
      variant === 'info' ? 'border-blue-200' : 'border-gray-200';
    return (
      <button
        type="button"
        disabled={!onClick}
        onClick={onClick}
        className={`bg-white rounded-lg border ${color} p-4 text-left w-full ${onClick ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-gray-600">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            {delta ? <p className="text-xs text-gray-500 mt-1">{delta}</p> : null}
            {onClick ? <p className="text-xs text-blue-600 mt-1">View vehicles →</p> : null}
          </div>
          {rightSlot}
        </div>
      </button>
    );
  };

  const rowProps = useMemo(
    () => ({
      timezone: tenantTz,
      highlightMode,
      showHidden,
      onBookingClick: handleBookingClick,
      onUnhide: handleUnhide,
      onSelectChange: handleRowSelectChange,
      onQuickAction: handleRowQuickAction,
      onHighlightSelect: updateHighlight,
    }),
    [
      tenantTz,
      highlightMode,
      showHidden,
      handleBookingClick,
      handleUnhide,
      handleRowSelectChange,
      handleRowQuickAction,
      updateHighlight,
    ]
  );

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Today&apos;s Overview</h1>
            <p className="text-gray-600">Welcome to {tenant.name}</p>
          </div>
          <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2">
            <Button
              className="shrink-0 w-full sm:w-auto"
              onClick={() => setNewBookingOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add booking
            </Button>
            <Button
              variant={highlightMode ? 'default' : 'outline'}
              onClick={() => setHighlightMode((v) => !v)}
              className="shrink-0 w-full sm:w-auto"
            >
              {highlightMode ? 'Done highlighting' : 'Highlight bookings'}
            </Button>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="max-w-xs">
          <DateRangeSelector
            onDateRangeChange={handleDateRangeChange}
            tenantTimezone={tenantTz}
            initialFrom={initialDateRange.from}
            initialTo={initialDateRange.to}
            skipInitialFetch
          />
        </div>

        {queryError && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Could not load some booking data: {queryError}
          </div>
        )}

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
            value={liveKpis.currentlyParked} 
            variant="info" 
            rightSlot={<Car className="h-4 w-4 text-blue-500" />}
            onClick={() => setParkedSheetOpen(true)}
          />
          <StatCard 
            label="Capacity Remaining" 
            value={capacityRemaining}
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
            <div className="space-y-2 border-t border-gray-100 px-4 py-3 md:px-6">
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
              {hasBulkSelection && (
                <div
                  ref={bulkToolbarRef}
                  className="flex items-center gap-2 overflow-x-auto rounded-md border border-blue-200 bg-blue-50 px-3 py-2"
                >
                  <span className="shrink-0 text-sm font-medium text-blue-900">
                    {selectedBookingIds.size} selected
                  </span>
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => runBulkAction('arrived')}>
                    Mark Arrived
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => runBulkAction('arrived_key_taken')}>
                    Mark Arrived + Key Taken
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => runBulkAction('take_key')}>
                    Mark Take Key
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => runBulkAction('departed')}>
                    Mark Departed
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => runBulkAction('no_show')}>
                    Mark No Show
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => runBulkAction('reserved')}>
                    Reset to Reserved
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => runBulkAction('cancelled')}>
                    Cancel Booking
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              )}
            </div>
          )}
          {!arrivalsDeparturesCollapsed && (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed divide-y divide-gray-200">
                <thead className="bg-gray-50 hidden md:table-header-group">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Time</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[8.5rem]">Number plate</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Telephone</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Flight / Return
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status / actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupedByDay.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        <div>No arrivals or departures in this period</div>
                        {(arrivals.length > 0 || departures.length > 0) && (
                          <div className="mt-2 text-sm text-amber-700">
                            {arrivals.length} arrival(s) and {departures.length} departure(s) loaded but hidden by
                            filters — try &quot;Show hidden&quot; or clear Keys Taken filters.
                          </div>
                        )}
                        {arrivals.length === 0 && departures.length === 0 && kpis.checkedIn > 0 && (
                          <div className="mt-2 text-sm text-gray-600">
                            {kpis.checkedIn} vehicle(s) currently parked overlap today but none start or end on this
                            date.
                          </div>
                        )}
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
                            <td colSpan={6} className="px-4 py-3">
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
                                    <td colSpan={6} className="py-1">
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
                                    <TodayBookingRow
                                      key={`arrival-${booking.id}`}
                                      {...rowProps}
                                      booking={booking}
                                      section="arrivals"
                                      isSelected={selectedBookingIds.has(booking.id)}
                                      isPending={Boolean(pendingById[booking.id])}
                                    />
                                  ))}
                                </>
                              )}
                              {/* Departures for this date — prominent green banner */}
                              {dayGroup.departures.length > 0 && (
                                <>
                                  <tr className="bg-green-600 border-t border-green-700">
                                    <td colSpan={6} className="py-1">
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
                                    <TodayBookingRow
                                      key={`departure-${booking.id}`}
                                      {...rowProps}
                                      booking={booking}
                                      section="departures"
                                      isSelected={selectedBookingIds.has(booking.id)}
                                      isPending={Boolean(pendingById[booking.id])}
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

        {/* Currently Parked — live on-site vehicles only */}
        <section className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Currently Parked</h2>
                <p className="text-sm text-gray-600">
                  Vehicles that have arrived and not yet departed ({liveKpis.currentlyParked})
                </p>
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 hidden md:table-header-group">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-[8.5rem]">Number plate</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Telephone</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Flight</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status / actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedCurrentlyParked.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No cars currently parked
                    </td>
                  </tr>
                ) : (
                  sortedCurrentlyParked.map((booking) => (
                    <TodayBookingRow
                      key={booking.id}
                      {...rowProps}
                      booking={booking}
                      section="parked"
                      isSelected={selectedBookingIds.has(booking.id)}
                      isPending={Boolean(pendingById[booking.id])}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Sheet open={parkedSheetOpen} onOpenChange={setParkedSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Currently parked ({liveKpis.currentlyParked})</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {sortedCurrentlyParked.length === 0 ? (
              <p className="text-sm text-gray-500">No vehicles on site.</p>
            ) : (
              sortedCurrentlyParked.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  className="w-full rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
                  onClick={() => {
                    setParkedSheetOpen(false);
                    setSelectedBookingId(booking.id);
                  }}
                >
                  <div className="font-medium text-gray-900">{booking.customer_name || '—'}</div>
                  <div className="mt-1 font-mono text-sm font-semibold uppercase tracking-wider text-gray-900">
                    {(booking.plate || '—').toUpperCase()}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    Ref {booking.reference} · Arrived{' '}
                    {formatBookingDateTimeForTenant({
                      timestamp: booking.arrived_at || booking.start_at,
                      timezone: tenantTz,
                    })}
                  </div>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <NewBookingModal
        tenantId={tenant.id}
        open={newBookingOpen}
        onClose={() => setNewBookingOpen(false)}
        onBookingCreated={() => {
          toast({ title: 'Booking created' });
          loadedRangeRef.current = '';
          void fetchDataForDateRange(currentDateRange.from, currentDateRange.to);
        }}
      />

      {/* Booking Details Modal */}
      {selectedBookingId && (
        <BookingDetailsModal
          booking={
            ([...arrivals, ...departures, ...currentlyParked].find((b) => b.id === selectedBookingId) ??
              null) as React.ComponentProps<typeof BookingDetailsModal>['booking']
          }
          open={!!selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onBookingUpdated={(saved) => {
            if (saved?.id) {
              patchBookingInLists(saved.id, saved as Partial<Booking>);
            }
            loadedRangeRef.current = '';
            void fetchDataForDateRange(currentDateRange.from, currentDateRange.to);
          }}
        />
      )}
    </>
  );
}

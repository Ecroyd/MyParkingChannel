'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CalendarDays,
  Search,
  Plus,
  Filter,
  Trash2,
  Eye,
  Edit,
  ArrowUpDown,
  RefreshCw,
} from 'lucide-react';
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal';
import { useCanViewMoney } from '@/lib/auth/money-visibility';
import NewBookingModal from '@/components/bookings/NewBookingModal';
import { BookingHighlightIcon } from '@/components/bookings/BookingHighlightIcon';
import { DynamicPricingBadge } from '@/components/bookings/DynamicPricingBadge';
import { toast } from 'sonner';
import {
  type AdminBookingListQueryParams,
  type AdminBookingListResponse,
  ALLOWED_PAGE_SIZES,
  formatSortParam,
  getDefaultAdminBookingDateWindow,
  parseSortParam,
  type AllowedPageSize,
} from '@/lib/bookings/adminBookingListParams';
import type { BookingAdminListRow } from '@/lib/bookings/adminBookingListSelect';
import {
  BookingListRequestController,
  SEARCH_DEBOUNCE_MS,
  VISIBLE_POLL_INTERVAL_MS,
  buildAdminBookingsListUrl,
  canPollBookingList,
  formatBookingListFreshness,
  shouldRefreshOnVisibility,
} from '@/lib/bookings/adminBookingListClient';
import { addCalendarDays } from '@/lib/bookings/adminBookingListParams';
import { tenantTodayDateKey } from '@/lib/timezone';
import type { BookingHighlightCode } from '@/types/bookings';

const COMMON_CHANNELS = [
  'manual',
  'direct',
  'cavu',
  'parkvia',
  'holiday_extras',
  'holidayextras',
  'supplier_api',
  'aph',
] as const;

interface BookingsServerClientProps {
  user: { id: string; email?: string | null };
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone: string | null;
    default_capacity: number | null;
  };
  initialList: AdminBookingListResponse;
  initialParams: AdminBookingListQueryParams;
}

function inferDateRangePreset(
  dateFrom: string | null,
  dateTo: string | null,
  timezone: string,
  usedDefault: boolean
): string {
  if (!dateFrom && !dateTo) return 'all';
  if (usedDefault) return 'operational';

  const today = tenantTodayDateKey(timezone);
  if (dateFrom === today && dateTo === today) return 'today';
  if (dateFrom === today && dateTo === addCalendarDays(today, 7)) return 'next7days';
  if (dateFrom === today && dateTo === addCalendarDays(today, 14)) return 'next14days';
  if (dateFrom === today && dateTo === addCalendarDays(today, 30)) return 'next30days';

  const defaults = getDefaultAdminBookingDateWindow(timezone);
  if (dateFrom === defaults.dateFrom && dateTo === defaults.dateTo) return 'operational';

  return 'custom';
}

export default function BookingsServerClient({
  tenant,
  initialList,
  initialParams,
}: BookingsServerClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const canViewMoney = useCanViewMoney();
  const timezone = tenant.timezone || 'Europe/London';

  const [rows, setRows] = useState<BookingAdminListRow[]>(initialList.rows);
  const [page, setPage] = useState(initialParams.page);
  const [pageSize, setPageSize] = useState<AllowedPageSize>(initialParams.pageSize);
  const [totalCount, setTotalCount] = useState(initialList.totalCount);
  const [totalPages, setTotalPages] = useState(initialList.totalPages);
  const [searchTerm, setSearchTerm] = useState(initialParams.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initialParams.search);
  const [dateFrom, setDateFrom] = useState<string | null>(initialParams.dateFrom);
  const [dateTo, setDateTo] = useState<string | null>(initialParams.dateTo);
  const [datesCleared, setDatesCleared] = useState(
    !initialParams.dateFrom && !initialParams.dateTo && !initialParams.usedDefaultDateWindow
  );
  const [dateRangePreset, setDateRangePreset] = useState(() =>
    inferDateRangePreset(
      initialParams.dateFrom,
      initialParams.dateTo,
      timezone,
      initialParams.usedDefaultDateWindow
    )
  );
  const [customStartDate, setCustomStartDate] = useState(initialParams.dateFrom ?? '');
  const [customEndDate, setCustomEndDate] = useState(initialParams.dateTo ?? '');
  const [sortParam, setSortParam] = useState(
    formatSortParam(initialParams.sortField, initialParams.sortDirection)
  );
  const [showFinishedBookings, setShowFinishedBookings] = useState(initialParams.includeFinished);
  const [showCancelledBookings, setShowCancelledBookings] = useState(
    initialParams.includeCancelled
  );
  const [channelFilter, setChannelFilter] = useState(initialParams.source ?? 'all');
  const [statusFilter, setStatusFilter] = useState(initialParams.status ?? '');
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [newBookingModalOpen, setNewBookingModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAtMs, setRefreshedAtMs] = useState(() =>
    new Date(initialList.refreshedAt).getTime()
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  const requestController = useRef(new BookingListRequestController());
  const skipNextFetchRef = useRef(true);
  const hydratedUrlRef = useRef(false);
  const editingRef = useRef(false);
  editingRef.current = !!selectedBookingId || newBookingModalOpen;

  const sortOrder =
    parseSortParam(sortParam).sortDirection === 'asc' ? 'closest' : 'most_recent';

  // Debounce search input (~300ms); reset to page 1 when the committed search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch((prev) => {
        if (prev !== searchTerm) {
          setPage(1);
        }
        return searchTerm;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Subtle freshness clock (15s ticks — not distracting)
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const syncUrl = useCallback(
    (next: {
      page: number;
      pageSize: number;
      search: string;
      dateFrom: string | null;
      dateTo: string | null;
      datesCleared: boolean;
      status: string | null;
      source: string | null;
      sort: string;
    }) => {
      const qs = new URLSearchParams();
      qs.set('page', String(next.page));
      qs.set('pageSize', String(next.pageSize));
      if (next.search) qs.set('search', next.search);
      if (next.dateFrom) qs.set('dateFrom', next.dateFrom);
      if (next.dateTo) qs.set('dateTo', next.dateTo);
      if (next.datesCleared) qs.set('datesCleared', 'true');
      if (next.status) qs.set('status', next.status);
      if (next.source && next.source !== 'all') qs.set('source', next.source);
      qs.set('sort', next.sort);
      const query = qs.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  // Hydrate URL with current filters (including defaults) once after mount
  useEffect(() => {
    if (hydratedUrlRef.current) return;
    hydratedUrlRef.current = true;
    syncUrl({
      page,
      pageSize,
      search: debouncedSearch,
      dateFrom,
      dateTo,
      datesCleared,
      status: statusFilter || null,
      source: channelFilter,
      sort: sortParam,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time hydrate
  }, []);

  const fetchPage = useCallback(
    async (opts?: { reason?: string }) => {
      const gate = {
        visibilityState:
          typeof document !== 'undefined' ? document.visibilityState : ('visible' as const),
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        isEditing: editingRef.current,
        inFlight: requestController.current.inFlight,
      };

      // Poll / visibility refreshes must not overlap or run while hidden/editing/offline
      if (
        (opts?.reason === 'poll' || opts?.reason === 'visibility') &&
        !canPollBookingList(gate)
      ) {
        return;
      }

      const url = buildAdminBookingsListUrl(tenant.id, {
        page,
        pageSize,
        search: debouncedSearch,
        dateFrom,
        dateTo,
        status: statusFilter || null,
        source: channelFilter,
        sort: sortParam,
        includeCancelled: showCancelledBookings,
        includeFinished: showFinishedBookings,
        datesCleared,
      });

      setRefreshing(true);
      requestController.current.noteRefreshRequested();

      try {
        const result = await requestController.current.run(async (signal) => {
          const response = await fetch(url, { signal, cache: 'no-store' });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to fetch bookings');
          }
          return (await response.json()) as AdminBookingListResponse;
        });

        if (!result.ok) {
          return;
        }

        setRows(result.data.rows);
        setTotalCount(result.data.totalCount);
        setTotalPages(result.data.totalPages);
        setRefreshedAtMs(new Date(result.data.refreshedAt).getTime());
        setNowMs(Date.now());
        syncUrl({
          page: result.data.page,
          pageSize: result.data.pageSize,
          search: debouncedSearch,
          dateFrom: result.data.dateFrom,
          dateTo: result.data.dateTo,
          datesCleared,
          status: statusFilter || null,
          source: channelFilter,
          sort: sortParam,
        });
      } catch (error) {
        console.error('Failed to fetch bookings:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to fetch bookings');
      } finally {
        setRefreshing(false);
      }
    },
    [
      tenant.id,
      page,
      pageSize,
      debouncedSearch,
      dateFrom,
      dateTo,
      datesCleared,
      statusFilter,
      channelFilter,
      sortParam,
      showCancelledBookings,
      showFinishedBookings,
      syncUrl,
    ]
  );

  // Fetch when filters/pagination change — skip the immediate mount duplicate of SSR
  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    void fetchPage({ reason: 'filters' });
  }, [fetchPage]);

  // Optional lightweight refresh every 60s while visible
  useEffect(() => {
    const id = setInterval(() => {
      void fetchPage({ reason: 'poll' });
    }, VISIBLE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchPage]);

  // Refresh once when tab becomes visible if stale (>60s)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (
        shouldRefreshOnVisibility(refreshedAtMs, Date.now()) &&
        canPollBookingList({
          visibilityState: 'visible',
          online: navigator.onLine,
          isEditing: !!selectedBookingId || newBookingModalOpen,
          inFlight: requestController.current.inFlight,
        })
      ) {
        void fetchPage({ reason: 'visibility' });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchPage, refreshedAtMs, selectedBookingId, newBookingModalOpen]);

  const applyDatePreset = (preset: string) => {
    setDateRangePreset(preset);
    const today = tenantTodayDateKey(timezone);

    if (preset === 'all') {
      setDateFrom(null);
      setDateTo(null);
      setDatesCleared(true);
      setCustomStartDate('');
      setCustomEndDate('');
      setPage(1);
      return;
    }

    setDatesCleared(false);
    if (preset === 'operational') {
      const w = getDefaultAdminBookingDateWindow(timezone);
      setDateFrom(w.dateFrom);
      setDateTo(w.dateTo);
      setCustomStartDate(w.dateFrom);
      setCustomEndDate(w.dateTo);
    } else if (preset === 'today') {
      setDateFrom(today);
      setDateTo(today);
      setCustomStartDate(today);
      setCustomEndDate(today);
    } else if (preset === 'next7days') {
      setDateFrom(today);
      setDateTo(addCalendarDays(today, 7));
      setCustomStartDate(today);
      setCustomEndDate(addCalendarDays(today, 7));
    } else if (preset === 'next14days') {
      setDateFrom(today);
      setDateTo(addCalendarDays(today, 14));
      setCustomStartDate(today);
      setCustomEndDate(addCalendarDays(today, 14));
    } else if (preset === 'next30days') {
      setDateFrom(today);
      setDateTo(addCalendarDays(today, 30));
      setCustomStartDate(today);
      setCustomEndDate(addCalendarDays(today, 30));
    } else if (preset === 'custom') {
      // keep current custom fields
    }
    setPage(1);
  };

  const getUniqueChannels = () => {
    const channels = new Set<string>(COMMON_CHANNELS);
    rows.forEach((booking) => {
      if (booking.source) channels.add(booking.source);
      if (booking.external_source?.trim()) channels.add(booking.external_source.trim());
    });
    return Array.from(channels).sort();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reserved':
        return 'bg-blue-100 text-blue-800';
      case 'checked_in':
        return 'bg-green-100 text-green-800';
      case 'checked_out':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  };

  const formatBookingSource = (source?: string | null) => {
    if (!source) return 'Unknown';
    switch (source) {
      case 'manual':
        return 'Manual';
      case 'supplier_api':
        return 'Supplier API';
      case 'direct':
        return 'Direct';
      case 'parkvia':
        return 'Parkvia';
      case 'holidayextras':
      case 'holiday_extras':
        return 'Holiday Extras';
      default:
        return source.replace(/_/g, ' ');
    }
  };

  const getBookingSourceLabel = (booking: BookingAdminListRow) => {
    if (booking.external_source && booking.external_source.trim().length > 0) {
      return booking.external_source.trim();
    }
    return formatBookingSource(booking.source);
  };

  const handleBookingClick = (booking: BookingAdminListRow) => {
    setSelectedBookingId(booking.id);
  };

  const handleSelectBooking = (bookingId: string, checked: boolean) => {
    const next = new Set(selectedBookings);
    if (checked) next.add(bookingId);
    else next.delete(bookingId);
    setSelectedBookings(next);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedBookings(new Set(rows.map((b) => b.id)));
    else setSelectedBookings(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedBookings.size === 0) return;

    setLoading(true);
    requestController.current.resetRefreshCount();
    try {
      const response = await fetch('/api/admin/bookings/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingIds: Array.from(selectedBookings),
          tenantId: tenant.id,
        }),
      });

      if (response.ok) {
        toast.success(`Successfully hidden ${selectedBookings.size} booking(s)`);
        setSelectedBookings(new Set());
        // One refresh after all mutations complete
        await fetchPage({ reason: 'bulk' });
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to hide bookings');
      }
    } catch {
      toast.error('Failed to delete bookings');
    } finally {
      setLoading(false);
    }
  };

  const freshness = formatBookingListFreshness(refreshedAtMs, nowMs, refreshing);
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
          <p className="text-gray-600">Manage bookings for {tenant?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span aria-live="polite">{freshness}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchPage({ reason: 'manual' })}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setNewBookingModalOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add booking
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateRange">Date Range</Label>
              <Select value={dateRangePreset} onValueChange={applyDatePreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operational">Operational (−30d / +180d)</SelectItem>
                  <SelectItem value="all">All Bookings (paginated)</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="next7days">Next 7 Days</SelectItem>
                  <SelectItem value="next14days">Next 14 Days</SelectItem>
                  <SelectItem value="next30days">Next 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRangePreset === 'custom' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => {
                      setCustomStartDate(e.target.value);
                      setDateFrom(e.target.value || null);
                      setDatesCleared(false);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => {
                      setCustomEndDate(e.target.value);
                      setDateTo(e.target.value || null);
                      setDatesCleared(false);
                      setPage(1);
                    }}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Reference, name, plate…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              {(dateFrom || dateTo) && searchTerm.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Search ignores the date filter so far-ahead bookings still appear.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort By</Label>
              <Select
                value={sortOrder}
                onValueChange={(value: 'closest' | 'most_recent') => {
                  setSortParam(
                    formatSortParam('start_at', value === 'closest' ? 'asc' : 'desc')
                  );
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-gray-400" />
                    <SelectValue placeholder="Sort order" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="closest">Closest First</SelectItem>
                  <SelectItem value="most_recent">Most Recent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="channel">Channel</Label>
              <Select
                value={channelFilter}
                onValueChange={(value) => {
                  setChannelFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  {getUniqueChannels().map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {formatBookingSource(channel)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={statusFilter || 'any'}
                onValueChange={(value) => {
                  setStatusFilter(value === 'any' ? '' : value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any status</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="checked_in">Checked in</SelectItem>
                  <SelectItem value="checked_out">Checked out</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pageSize">Page size</Label>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value) as AllowedPageSize);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALLOWED_PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Bookings ({totalCount})
              <span className="text-sm font-normal text-gray-500">
                {totalCount === 0
                  ? ''
                  : `Showing ${rangeStart}–${rangeEnd} of ${totalCount}`}
              </span>
            </CardTitle>
            {selectedBookings.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{selectedBookings.size} selected</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={loading}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDays className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No bookings found</p>
              <p className="text-sm text-gray-400 mt-2">
                {debouncedSearch
                  ? 'Try adjusting your search terms'
                  : 'Create your first booking to get started'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedBookings.size === rows.length && rows.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Select All ({rows.length} on this page)
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="showFinished"
                      checked={showFinishedBookings}
                      onCheckedChange={(checked) => {
                        setShowFinishedBookings(checked as boolean);
                        setPage(1);
                      }}
                    />
                    <label
                      htmlFor="showFinished"
                      className="text-sm font-medium text-gray-700 cursor-pointer"
                    >
                      Show finished bookings
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="showCancelled"
                      checked={showCancelledBookings}
                      onCheckedChange={(checked) => {
                        setShowCancelledBookings(checked as boolean);
                        setPage(1);
                      }}
                    />
                    <label
                      htmlFor="showCancelled"
                      className="text-sm font-medium text-gray-700 cursor-pointer"
                    >
                      Show cancelled bookings
                    </label>
                  </div>
                </div>
              </div>

              {rows.map((booking) => (
                <div key={booking.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Checkbox
                        checked={selectedBookings.has(booking.id)}
                        onCheckedChange={(checked) =>
                          handleSelectBooking(booking.id, checked as boolean)
                        }
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <BookingHighlightIcon
                            highlightCode={
                              (booking.highlight_code as BookingHighlightCode) || 'none'
                            }
                          />
                          {booking.reference && (
                            <span className="text-sm font-semibold text-gray-900">
                              #{booking.reference}
                            </span>
                          )}
                          <h3 className="font-medium text-gray-900">
                            {booking.customer_name || 'Unknown Customer'}
                          </h3>
                          <Badge className={getStatusColor(booking.status || '')}>
                            {(booking.status || 'unknown').replace('_', ' ').toUpperCase()}
                          </Badge>
                          {booking.is_incomplete && (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              Incomplete ({booking.missing_fields?.join(', ')})
                            </Badge>
                          )}
                          <DynamicPricingBadge
                            applied={booking.dynamic_pricing_applied ?? undefined}
                            multiplier={booking.dynamic_pricing_multiplier}
                            occupancyPercent={booking.dynamic_pricing_occupancy_percent}
                            ruleId={booking.dynamic_pricing_rule_id}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Vehicle:</span>{' '}
                            <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded tracking-wide">
                              {booking.plate}
                            </span>
                            {booking.car_make || booking.car_model
                              ? ` — ${[booking.car_make, booking.car_model].filter(Boolean).join(' ')}`
                              : ''}
                          </div>
                          <div>
                            <span className="font-medium">Period:</span>{' '}
                            {formatDate(booking.start_at)} - {formatDate(booking.end_at)}
                          </div>
                          {canViewMoney && (
                            <div>
                              <span className="font-medium">Amount:</span> £
                              {booking.money_charged || 0}
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">
                              {getBookingSourceLabel(booking)}
                            </span>
                            {booking.external_source && booking.source && (
                              <span className="text-xs text-gray-500">
                                {formatBookingSource(booking.source)}
                              </span>
                            )}
                          </div>
                          {booking.flight_number && (
                            <div>
                              <span className="font-medium">Flight:</span> {booking.flight_number}
                            </div>
                          )}
                          {(booking.customer_email || booking.customer_phone) && (
                            <div>
                              <span className="font-medium">Contact:</span>
                              {booking.customer_email && (
                                <span className="ml-1">{booking.customer_email}</span>
                              )}
                              {booking.customer_phone && (
                                <span className="ml-2">{booking.customer_phone}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBookingClick(booking)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBookingClick(booking)}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || refreshing}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || refreshing}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedBookingId && (
        <BookingDetailsModal
          // List row is a subset; modal fetches full booking on open for notes/edit fields.
          booking={(rows.find((b) => b.id === selectedBookingId) as never) ?? null}
          open={!!selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onBookingUpdated={() => {
            void fetchPage({ reason: 'mutation' });
          }}
        />
      )}

      <NewBookingModal
        tenantId={tenant.id}
        open={newBookingModalOpen}
        onClose={() => setNewBookingModalOpen(false)}
        onBookingCreated={() => {
          setNewBookingModalOpen(false);
          void fetchPage({ reason: 'mutation' });
        }}
      />
    </div>
  );
}

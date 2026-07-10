'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarDays, Search, Filter, Trash2, Eye, Edit, ArrowUpDown } from 'lucide-react';
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal';
import NewBookingDialog from '@/components/bookings/NewBookingDialog';
import { BookingHighlightIcon } from '@/components/bookings/BookingHighlightIcon';
import { DynamicPricingBadge } from '@/components/bookings/DynamicPricingBadge';
import { notifyBookingsChanged } from '@/lib/bookings/operational-state';
import { toast } from 'sonner';

interface BookingsServerClientProps {
  user: any;
  tenant: any;
  bookings: any[];
}

export default function BookingsServerClient({ user, tenant, bookings: initialBookings }: BookingsServerClientProps) {
  const [bookings, setBookings] = useState<any[]>(initialBookings);
  const [filteredBookings, setFilteredBookings] = useState<any[]>(initialBookings);
  const [dateRange, setDateRange] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'closest' | 'most_recent'>('closest');
  const [showFinishedBookings, setShowFinishedBookings] = useState(true);
  const [showCancelledBookings, setShowCancelledBookings] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const getDateRange = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let result;
    switch (dateRange) {
      case 'today':
        result = { from: todayStr, to: todayStr };
        break;
      case 'next7days':
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextWeek.toISOString().split('T')[0] };
        break;
      case 'next14days':
        const nextTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextTwoWeeks.toISOString().split('T')[0] };
        break;
      case 'next30days':
        const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextMonth.toISOString().split('T')[0] };
        break;
      case 'custom':
        result = { from: customStartDate, to: customEndDate };
        break;
      default:
        result = null; // 'all' - no date filtering
    }
    
    console.log(`Date range for ${dateRange}:`, result);
    return result;
  };

  const filterBookingsByDate = (bookings: any[], dateRange: any) => {
    if (!dateRange) return bookings; // 'all' - return all bookings
    
    return bookings.filter(booking => {
      if (!booking.start_at || !booking.end_at) return true; // Include bookings without dates
      const startDate = new Date(booking.start_at).toISOString().split('T')[0];
      const endDate = new Date(booking.end_at).toISOString().split('T')[0];
      
      // Check if booking overlaps with the date range
      return startDate <= dateRange.to && endDate >= dateRange.from;
    });
  };

  const filterBookingsBySearch = (bookings: any[], searchTerm: string) => {
    if (!searchTerm) return bookings;
    
    const term = searchTerm.toLowerCase();
    return bookings.filter(booking => 
      booking.reference?.toLowerCase().includes(term) ||
      booking.customer_name?.toLowerCase().includes(term) ||
      booking.customer_email?.toLowerCase().includes(term) ||
      booking.customer_phone?.toLowerCase().includes(term) ||
      booking.plate?.toLowerCase().includes(term)
    );
  };

  const filterFinishedBookings = (bookings: any[], showFinished: boolean) => {
    if (showFinished) return bookings;
    
    const now = new Date();
    return bookings.filter(booking => {
      if (!booking.end_at) return true; // Include bookings without end_at
      const endDate = new Date(booking.end_at);
      return endDate >= now;
    });
  };

  const filterCancelledBookings = (bookings: any[], showCancelled: boolean) => {
    if (showCancelled) return bookings;
    
    return bookings.filter(booking => booking.status !== 'cancelled');
  };

  const filterByChannel = (bookings: any[], channel: string) => {
    if (channel === 'all') return bookings;
    
    return bookings.filter(booking => {
      // Check both source enum and external_source field
      const source = booking.source;
      const externalSource = booking.external_source;
      
      // If channel matches the source enum directly
      if (source === channel) return true;
      
      // If channel is 'cavu' and source is 'cavu', match
      if (channel === 'cavu' && source === 'cavu') return true;
      
      // For other channels, check if external_source matches (case-insensitive)
      if (externalSource && externalSource.toLowerCase() === channel.toLowerCase()) return true;
      
      return false;
    });
  };

  const sortBookings = (bookings: any[], sortOrder: 'closest' | 'most_recent') => {
    const sorted = [...bookings];
    sorted.sort((a, b) => {
      const dateA = new Date(a.start_at).getTime();
      const dateB = new Date(b.start_at).getTime();
      
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

  // Fetch bookings from API
  const fetchBookings = useCallback(async () => {
    try {
      setRefreshing(true);
      const response = await fetch(`/api/admin/bookings/list?tenantId=${tenant.id}`);
      if (response.ok) {
        const data = await response.json();
        const fetchedBookings = data.bookings || [];
        console.log('[Bookings Fetch] Fetched bookings:', fetchedBookings.length);
        // Check if the specific booking is in the results
        const targetBooking = fetchedBookings.find((b: any) => b.reference === 'QRSW36');
        if (targetBooking) {
          console.log('[Bookings Fetch] Found QRSW36 booking:', targetBooking);
        } else {
          console.log('[Bookings Fetch] QRSW36 booking NOT found in fetched results');
        }
        setBookings(fetchedBookings);
      } else {
        const errorData = await response.json();
        console.error('[Bookings Fetch] API error:', errorData);
      }
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    } finally {
      setRefreshing(false);
    }
  }, [tenant.id]);

  // Fetch bookings on mount and set up polling
  useEffect(() => {
    fetchBookings();
    // Refresh every 15 seconds
    const interval = setInterval(fetchBookings, 15000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  // Get unique channels from bookings
  const getUniqueChannels = () => {
    const channels = new Set<string>();
    bookings.forEach(booking => {
      if (booking.source) {
        channels.add(booking.source);
      }
      // Only add external_source if it's not empty
      if (booking.external_source && booking.external_source.trim().length > 0) {
        channels.add(booking.external_source);
      }
    });
    return Array.from(channels).sort();
  };

  // Filter and sort bookings when filters or sort order changes
  useEffect(() => {
    const dateRangeObj = getDateRange();
    const dateFiltered = filterBookingsByDate(bookings, dateRangeObj);
    const searchFiltered = filterBookingsBySearch(dateFiltered, searchTerm);
    const finishedFiltered = filterFinishedBookings(searchFiltered, showFinishedBookings);
    const cancelledFiltered = filterCancelledBookings(finishedFiltered, showCancelledBookings);
    const channelFiltered = filterByChannel(cancelledFiltered, channelFilter);
    const sorted = sortBookings(channelFiltered, sortOrder);
    
    // Debug logging
    console.log('[Bookings Filter] Total bookings:', bookings.length);
    console.log('[Bookings Filter] After date filter:', dateFiltered.length);
    console.log('[Bookings Filter] After search filter:', searchFiltered.length);
    console.log('[Bookings Filter] After finished filter:', finishedFiltered.length);
    console.log('[Bookings Filter] After cancelled filter:', cancelledFiltered.length);
    console.log('[Bookings Filter] After channel filter:', channelFiltered.length);
    console.log('[Bookings Filter] Final filtered count:', sorted.length);
    
    setFilteredBookings(sorted);
  }, [dateRange, customStartDate, customEndDate, searchTerm, sortOrder, showFinishedBookings, showCancelledBookings, channelFilter, bookings]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reserved': return 'bg-blue-100 text-blue-800';
      case 'checked_in': return 'bg-green-100 text-green-800';
      case 'checked_out': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
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
        return 'Holiday Extras';
      default:
        return source.replace(/_/g, ' ');
    }
  };

  const getBookingSourceLabel = (booking: any) => {
    // Prefer external_source if available, otherwise format the enum source
    if (booking.external_source && booking.external_source.trim().length > 0) {
      return booking.external_source.trim();
    }
    return formatBookingSource(booking.source);
  };

  const handleBookingClick = (booking: any) => {
    setSelectedBookingId(booking.id);
  };

  const handleSelectBooking = (bookingId: string, checked: boolean) => {
    const newSelected = new Set(selectedBookings);
    if (checked) {
      newSelected.add(bookingId);
    } else {
      newSelected.delete(bookingId);
    }
    setSelectedBookings(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBookings(new Set(filteredBookings.map(b => b.id)));
    } else {
      setSelectedBookings(new Set());
    }
  };

  const handleBulkDelete = async () => {
    if (selectedBookings.size === 0) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/admin/bookings/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingIds: Array.from(selectedBookings),
          tenantId: tenant.id
        }),
      });

      if (response.ok) {
        toast.success(`Successfully hidden ${selectedBookings.size} booking(s)`);
        setSelectedBookings(new Set());
        // Refresh bookings from API
        await fetchBookings();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to hide bookings');
      }
    } catch (error) {
      toast.error('Failed to delete bookings');
    } finally {
      setLoading(false);
    }
  };

  const handleBookingUpdated = useCallback(() => {
    notifyBookingsChanged();
    void fetchBookings();
  }, [fetchBookings]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
          <p className="text-gray-600">Manage bookings for {tenant?.name}</p>
        </div>
        <NewBookingDialog tenantId={tenant.id} onCreated={handleBookingUpdated} label="Add booking" />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date Range Filter */}
            <div className="space-y-2">
              <Label htmlFor="dateRange">Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bookings</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="next7days">Next 7 Days</SelectItem>
                  <SelectItem value="next14days">Next 14 Days</SelectItem>
                  <SelectItem value="next30days">Next 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Range */}
            {dateRange === 'custom' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Search bookings..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Sort Order */}
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort By</Label>
              <Select value={sortOrder} onValueChange={(value: 'closest' | 'most_recent') => setSortOrder(value)}>
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

            {/* Channel Filter */}
            <div className="space-y-2">
              <Label htmlFor="channel">Channel</Label>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  {getUniqueChannels().map(channel => (
                    <SelectItem key={channel} value={channel}>
                      {formatBookingSource(channel)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bookings List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Bookings ({filteredBookings.length})
              {refreshing && (
                <span className="text-sm text-gray-500 ml-2">(refreshing...)</span>
              )}
            </CardTitle>
            {selectedBookings.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {selectedBookings.size} selected
                </span>
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
          {filteredBookings.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDays className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No bookings found</p>
              <p className="text-sm text-gray-400 mt-2">
                {searchTerm ? 'Try adjusting your search terms' : 'Create your first booking to get started'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Select All Header */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedBookings.size === filteredBookings.length && filteredBookings.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Select All ({filteredBookings.length} bookings)
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="showFinished"
                      checked={showFinishedBookings}
                      onCheckedChange={(checked) => setShowFinishedBookings(checked as boolean)}
                    />
                    <label htmlFor="showFinished" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Show finished bookings
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="showCancelled"
                      checked={showCancelledBookings}
                      onCheckedChange={(checked) => setShowCancelledBookings(checked as boolean)}
                    />
                    <label htmlFor="showCancelled" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Show cancelled bookings
                    </label>
                  </div>
                </div>
              </div>

              {filteredBookings.map((booking) => (
                <div key={booking.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Checkbox
                        checked={selectedBookings.has(booking.id)}
                        onCheckedChange={(checked) => handleSelectBooking(booking.id, checked as boolean)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <BookingHighlightIcon highlightCode={booking.highlight_code || 'none'} />
                          {booking.reference && (
                            <span className="text-sm font-semibold text-gray-900">#{booking.reference}</span>
                          )}
                          <h3 className="font-medium text-gray-900">
                            {booking.customer_name || 'Unknown Customer'}
                          </h3>
                          <Badge className={getStatusColor(booking.status)}>
                            {booking.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          {booking.is_incomplete && (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              Incomplete ({booking.missing_fields?.join(', ')})
                            </Badge>
                          )}
                          <DynamicPricingBadge
                            applied={booking.dynamic_pricing_applied}
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
                            {booking.car_make || booking.car_model ? ` — ${[booking.car_make, booking.car_model].filter(Boolean).join(' ')}` : ''}
                          </div>
                          <div>
                            <span className="font-medium">Period:</span> {formatDate(booking.start_at)} - {formatDate(booking.end_at)}
                          </div>
                          <div>
                            <span className="font-medium">Amount:</span> £{booking.money_charged || 0}
                          </div>
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
                              {booking.customer_email && <span className="ml-1">{booking.customer_email}</span>}
                              {booking.customer_phone && <span className="ml-2">{booking.customer_phone}</span>}
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Booking Details Modal */}
      {selectedBookingId && (
        <BookingDetailsModal
          booking={filteredBookings.find(b => b.id === selectedBookingId) || null}
          open={!!selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onBookingUpdated={handleBookingUpdated}
        />
      )}
    </div>
  );
}

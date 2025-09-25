'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarDays, Search, Plus, Filter } from 'lucide-react';

interface BookingsServerClientProps {
  user: any;
  tenant: any;
  bookings: any[];
}

export default function BookingsServerClient({ user, tenant, bookings }: BookingsServerClientProps) {
  const [filteredBookings, setFilteredBookings] = useState<any[]>(bookings);
  const [dateRange, setDateRange] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

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
      booking.plate?.toLowerCase().includes(term)
    );
  };

  // Filter bookings when date range or search changes
  useEffect(() => {
    const dateRangeObj = getDateRange();
    const dateFiltered = filterBookingsByDate(bookings, dateRangeObj);
    const searchFiltered = filterBookingsBySearch(dateFiltered, searchTerm);
    setFilteredBookings(searchFiltered);
  }, [dateRange, customStartDate, customEndDate, searchTerm, bookings]);

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
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
          <p className="text-gray-600">Manage bookings for {tenant?.name}</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          New Booking
        </Button>
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
          </div>
        </CardContent>
      </Card>

      {/* Bookings List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            Bookings ({filteredBookings.length})
          </CardTitle>
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
              {filteredBookings.map((booking) => (
                <div key={booking.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-gray-900">
                          {booking.customer_name || 'Unknown Customer'}
                        </h3>
                        <Badge className={getStatusColor(booking.status)}>
                          {booking.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                        {booking.reference && (
                          <span className="text-sm text-gray-500">#{booking.reference}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Vehicle:</span> {booking.plate} - {booking.car_make} {booking.car_model}
                        </div>
                        <div>
                          <span className="font-medium">Period:</span> {formatDate(booking.start_at)} - {formatDate(booking.end_at)}
                        </div>
                        <div>
                          <span className="font-medium">Amount:</span> £{booking.money_received || 0}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                      <Button variant="outline" size="sm">
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
    </div>
  );
}

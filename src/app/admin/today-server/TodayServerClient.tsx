'use client';

import React, { useState, useEffect, useMemo, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, Car, DollarSign, ArrowUpDown } from 'lucide-react';
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal';
import DateRangeSelector from '@/components/admin/DateRangeSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { GateStatus } from '@/lib/bookings/gateStatus';
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

import { BookingHighlightCode } from '@/types/bookings';

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

  const handleBookingClick = (booking: Booking) => {
    setSelectedBookingId(booking.id);
  };

  const handleBookingUpdated = () => {
    router.refresh();
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

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
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
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      const data = await response.json();
      
      setKpis(data.kpis);
      setArrivals(data.arrivals);
      setDepartures(data.departures);
      setCurrentlyParked(data.currentlyParked);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (dateRange: { from: string; to: string }) => {
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

  const groupedCurrentlyParked = useMemo(() => {
    return groupBookingsByDate(sortedCurrentlyParked, 'start_at');
  }, [sortedCurrentlyParked]);

  // Group arrivals and departures by date, showing arrivals first then departures for each day
  const groupedByDay = useMemo(() => {
    // Get all unique dates from both arrivals and departures
    const allDates = new Set<string>();
    
    sortedArrivals.forEach(booking => {
      const date = new Date(booking.start_at);
      const dateKey = date.toISOString().split('T')[0];
      allDates.add(dateKey);
    });
    
    sortedDepartures.forEach(booking => {
      const date = new Date(booking.end_at);
      const dateKey = date.toISOString().split('T')[0];
      allDates.add(dateKey);
    });
    
    // Sort dates
    const sortedDates = Array.from(allDates).sort();
    
    return sortedDates.map(date => {
      const arrivalsForDate = sortedArrivals.filter(booking => {
        const bookingDate = new Date(booking.start_at).toISOString().split('T')[0];
        return bookingDate === date;
      });
      
      const departuresForDate = sortedDepartures.filter(booking => {
        const bookingDate = new Date(booking.end_at).toISOString().split('T')[0];
        return bookingDate === date;
      });
      
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
  }, [sortedArrivals, sortedDepartures]);

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

  const BookingRow = ({ booking, type }: { booking: Booking; type: 'arrival' | 'departure' | 'parked' }) => {
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
    
    // Read gate_status directly from the booking, default to 'reserved' if not set
    const initialGateStatus = (booking.gate_status as GateStatus) || 'reserved';

    const [gateStatus, setGateStatus] = useState<GateStatus>(initialGateStatus);
    const [isPending, startTransition] = useTransition();
    const lastUpdateRef = useRef<{ gate_status: string | null } | null>(null);

    const handleRowClick = () => {
      if (!highlightMode) {
        handleBookingClick(booking);
      }
    };

    // Sync gateStatus with booking prop changes (e.g., after router.refresh())
    // But don't override if we just updated and the data matches our last update
    useEffect(() => {
      const currentGateStatus = (booking.gate_status as GateStatus) || 'reserved';
      
      // Only update if the booking data is different from our last update
      // This prevents reverting our change during router.refresh()
      if (lastUpdateRef.current) {
        const isSameAsLastUpdate = 
          booking.gate_status === lastUpdateRef.current.gate_status;
        
        if (isSameAsLastUpdate && lastUpdateRef.current.gate_status) {
          // This is likely stale data from router.refresh(), keep our current state
          return;
        }
      }
      
      setGateStatus(currentGateStatus);
    }, [booking.gate_status]);

    const handleGateStatusChange = (newStatus: GateStatus) => {
      const prev = gateStatus;
      setGateStatus(newStatus);

      startTransition(async () => {
        try {
          const res = await fetch(
            `/api/admin/bookings/${booking.id}/gate-status`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gateStatus: newStatus }),
            }
          );

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || 'Failed to update gate status');
          }

          const responseData = await res.json();
          
          toast({
            title: 'Gate status updated',
            description: `Booking updated to ${newStatus}`,
          });

          // Update local state with the response data
          if (responseData.booking) {
            const updatedGateStatus = (responseData.booking.gate_status as GateStatus) || 'reserved';
            setGateStatus(updatedGateStatus);
            
            // Update the booking in the parent arrays directly
            const updatedBooking = {
              ...booking,
              gate_status: responseData.booking.gate_status,
              checked_in_at: responseData.booking.checked_in_at,
              checked_out_at: responseData.booking.checked_out_at,
              status: responseData.booking.status,
            };
            
            // Update arrivals array
            setArrivals(prev => prev.map(b => b.id === booking.id ? updatedBooking : b));
            // Update departures array
            setDepartures(prev => prev.map(b => b.id === booking.id ? updatedBooking : b));
            // Update currentlyParked array
            setCurrentlyParked(prev => prev.map(b => b.id === booking.id ? updatedBooking : b));
            
            // Store the last update to prevent reverting during router.refresh()
            lastUpdateRef.current = {
              gate_status: responseData.booking.gate_status,
            };
          } else {
            setGateStatus(newStatus);
            lastUpdateRef.current = { gate_status: newStatus };
          }
          
          // Don't refresh immediately - let the local state update handle it
          // Only refresh after a delay to sync with server
          setTimeout(() => {
            router.refresh();
            // Clear the ref after refresh completes (allow normal syncing again)
            setTimeout(() => {
              lastUpdateRef.current = null;
            }, 500);
          }, 500);
        } catch (err: any) {
          console.error(err);
          // revert on error
          setGateStatus(prev);
          lastUpdateRef.current = null;
          toast({
            title: 'Error',
            description: err.message || 'Could not update gate status',
            variant: 'destructive',
          });
        }
      });
    };

    const gateStatusColor = {
      'reserved': 'bg-slate-100 text-slate-700',
      'arrived': 'bg-green-100 text-green-700',
      'departed': 'bg-blue-100 text-blue-700',
      'cancelled': 'bg-red-100 text-red-700'
    }[gateStatus] || 'bg-gray-100 text-gray-800';

    const gateStatusLabel = {
      'reserved': 'Reserved',
      'arrived': 'Arrived',
      'departed': 'Departed',
      'cancelled': 'Cancelled'
    }[gateStatus] || gateStatus;

    return (
      <tr 
        className={cn("hover:bg-gray-50", highlightMode && "cursor-pointer")}
      >
        <td 
          className="px-4 py-3 text-sm text-gray-900 cursor-pointer"
          onClick={handleRowClick}
        >
          <div className="flex items-center gap-2">
            {highlightMode ? (
              <div onClick={(e) => e.stopPropagation()} className="inline-flex">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center focus:outline-none hover:opacity-80 transition-opacity cursor-pointer min-w-[20px] min-h-[20px]"
                      disabled={updatingHighlightId === booking.id}
                    >
                      <BookingHighlightIcon highlightCode={booking.highlight_code || 'none'} />
                      {(!booking.highlight_code || booking.highlight_code === 'none') && (
                        <span className="w-3 h-3 border border-gray-300 rounded-full" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-50 bg-white border border-gray-200 shadow-lg">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      updateHighlight(booking.id, 'key');
                    }}
                    className="flex items-center gap-2"
                  >
                    <BookingHighlightIcon highlightCode="key" />
                    <span>Key icon</span>
                    {booking.highlight_code === 'key' && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      updateHighlight(booking.id, 'dot_green');
                    }}
                    className="flex items-center gap-2"
                  >
                    <BookingHighlightIcon highlightCode="dot_green" />
                    <span>Green dot</span>
                    {booking.highlight_code === 'dot_green' && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      updateHighlight(booking.id, 'dot_amber');
                    }}
                    className="flex items-center gap-2"
                  >
                    <BookingHighlightIcon highlightCode="dot_amber" />
                    <span>Amber dot</span>
                    {booking.highlight_code === 'dot_amber' && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      updateHighlight(booking.id, 'dot_red');
                    }}
                    className="flex items-center gap-2"
                  >
                    <BookingHighlightIcon highlightCode="dot_red" />
                    <span>Red dot</span>
                    {booking.highlight_code === 'dot_red' && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      updateHighlight(booking.id, 'none');
                    }}
                    className="flex items-center gap-2"
                  >
                    <BookingHighlightIcon highlightCode="none" />
                    <span>No highlight</span>
                    {booking.highlight_code === 'none' && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            ) : (
              <BookingHighlightIcon highlightCode={booking.highlight_code || 'none'} />
            )}
            {booking.customer_name}
            {(booking as any).is_incomplete && (
              <span className="inline-flex px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                Incomplete
              </span>
            )}
            {(booking as any).dynamic_pricing_applied && (
              <DynamicPricingBadge
                applied={(booking as any).dynamic_pricing_applied}
                multiplier={(booking as any).dynamic_pricing_multiplier}
                occupancyPercent={(booking as any).dynamic_pricing_occupancy_percent}
                ruleId={(booking as any).dynamic_pricing_rule_id}
              />
            )}
          </div>
        </td>
        <td 
          className="px-4 py-3 text-sm text-gray-900 cursor-pointer"
          onClick={handleRowClick}
        >
          {booking.plate}
        </td>
        <td 
          className="px-4 py-3 text-sm text-gray-900 cursor-pointer"
          onClick={handleRowClick}
        >
          {booking.flight_number || '-'}
        </td>
        <td 
          className="px-4 py-3 text-sm text-gray-900 cursor-pointer"
          onClick={handleRowClick}
        >
          <div className="flex flex-col">
            <div className="font-medium">Arrival</div>
            <div className="text-xs text-gray-600">
              {new Date(booking.start_at).toLocaleString('en-GB', { 
                timeZone: 'UTC',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
            <div className="font-medium mt-1">Departure</div>
            <div className="text-xs text-gray-600">
              {new Date(booking.end_at).toLocaleString('en-GB', { 
                timeZone: 'UTC',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </td>
        <td 
          className="px-4 py-3 text-sm text-gray-900 cursor-pointer"
          onClick={handleRowClick}
        >
          {calculateDays()} {calculateDays() === 1 ? 'day' : 'days'}
        </td>
        <td 
          className="px-4 py-3 text-sm text-gray-900 cursor-pointer"
          onClick={handleRowClick}
        >
          £{booking.money_charged || 0}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
                gateStatusColor
              )}
            >
              {gateStatusLabel}
            </span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              value={gateStatus}
              disabled={isPending}
              onChange={(e) => handleGateStatusChange(e.target.value as GateStatus)}
            >
              <option value="reserved">Reserved</option>
              <option value="arrived">Arrived</option>
              <option value="departed">Departed</option>
              <option value="cancelled">Cancelled</option>
            </select>
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
        <section className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Arrivals & Departures</h2>
                <p className="text-sm text-gray-600">Organized by day</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="arrivalsSort" className="text-sm text-gray-600">Arrivals Sort:</Label>
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
                <div className="flex items-center gap-2">
                  <Label htmlFor="departuresSort" className="text-sm text-gray-600">Departures Sort:</Label>
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
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flight</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arrival & Departure</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedByDay.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No arrivals or departures in this period
                    </td>
                  </tr>
                ) : (
                  groupedByDay.map((dayGroup) => (
                    <React.Fragment key={dayGroup.date}>
                      {/* Date Header */}
                      <tr className="bg-gray-100 border-t-2 border-gray-300">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">
                              {dayGroup.displayDate}
                            </span>
                            <span className="text-xs text-gray-500">
                              {dayGroup.arrivals.length} {dayGroup.arrivals.length === 1 ? 'arrival' : 'arrivals'}, {dayGroup.departures.length} {dayGroup.departures.length === 1 ? 'departure' : 'departures'}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Arrivals for this date */}
                      {dayGroup.arrivals.length > 0 && (
                        <>
                          <tr className="bg-blue-50">
                            <td colSpan={7} className="px-4 py-2">
                              <span className="text-xs font-semibold text-blue-800">Arrivals</span>
                            </td>
                          </tr>
                          {dayGroup.arrivals.map((booking) => (
                            <BookingRow key={`arrival-${booking.id}`} booking={booking} type="arrival" />
                          ))}
                        </>
                      )}
                      {/* Departures for this date */}
                      {dayGroup.departures.length > 0 && (
                        <>
                          <tr className="bg-red-50">
                            <td colSpan={7} className="px-4 py-2">
                              <span className="text-xs font-semibold text-red-800">Departures</span>
                            </td>
                          </tr>
                          {dayGroup.departures.map((booking) => (
                            <BookingRow key={`departure-${booking.id}`} booking={booking} type="departure" />
                          ))}
                        </>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flight</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arrival & Departure</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedCurrentlyParked.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No cars currently parked
                    </td>
                  </tr>
                ) : (
                  groupedCurrentlyParked.map((group, groupIndex) => (
                    <React.Fragment key={group.date}>
                      {/* Date Header */}
                      <tr className="bg-gray-100 border-t-2 border-gray-300">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">
                              {group.displayDate}
                            </span>
                            <span className="text-xs text-gray-500">
                              {group.bookings.length} {group.bookings.length === 1 ? 'vehicle' : 'vehicles'}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Bookings for this date */}
                      {group.bookings.map((booking) => (
                        <BookingRow key={booking.id} booking={booking} type="parked" />
                      ))}
                    </React.Fragment>
                  ))
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

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Download, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  FileSpreadsheet
} from 'lucide-react';
import { format, subDays, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from 'date-fns';

interface AnalyticsData {
  summary: {
    total_bookings: number;
    total_revenue: number;
    total_received: number;
    average_booking_value: number;
    occupancy_rate: number;
    extension_count: number;
    extension_revenue: number;
  };
  revenueByChannel: Array<{
    channel: string;
    bookings_count: number;
    booking_revenue: number;
    extension_revenue: number;
    total_revenue: number;
  }>;
  dailyRevenue: Array<{
    date: string;
    bookings_count: number;
    booking_revenue: number;
    extension_revenue: number;
    total_revenue: number;
    occupancy_rate: number;
  }>;
}

interface DateRange {
  label: string;
  start: Date;
  end: Date;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function AnalyticsDashboard({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>({
    label: 'Last 30 Days',
    start: subDays(new Date(), 29), // Include today, so 29 days ago to today
    end: new Date()
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'daily'>('overview');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState<Date>(subDays(new Date(), 30));
  const [customEnd, setCustomEnd] = useState<Date>(new Date());

  const predefinedRanges: DateRange[] = [
    {
      label: 'Today',
      start: new Date(),
      end: new Date()
    },
    {
      label: 'Recent (Last 3 Days)',
      start: subDays(new Date(), 2), // Include today, so 2 days ago to today
      end: new Date()
    },
    {
      label: 'This Week',
      start: startOfWeek(new Date(), { weekStartsOn: 1 }), // Monday start
      end: endOfWeek(new Date(), { weekStartsOn: 1 })
    },
    {
      label: 'Last 7 Days',
      start: subDays(new Date(), 6), // Include today, so 6 days ago to today
      end: new Date()
    },
    {
      label: 'This Month',
      start: startOfMonth(new Date()),
      end: endOfMonth(new Date())
    },
    {
      label: 'Last 30 Days',
      start: subDays(new Date(), 29), // Include today, so 29 days ago to today
      end: new Date()
    }
  ];

  const fetchAnalytics = async (start: Date, end: Date, isRetry = false) => {
    setLoading(true);
    try {
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');

      const [summaryRes, revenueRes, dailyRes] = await Promise.all([
        fetch(`/api/analytics/summary?tenantId=${tenantId}&start=${startStr}&end=${endStr}`),
        fetch(`/api/analytics/revenue?tenantId=${tenantId}&start=${startStr}&end=${endStr}`),
        fetch(`/api/analytics/daily-revenue?tenantId=${tenantId}&start=${startStr}&end=${endStr}`)
      ]);

      const [summaryData, revenueData, dailyData] = await Promise.all([
        summaryRes.json(),
        revenueRes.json(),
        dailyRes.json()
      ]);

      // console.log('Analytics API Response:', { summary: summaryData, revenue: revenueData, daily: dailyData });

      const revenueByChannel = revenueRes.ok ? (revenueData.data || []) : [];
      const dailyRevenue = dailyRes.ok ? (dailyData.data || []) : [];

      // Handle cases where functions don't exist yet or return empty data
      let summary = summaryRes.ok ? (summaryData.data || {}) : {};
      
      // If summary is empty, calculate from the other data
      if (!summary || Object.keys(summary).length === 0) {
        const totalBookings = revenueByChannel.reduce((sum: number, item: any) => sum + item.bookings_count, 0);
        const totalRevenue = revenueByChannel.reduce((sum: number, item: any) => sum + item.total_revenue, 0);
        const totalReceived = revenueByChannel.reduce((sum: number, item: any) => sum + item.booking_revenue, 0); // Assuming money_received = booking_revenue for now
        const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;
        
        summary = {
          total_bookings: totalBookings,
          total_revenue: totalRevenue,
          total_received: totalReceived,
          average_booking_value: averageBookingValue,
          occupancy_rate: 0, // Will be calculated properly when summary function works
          extension_count: 0,
          extension_revenue: 0
        };
      }

      // If this is "Today" and there's no data, and we haven't retried yet, try "Recent (Last 3 Days)" instead
      const isToday = dateRange.label === 'Today';
      const hasNoData = summary.total_bookings === 0 && revenueByChannel.length === 0;
      
      if (isToday && hasNoData && !isRetry) {
        console.log('No data for today, trying recent 3 days instead');
        const recentRange = predefinedRanges.find(r => r.label === 'Recent (Last 3 Days)');
        if (recentRange) {
          setDateRange(recentRange);
          return; // This will trigger a new fetch with the recent range
        }
      }

      const finalData = {
        summary,
        revenueByChannel,
        dailyRevenue
      };

      // console.log('Final Analytics Data:', finalData);
      setData(finalData);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      // Set fallback data
      setData({
        summary: {
          total_bookings: 0,
          total_revenue: 0,
          total_received: 0,
          average_booking_value: 0,
          occupancy_rate: 0,
          extension_count: 0,
          extension_revenue: 0
        },
        revenueByChannel: [],
        dailyRevenue: []
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      fetchAnalytics(dateRange.start, dateRange.end);
    }
  }, [tenantId, dateRange]);

  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
    setShowCustomRange(false);
  };

  const handleCustomRangeApply = () => {
    // Validate date range
    if (customStart > customEnd) {
      alert('Start date must be before end date');
      return;
    }
    
    // Don't allow future dates
    const today = new Date();
    if (customEnd > today) {
      alert('End date cannot be in the future');
      return;
    }
    
    const customRange: DateRange = {
      label: `${format(customStart, 'MMM dd')} - ${format(customEnd, 'MMM dd, yyyy')}`,
      start: customStart,
      end: customEnd
    };
    setDateRange(customRange);
    setShowCustomRange(false);
  };

  const handleExportCSV = async (type: 'revenue' | 'daily' | 'accounting') => {
    const startStr = format(dateRange.start, 'yyyy-MM-dd');
    const endStr = format(dateRange.end, 'yyyy-MM-dd');
    
    let endpoint;
    if (type === 'revenue') {
      endpoint = 'revenue';
    } else if (type === 'daily') {
      endpoint = 'daily-revenue';
    } else if (type === 'accounting') {
      endpoint = 'export/accounting';
    }
    
    const url = `/api/analytics/${endpoint}?tenantId=${tenantId}&start=${startStr}&end=${endStr}${type !== 'accounting' ? '&format=csv' : ''}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            No analytics data available for the selected period.
          </div>
        </CardContent>
      </Card>
    );
  }

  // Check if we have real data or just fallback zeros
  const hasRealData = data.summary.total_bookings > 0 || data.revenueByChannel.length > 0 || data.dailyRevenue.length > 0;
  
  // console.log('Has Real Data Check:', { total_bookings: data.summary.total_bookings, hasRealData });

  return (
    <div className="space-y-6">
      {/* Setup Message */}
      {!hasRealData && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="text-orange-600">⚠️</div>
              <div>
                <p className="font-medium text-orange-800">
                  {dateRange.label === 'Today' ? 'No Data for Today' : 'Analytics Functions Not Set Up'}
                </p>
                <p className="text-sm text-orange-700">
                  {dateRange.label === 'Today' 
                    ? 'There are no bookings for today. Try selecting "Recent (Last 3 Days)" or another date range to see your data.'
                    : 'Run the SQL functions in your Supabase SQL editor to enable analytics. See setup-analytics-functions.sql for the setup script.'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Date Range Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Date Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {predefinedRanges.map((range) => (
              <Button
                key={range.label}
                variant={dateRange.label === range.label ? "default" : "outline"}
                size="sm"
                onClick={() => handleDateRangeChange(range)}
              >
                {range.label}
              </Button>
            ))}
            <Button
              variant={showCustomRange ? "default" : "outline"}
              size="sm"
              onClick={() => setShowCustomRange(!showCustomRange)}
            >
              Custom Range
            </Button>
          </div>
          
          {showCustomRange && (
            <div className="mt-4 p-4 border rounded-lg bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={format(customStart, 'yyyy-MM-dd')}
                    onChange={(e) => setCustomStart(new Date(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={format(customEnd, 'yyyy-MM-dd')}
                    onChange={(e) => setCustomEnd(new Date(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={handleCustomRangeApply} size="sm">
                  Apply Range
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowCustomRange(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
          <div className="mt-2 text-sm text-gray-600">
            {format(dateRange.start, 'MMM dd, yyyy')} - {format(dateRange.end, 'MMM dd, yyyy')}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Bookings</p>
                <p className="text-2xl font-bold">{data.summary.total_bookings || 0}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold">£{(data.summary.total_revenue || 0).toFixed(2)}</p>
              </div>
              <span className="h-8 w-8 text-green-600 text-2xl font-bold">£</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Booking Value</p>
                <p className="text-2xl font-bold">£{(data.summary.average_booking_value || 0).toFixed(2)}</p>
              </div>
              <span className="h-8 w-8 text-purple-600 text-2xl font-bold">£</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Occupancy Rate</p>
                <p className="text-2xl font-bold">{(data.summary.occupancy_rate || 0).toFixed(1)}%</p>
              </div>
              <BarChart3 className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accounting Export Section */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="text-green-800 flex items-center">
            <FileSpreadsheet className="h-5 w-5 mr-2" />
            Accounting Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-700 mb-4">
            Export detailed financial data for accounting purposes. Includes dates, money charged/received, 
            extensions, and channels (no customer details).
          </p>
          <Button 
            onClick={() => handleExportCSV('accounting')} 
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Accounting CSV
          </Button>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <Button
          variant={activeTab === 'overview' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('overview')}
          className="flex-1"
        >
          <PieChartIcon className="h-4 w-4 mr-2" />
          Overview
        </Button>
        <Button
          variant={activeTab === 'revenue' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('revenue')}
          className="flex-1"
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Revenue by Channel
        </Button>
        <Button
          variant={activeTab === 'daily' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('daily')}
          className="flex-1"
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Daily Trends
        </Button>
      </div>

      {/* Charts */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.revenueByChannel}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.channel}: £${entry.total_revenue.toFixed(2)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="total_revenue"
                  >
                    {data.revenueByChannel.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`£${Number(value).toFixed(2)}`, 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Extension Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Extensions</span>
                  <Badge variant="secondary">{data.summary.extension_count || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Extension Revenue</span>
                  <span className="font-semibold">£{(data.summary.extension_revenue || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Received</span>
                  <span className="font-semibold">£{(data.summary.total_received || 0).toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Payment Gap</span>
                    <span className="font-semibold text-orange-600">
                      £{((data.summary.total_revenue || 0) - (data.summary.total_received || 0)).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Difference between charged and received (fees, pending payments)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'revenue' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Revenue by Channel</CardTitle>
              <Button onClick={() => handleExportCSV('revenue')} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data.revenueByChannel}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="channel" />
                <YAxis />
                <Tooltip formatter={(value) => [`£${Number(value).toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="total_revenue" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {activeTab === 'daily' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Daily Revenue Trends</CardTitle>
              <Button onClick={() => handleExportCSV('daily')} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data.dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                  formatter={(value) => [`£${Number(value).toFixed(2)}`, 'Revenue']}
                />
                <Line 
                  type="monotone" 
                  dataKey="total_revenue" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  name="Total Revenue"
                />
                <Line 
                  type="monotone" 
                  dataKey="booking_revenue" 
                  stroke="#82ca9d" 
                  strokeWidth={2}
                  name="Booking Revenue"
                />
                <Line 
                  type="monotone" 
                  dataKey="extension_revenue" 
                  stroke="#ffc658" 
                  strokeWidth={2}
                  name="Extension Revenue"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

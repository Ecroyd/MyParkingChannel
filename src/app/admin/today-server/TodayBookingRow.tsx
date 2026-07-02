'use client';

import React, { memo, useMemo } from 'react';
import { KeyRound } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookingHighlightIcon } from '@/components/bookings/BookingHighlightIcon';
import { DynamicPricingBadge } from '@/components/bookings/DynamicPricingBadge';
import BookingHighlightPicker from './BookingHighlightPicker';
import { cn } from '@/lib/utils';
import {
  GATE_STATUS,
  GATE_STATUS_OPTIONS,
  gateStatusLabel,
  gateStatusPillClass,
} from '@/lib/gateStatus';
import { BookingHighlightCode } from '@/types/bookings';
import { formatBookingDateTimeForTenant } from '@/lib/datetime/parse';

export type TodayOpsAction =
  | 'reserved'
  | 'arrived'
  | 'arrived_key_taken'
  | 'take_key'
  | 'departed'
  | 'no_show'
  | 'cancelled';

export type TodayBoardBooking = {
  id: string;
  reference: string;
  customer_name: string | null;
  plate: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  money_charged?: number | null;
  gate_status?: string | null;
  highlight_code?: BookingHighlightCode | null;
  ops_hidden?: boolean | null;
  ops_hidden_reason?: string | null;
  is_incomplete?: boolean;
  dynamic_pricing_applied?: boolean;
  dynamic_pricing_multiplier?: number | null;
  dynamic_pricing_occupancy_percent?: number | null;
  dynamic_pricing_rule_id?: string | null;
};

type BoardSection = 'arrivals' | 'departures' | 'parked';

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
    if (s === 'no_show' || s === 'cancelled') {
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

  return `${rowBg} ${text}`;
}

export type TodayBookingRowProps = {
  booking: TodayBoardBooking;
  section?: BoardSection;
  timezone: string;
  highlightMode: boolean;
  showHidden?: boolean;
  isSelected: boolean;
  isPending: boolean;
  onBookingClick: (bookingId: string) => void;
  onUnhide?: (booking: TodayBoardBooking) => void;
  onSelectChange: (bookingId: string, checked: boolean) => void;
  onQuickAction: (bookingId: string, action: TodayOpsAction) => void;
  onHighlightSelect: (bookingId: string, code: BookingHighlightCode) => void;
};

function TodayBookingRow({
  booking,
  section,
  timezone,
  highlightMode,
  showHidden,
  isSelected,
  isPending,
  onBookingClick,
  onUnhide,
  onSelectChange,
  onQuickAction,
  onHighlightSelect,
}: TodayBookingRowProps) {
  const stayDays = useMemo(() => {
    const start = new Date(booking.start_at);
    const end = new Date(booking.end_at);
    return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }, [booking.start_at, booking.end_at]);

  const startLabel = useMemo(
    () => formatBookingDateTimeForTenant({ timestamp: booking.start_at, timezone }),
    [booking.start_at, timezone]
  );
  const endLabel = useMemo(
    () => formatBookingDateTimeForTenant({ timestamp: booking.end_at, timezone }),
    [booking.end_at, timezone]
  );

  const isKeyTaken = Boolean(
    booking.gate_status === GATE_STATUS.TAKE_KEY ||
      booking.gate_status === GATE_STATUS.ARRIVED_KEY_TAKEN ||
      booking.highlight_code === 'key'
  );
  const effectiveHighlightCode: BookingHighlightCode = isKeyTaken
    ? 'key'
    : booking.highlight_code || 'none';
  const displayGateStatus = booking.gate_status ?? GATE_STATUS.RESERVED;

  const rowClass = cn(
    'group border-b transition-colors',
    highlightMode && 'cursor-pointer',
    getRowStyleClasses(booking, section, displayGateStatus)
  );

  const handleRowClick = () => {
    if (!highlightMode) onBookingClick(booking.id);
  };

  const handleGateStatusChange = (value: string) => {
    if (value === GATE_STATUS.NONE) return;
    onQuickAction(booking.id, value as TodayOpsAction);
  };

  const handleQuickKey = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,input,select,textarea,[role='button']")) return;
    const key = event.key.toLowerCase();
    if (key === 'a' && section !== 'departures') {
      event.preventDefault();
      handleGateStatusChange(GATE_STATUS.ARRIVED);
    } else if (key === 'k' && section !== 'departures') {
      event.preventDefault();
      handleGateStatusChange(GATE_STATUS.ARRIVED_KEY_TAKEN);
    } else if (key === 'd') {
      event.preventDefault();
      handleGateStatusChange(GATE_STATUS.DEPARTED);
    }
  };

  return (
    <tr className={rowClass} tabIndex={0} onKeyDown={handleQuickKey}>
      <td colSpan={3} className="px-1.5 py-1 cursor-pointer align-middle text-inherit" onClick={handleRowClick}>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          <span
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex items-center"
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectChange(booking.id, checked === true)}
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
            <div
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-flex"
            >
              <BookingHighlightPicker
                bookingId={booking.id}
                highlightCode={effectiveHighlightCode}
                effectiveHighlightCode={effectiveHighlightCode}
                onSelect={onHighlightSelect}
              />
            </div>
          ) : !isKeyTaken ? (
            <BookingHighlightIcon highlightCode={effectiveHighlightCode} />
          ) : null}
          <span>{booking.customer_name}</span>
          <span className="text-sm font-semibold font-mono text-gray-900 bg-gray-200 px-2 py-0.5 rounded tracking-wide">
            {booking.plate}
          </span>
          {booking.is_incomplete && (
            <span className="inline-flex items-center h-5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-800">
              Incomplete
            </span>
          )}
          {booking.status === 'cancelled' && (
            <span className="inline-flex items-center h-5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-800">
              Cancelled
            </span>
          )}
          {booking.dynamic_pricing_applied && (
            <DynamicPricingBadge
              applied={booking.dynamic_pricing_applied}
              multiplier={booking.dynamic_pricing_multiplier}
              occupancyPercent={booking.dynamic_pricing_occupancy_percent}
              ruleId={booking.dynamic_pricing_rule_id}
            />
          )}
          {booking.ops_hidden && (
            <span
              className="inline-flex items-center h-5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600"
              title={booking.ops_hidden_reason || 'Hidden'}
            >
              HIDDEN
            </span>
          )}
          {isPending && (
            <span className="inline-flex items-center h-5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-800">
              Saving...
            </span>
          )}
          {booking.ops_hidden && showHidden && onUnhide && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onUnhide(booking);
              }}
            >
              Unhide
            </Button>
          )}
        </div>
      </td>
      <td colSpan={3} className="px-1.5 py-1 cursor-pointer align-middle text-inherit" onClick={handleRowClick}>
        <span className="text-xs font-normal">{startLabel}</span>
      </td>
      <td colSpan={3} className="px-1.5 py-1 cursor-pointer align-middle text-inherit" onClick={handleRowClick}>
        <span className="text-xs font-normal">{endLabel}</span>
      </td>
      <td colSpan={3} className="px-1.5 py-1 align-middle text-inherit" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-1 md:gap-2">
          <div className="flex flex-wrap justify-end gap-1 text-sm">
            <span>{stayDays}d</span>
            <span>£{booking.money_charged || 0}</span>
          </div>
          <Select
            value={displayGateStatus === '' ? undefined : displayGateStatus}
            onValueChange={handleGateStatusChange}
            disabled={isPending}
          >
            <SelectTrigger className="h-7 px-1 py-0 bg-transparent border-0 shadow-none gap-1 cursor-pointer focus:ring-0 focus:ring-offset-0 min-w-0 w-auto [&>svg]:shrink-0 [&>span:first-of-type]:sr-only">
              <SelectValue />
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none text-inherit',
                  gateStatusPillClass(displayGateStatus)
                )}
              >
                {gateStatusLabel(displayGateStatus)}
              </span>
            </SelectTrigger>
            <SelectContent align="end" className="z-[100]">
              {GATE_STATUS_OPTIONS.map((opt) => (
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
}

export default memo(TodayBookingRow);

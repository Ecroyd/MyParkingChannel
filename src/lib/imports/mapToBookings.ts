import {
  mapSupplierStatusToBookingStatus,
  normalizeSupplierStatus,
} from "@/lib/ingest/importStatusMapping";
import { resolveImportPlatform } from "@/lib/ingest/importPlatform";

// Map staging table data to actual bookings table format
export function mapStagingToBookings(stagingRecord: Record<string, unknown>) {
  const rawJson = stagingRecord.raw_json as { channel?: string; external_status?: string } | null;
  const channel = rawJson?.channel ?? null;
  const platform = resolveImportPlatform({
    channel,
    stagingSource: (stagingRecord.source as string) ?? null,
  });

  const parsedStatus = normalizeSupplierStatus(
    (stagingRecord.external_status as string) ??
      rawJson?.external_status ??
      (stagingRecord.status as string)
  );

  const moneyCharged =
    stagingRecord.price != null
      ? Number(stagingRecord.price)
      : stagingRecord.total_price != null
        ? Number(stagingRecord.total_price)
        : 0;
  const moneyReceived =
    stagingRecord.money_received != null
      ? Number(stagingRecord.money_received)
      : moneyCharged;

  const plateRaw = stagingRecord.vehicle_reg as string | null | undefined;
  const plate =
    plateRaw && String(plateRaw).trim() && plateRaw !== "-"
      ? String(plateRaw).trim().toUpperCase()
      : null;

  return {
    tenant_id: stagingRecord.tenant_id,
    reference: stagingRecord.reference,
    customer_name: stagingRecord.customer_name,
    customer_email: stagingRecord.customer_email ?? "",
    customer_phone: stagingRecord.phone || null,
    plate,
    car_make: stagingRecord.vehicle_make,
    car_model: stagingRecord.vehicle_model,
    car_color: stagingRecord.vehicle_colour,
    start_at: stagingRecord.start_at,
    end_at: stagingRecord.end_at,
    status: mapSupplierStatusToBookingStatus(parsedStatus),
    supplier_status: parsedStatus,
    external_status: parsedStatus,
    money_charged: Number.isFinite(moneyCharged) ? moneyCharged : 0,
    money_received: Number.isFinite(moneyReceived) ? moneyReceived : 0,
    notes: stagingRecord.notes || "",
    source: platform.bookingSource,
    external_source: platform.platformId,
    flight_number: stagingRecord.flight_number,
    dedupe_key: stagingRecord.dedupe_key,
    is_incomplete: false,
    missing_fields: [],
  };
}

import {
  mapSupplierStatusToBookingStatus,
  normalizeSupplierStatus,
} from "@/lib/ingest/importStatusMapping";
import { resolveCustomerName } from "@/lib/bookings/normalizeCustomerName";
import { resolveImportPlatform } from "@/lib/ingest/importPlatform";

// Map staging table data to actual bookings table format
export function mapStagingToBookings(stagingRecord: Record<string, unknown>) {
  const rawJson = stagingRecord.raw_json as {
    channel?: string;
    external_status?: string;
    extracted?: { email?: string };
    fields?: { Email?: string };
  } | null;
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

  const customerEmail =
    (stagingRecord.customer_email as string) ||
    rawJson?.extracted?.email ||
    rawJson?.fields?.Email ||
    "";
  const customerResolved = resolveCustomerName({
    customerName: stagingRecord.customer_name as string | null,
    customerLastName: stagingRecord.customer_lastname as string | null,
    customerEmail,
  });

  return {
    tenant_id: stagingRecord.tenant_id,
    reference: stagingRecord.reference,
    customer_name: customerResolved.name,
    customer_email: customerEmail,
    customer_phone: stagingRecord.phone || null,
    plate,
    car_make: stagingRecord.vehicle_make,
    car_model: stagingRecord.vehicle_model,
    car_color: stagingRecord.vehicle_colour,
    start_at: stagingRecord.start_at,
    end_at: stagingRecord.end_at,
    status: mapSupplierStatusToBookingStatus(parsedStatus),
    external_status: parsedStatus,
    money_charged: Number.isFinite(moneyCharged) ? moneyCharged : 0,
    money_received: Number.isFinite(moneyReceived) ? moneyReceived : 0,
    notes: stagingRecord.notes || "",
    source: platform.bookingSource,
    external_source: platform.platformId,
    flight_number: stagingRecord.flight_number,
    dedupe_key: stagingRecord.dedupe_key,
    is_incomplete: customerResolved.missingCustomerName,
    missing_fields: customerResolved.missingCustomerName ? ["customer_name"] : [],
  };
}

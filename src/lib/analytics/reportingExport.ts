/**
 * CSV export helpers for the reporting engine.
 * Anonymised exports use a server-side whitelist — never strip PII client-side.
 */
import { createAdminClient } from '@/lib/supabase/server-admin';
import {
  ANONYMISED_EXPORT_FIELDS,
  EXPORT_PRESETS,
  PII_EXPORT_FIELDS,
  type ExportField,
  type ReportingFilters,
} from '@/lib/analytics/reportingTypes';
import { loadFilteredReportingRows } from '@/lib/analytics/reportingEngine';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';

const FIELD_SET = new Set<string>([
  ...ANONYMISED_EXPORT_FIELDS,
  ...PII_EXPORT_FIELDS,
]);

export type ExportPreset = 'standard' | 'finance' | 'anonymised' | 'custom';

export function resolveExportFields(
  preset: ExportPreset,
  customFields?: string[]
): { fields: ExportField[]; includesPii: boolean } {
  let fields: string[];
  if (preset === 'custom') {
    fields = (customFields ?? []).filter((f) => FIELD_SET.has(f));
  } else if (preset === 'anonymised') {
    fields = [...EXPORT_PRESETS.anonymised];
  } else if (preset === 'finance') {
    fields = [...EXPORT_PRESETS.finance];
  } else {
    fields = [...EXPORT_PRESETS.standard];
  }

  // Hard guarantee: anonymised never includes PII even if somehow passed
  if (preset === 'anonymised') {
    const pii = new Set<string>(PII_EXPORT_FIELDS);
    fields = fields.filter((f) => !pii.has(f));
  }

  const includesPii = fields.some((f) =>
    (PII_EXPORT_FIELDS as readonly string[]).includes(f)
  );
  return { fields: fields as ExportField[], includesPii };
}

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(fields: string[], rows: Record<string, unknown>[]): string {
  const header = fields.join(',');
  const lines = rows.map((row) =>
    fields.map((f) => csvEscape(row[f])).join(',')
  );
  return [header, ...lines].join('\n');
}

export async function generateReportingCsv(opts: {
  filters: ReportingFilters;
  preset: ExportPreset;
  customFields?: string[];
  actorUserId: string;
}): Promise<{ csv: string; fields: ExportField[]; includesPii: boolean; rowCount: number }> {
  const { fields, includesPii } = resolveExportFields(opts.preset, opts.customFields);
  const admin = createAdminClient();
  const timezone = opts.filters.timezone || DEFAULT_TENANT_TIMEZONE;

  const pageSize = 1000;
  let offset = 0;
  const all: Record<string, unknown>[] = [];

  for (;;) {
    const batch = await loadFilteredReportingRows(admin, opts.filters, timezone, {
      limit: pageSize,
      offset,
      includePii: includesPii,
      fields,
    });
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200_000) break; // hard cap
  }

  if (includesPii) {
    await admin.from('tenant_export_audit').insert({
      tenant_id: opts.filters.tenantId,
      actor_user_id: opts.actorUserId,
      export_type: opts.preset,
      fields,
      date_from: opts.filters.from,
      date_to: opts.filters.to,
      date_basis: opts.filters.dateBasis,
    });
  }

  return {
    csv: rowsToCsv(fields, all),
    fields,
    includesPii,
    rowCount: all.length,
  };
}

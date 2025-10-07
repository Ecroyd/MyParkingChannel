"use client";

import * as XLSX from "xlsx";
import React from "react";
import dayjs from "dayjs";
import { getCell, normalisePhoneUK } from "@/lib/imports/utils";
import { composeISO, DateParseOptions } from "@/lib/imports/datetime";
import { mapStatus } from "@/lib/imports/normalise";
import { autoDetectMap, compareMaps, bestMatchAgainstSaved, MapState as AutoMapState } from "@/lib/imports/autoDetect";
import type { CanonicalBooking, ImportProfileMap } from "@/lib/imports/types";

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface UploadClientProps {
  tenant: Tenant;
  tenantId: string;
}

// Date parsing options with sane defaults
const DATE_OPTS: DateParseOptions = { 
  twoDigitPivot: 69, 
  validYearMin: 2015, 
  validYearMax: 2035 
} as const;

const FIELDS: Array<{key: keyof ImportProfileMap, label: string}> = [
  { key: "source", label: "Source" },
  { key: "reference", label: "Reference" },
  { key: "customer_lastname", label: "Last name" },
  { key: "customer_title", label: "Title" },
  { key: "customer_firstname", label: "First name" },

  { key: "start_date", label: "Start Date (ddmmyy / dd/mm/yy / serial)" },
  { key: "start_time", label: "Start Time (HH:mm)" },

  { key: "end_date", label: "End Date (ddmmyy / dd/mm/yy / serial)" },
  { key: "end_time", label: "End Time (HH:mm)" },

  { key: "vehicle_reg", label: "Vehicle Reg" },
  { key: "vehicle_colour", label: "Vehicle Colour" },
  { key: "vehicle_make", label: "Vehicle Make" },
  { key: "vehicle_model", label: "Vehicle Model" },

  { key: "flight_number", label: "Flight Number" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status (*CANX*, *FIRM*, *AMND*)" },
  { key: "price", label: "Price" },
  { key: "money_received", label: "Money Received" },
  { key: "notes", label: "Notes" },
];

export default function UploadClient({ tenant, tenantId }: UploadClientProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [rows, setRows] = React.useState<any[][]>([]);
  const [map, setMap] = React.useState<ImportProfileMap>({});
  const [timezone, setTimezone] = React.useState(tenant.timezone || "Europe/London");
  const [preview, setPreview] = React.useState<CanonicalBooking[]>([]);
  const [profileName, setProfileName] = React.useState("Auto-generated");
  const [fileAnalysed, setFileAnalysed] = React.useState(false);
  const [overwrite, setOverwrite] = React.useState<boolean>(false);
  const [statusMsg, setStatusMsg] = React.useState<string>("");
  const [mappings, setMappings] = React.useState<{id:string;name:string;map:any}[]>([]);
  const [selectedMappingId, setSelectedMappingId] = React.useState<string>("");
  const [autoMsg, setAutoMsg] = React.useState<string>("");
  const [sourceMapping, setSourceMapping] = React.useState<string>("other");
  const [customSource, setCustomSource] = React.useState<string>("");

  async function loadMappings(tid: string) {
    if (!tid) return;
    const res = await fetch(`/api/import/mappings?tenantId=${encodeURIComponent(tid)}`);
    const j = await res.json();
    if (res.ok) setMappings(j.mappings || []);
  }
  
  React.useEffect(() => { 
    if (tenantId) loadMappings(tenantId); 
  }, [tenantId]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileAnalysed(false);
    setRows([]);
    setPreview([]);
  }

  function analyseFile() {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      setRows(aoa.filter(r => r.some(Boolean)));
      setFileAnalysed(true);
    };
    reader.readAsArrayBuffer(file);
  }

  async function autoDetect() {
    if (!rows.length) { setStatusMsg("Analyse a file first."); return; }
    
    console.log("🔍 Auto-detect Debug:");
    console.log("Rows count:", rows.length);
    console.log("Sample rows:", rows.slice(0, 3));
    
    const proposal = autoDetectMap(rows);
    console.log("Auto-detected proposal:", proposal);
    
    // Merge proposal into current mapping but don't overwrite values you've already typed
    setMap(prev => ({ ...proposal, timezone: prev.timezone || proposal.timezone }));
    setAutoMsg("Auto-detected mapping applied. Please review the letters, then Preview.");
    
    // If you have saved mappings, show the closest match:
    if (mappings.length) {
      const best = bestMatchAgainstSaved(proposal, mappings);
      if (best) setStatusMsg(`Closest saved mapping: "${best.name}" (${best.score}% match). Use the dropdown to load it if preferred.`);
    }
  }

  function buildPreview() {
    const out: CanonicalBooking[] = [];
    console.log(`🔍 Building preview for ${rows.length} rows`);
    // Process all rows, not just a sample
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      // timestamps: compose date+time
      const start_at = composeISO(getCell(r, map.start_date), getCell(r, map.start_time), timezone as any, DATE_OPTS);
      const end_at = composeISO(getCell(r, map.end_date), getCell(r, map.end_time), timezone as any, DATE_OPTS);

      const customer_lastname = getCell(r, map.customer_lastname).toUpperCase();
      const customer_firstname = getCell(r, map.customer_firstname);
      const customer_title = getCell(r, map.customer_title).toUpperCase();

      const phoneRaw = getCell(r, map.phone);
      const statusRaw = getCell(r, map.status);

      const price = Number(getCell(r, map.price)) || null;
      const money_received = Number(getCell(r, map.money_received)) || null;

      out.push({
        source: sourceMapping === "custom" ? customSource : sourceMapping, // Use the selected source mapping
        reference: getCell(r, map.reference).toUpperCase(),
        customer_name: `${customer_firstname} ${customer_lastname}`.trim(),
        customer_lastname,
        customer_title,
        customer_firstname,
        start_at,
        end_at,
        vehicle_reg: getCell(r, map.vehicle_reg).toUpperCase(),
        vehicle_colour: getCell(r, map.vehicle_colour).toUpperCase(),
        vehicle_make: getCell(r, map.vehicle_make).toUpperCase(),
        vehicle_model: getCell(r, map.vehicle_model).toUpperCase(),
        flight_number: getCell(r, map.flight_number).toUpperCase(),
        phone: normalisePhoneUK(phoneRaw),
        status: mapStatus(statusRaw),
        price,
        money_received,
        notes: getCell(r, map.notes),
      });
    }
    console.log(`✅ Preview built: ${out.length} rows processed`);
    setPreview(out);
  }

  async function saveProfile() {
    if (!tenantId) { setStatusMsg("Enter a tenant ID."); return; }
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const name = prompt(`Profile name (default: Import ${timestamp})?`) || `Import ${timestamp}`;
    const res = await fetch("/api/import/mappings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId, name, map }),
    });
    const j = await res.json();
    if (!res.ok) { setStatusMsg("Save failed: " + j.error); return; }
    setStatusMsg("Profile saved.");
    loadMappings(tenantId); // refresh list
  }

  async function commitImport() {
    if (!tenantId) { setStatusMsg("Enter a tenant ID."); return; }
    if (!preview.length) { setStatusMsg("Preview first, then import."); return; }
    
    console.log("🔍 Import Debug Info:");
    console.log("Tenant ID:", tenantId);
    console.log("Tenant object:", tenant);
    console.log("Preview rows count:", preview.length);
    console.log("Original file rows count:", rows.length);
    console.log("Overwrite mode:", overwrite);
    
    const requestBody = { 
      tenantId, 
      rows: preview, // Send the processed preview data (now contains all rows)
      profileName: selectedMappingId ? (mappings.find(m=>m.id===selectedMappingId)?.name || "Auto-generated") : "Auto-generated", 
      overwriteDuplicates: overwrite,
      sourceMapping: sourceMapping === "custom" ? "other" : sourceMapping // Custom sources map to 'other' in database
    };
    
    console.log("Request body:", requestBody);
    
    const res = await fetch("/api/import/bookings/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const j = await res.json();
    if (!res.ok) {
      console.error("❌ Import failed:", j);
      alert(`Import failed.\nInserted: ${j.inserted ?? 0}\nUpdated: ${j.updated ?? 0}\nSkipped: ${j.skipped ?? 0}\nErrors: ${j.errors ?? 0}\n\nServer says:\n${(j.serverErrors||[]).join("\n")}`);
      return;
    }
    
    // Check for invalid rows
    if (j.invalidRows && j.invalidRows.length > 0) {
      const invalidMsg = `⚠️ Some rows were skipped due to missing dates:\n\n${j.invalidRows.map((row: any) => `Row ${row.index}: ${row.reason}`).join('\n')}\n\nThese rows were not imported.`;
      alert(invalidMsg);
    }
    
    // Success! Clear all data and reset to upload ready state
    const msg = overwrite
      ? `✅ Import successful!\nInserted: ${j.inserted}, Updated: ${j.updated}, Errors: ${j.errors}`
      : `✅ Import successful!\nInserted: ${j.inserted}, Skipped (dupes): ${j.skipped}, Errors: ${j.errors}`;
    
    alert(msg);
    
    // Reset all state to upload ready
    setFile(null);
    setFileAnalysed(false);
    setRows([]);
    setMap({});
    setPreview([]);
    setStatusMsg("");
    setOverwrite(false);
    setSelectedMappingId("");
    setSourceMapping("other");
    setCustomSource("");
  }


  async function purgeTenant() {
    if (!tenantId) { setStatusMsg("Enter a tenant ID."); return; }
    if (!confirm("Delete ALL staging rows for this tenant?")) return;
    const res = await fetch("/api/import/bookings/purge", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    const j = await res.json();
    if (!res.ok) { setStatusMsg("Purge failed: " + j.error); return; }
    setStatusMsg("Staging purged.");
  }


  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Upload by Column Letters</h1>
      
      {statusMsg && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          {statusMsg}
        </div>
      )}

      {autoMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          {autoMsg}
        </div>
      )}

      <div className="flex gap-6">
        <div className="w-80 space-y-3">
          {/* Step 1: File Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Step 1: Select File</label>
            <input type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" onChange={onFile} />
            {file && (
              <div className="text-sm text-gray-600">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
            {file && !fileAnalysed && (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <select
                    className="flex-1 border rounded px-3 py-2"
                    value={selectedMappingId}
                    onChange={(e)=>{
                      const id = e.target.value;
                      setSelectedMappingId(id);
        const m = mappings.find(x=>x.id===id);
        if (m?.mapping) setMap(prev => ({ ...prev, ...m.mapping })); // apply saved mapping
                    }}
                  >
                    <option value="">Load saved mapping…</option>
                    {mappings.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <button 
                  onClick={analyseFile} 
                  className="w-full px-3 py-2 rounded bg-blue-600 text-white"
                >
                  Analyse File
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Column Mapping */}
          {fileAnalysed && (
            <>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Step 2: Map columns (letters or 0-based indexes)</p>
                  <button 
                    onClick={autoDetect} 
                    className="px-3 py-1 rounded border text-sm"
                    disabled={!rows.length}
                  >
                    Auto-detect
                  </button>
                </div>
                <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                  💡 <strong>Date parsing tips:</strong> Excel strips leading zeros from ddmmyy dates (071025 → 71025). 
                  Our parser handles this and validates years (2015-2035). If dates show as "❌ No date", 
                  check your column mapping or date format.
                </div>
                {FIELDS.map(f => (
                  <div key={f.key as string} className="flex items-center gap-2">
                    <label className="w-48 text-sm">{f.label}</label>
                    <input
                      className="flex-1 border p-1 rounded"
                      placeholder="e.g. I or 8"
                      value={(map[f.key] as string) || ""}
                      onChange={e => setMap(m => ({ ...m, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="w-48 text-sm font-medium">Source Mapping:</label>
                  <select 
                    className="flex-1 border p-2 rounded"
                    value={sourceMapping}
                    onChange={e => setSourceMapping(e.target.value)}
                  >
                    <option value="manual">Manual</option>
                    <option value="direct">Direct</option>
                    <option value="parkvia">Parkvia</option>
                    <option value="holidayextras">Holiday Extras</option>
                    <option value="other">Other</option>
                    <option value="custom">Custom Source</option>
                  </select>
                </div>
                {sourceMapping === "custom" && (
                  <div className="flex items-center gap-2">
                    <label className="w-48 text-sm font-medium">Custom Source:</label>
                    <input 
                      className="flex-1 border p-2 rounded"
                      placeholder="e.g. EXT1, MyCompany, etc."
                      value={customSource}
                      onChange={e => setCustomSource(e.target.value)}
                    />
                  </div>
                )}
                <p className="text-xs text-gray-600">
                  💡 This maps all source values in your data to the selected booking source type.
                  {sourceMapping === "custom" && " Custom sources will be mapped to 'other' in the database."}
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={buildPreview} className="px-3 py-2 rounded bg-black text-white">Build preview</button>
                <button onClick={saveProfile} className="px-3 py-2 rounded border">Save profile</button>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)} />
                  Overwrite duplicates (upsert)
                </label>
                <button onClick={commitImport} className="px-3 py-2 rounded bg-green-600 text-white">Import to Bookings</button>
              </div>

              {/* Diff with selected saved mapping */}
              {selectedMappingId && (
                <DiffBlock 
                  current={map} 
                  saved={(mappings.find(m=>m.id===selectedMappingId)?.map)||{}} 
                />
              )}
            </>
          )}
        </div>

        <div className="flex-1 space-y-4">
          {/* Raw File Data */}
          {fileAnalysed && rows.length > 0 && (
            <div className="p-3 border rounded">
              <div className="font-medium mb-2">Raw File Data ({rows.length} rows)</div>
              <div className="overflow-auto max-h-[500px]">
                <table className="text-sm w-full border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border px-2 py-1 text-left">Row</th>
                      {rows[0]?.map((_, idx) => (
                        <th key={idx} className="border px-2 py-1 text-left">
                          {String.fromCharCode(65 + idx)} ({idx})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="border px-2 py-1 font-mono text-xs">{idx + 1}</td>
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className="border px-2 py-1 text-xs">
                            {String(cell || "").slice(0, 20)}
                            {String(cell || "").length > 20 && "..."}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Processed Preview */}
          <div className="p-3 border rounded">
            <div className="font-medium mb-2">Processed Preview ({preview.length} rows)</div>
            <div className="overflow-auto max-h-[600px]">
              <div className="mb-2 text-sm text-gray-600">
                📊 Preview: {preview.length} rows ready for import (from {rows.length} total file rows)
              </div>
              <table className="text-sm w-full border">
                <thead>
                  <tr className="bg-gray-50">
                    {[
                      "source","reference","customer_name","start_at","end_at",
                      "vehicle_reg","vehicle_colour","vehicle_make","vehicle_model",
                      "flight_number","phone","status","price","money_received","notes"
                    ].map(h => <th key={h} className="border px-2 py-1 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, idx) => {
                    const startDate = r.start_at;
                    const endDate = r.end_at;
                    const hasDateIssue = !startDate || !endDate;
                    const hasOrderIssue = startDate && endDate && dayjs(startDate).isAfter(dayjs(endDate));
                    
                    return (
                      <tr key={idx} className={hasDateIssue || hasOrderIssue ? "bg-yellow-50" : ""}>
                        <td className="border px-2 py-1">{r.source}</td>
                        <td className="border px-2 py-1">{r.reference}</td>
                        <td className="border px-2 py-1">{r.customer_name}</td>
                        <td className="border px-2 py-1">
                          {startDate || "❌ No date"}
                          {hasOrderIssue && " ⚠️"}
                        </td>
                        <td className="border px-2 py-1">
                          {endDate || "❌ No date"}
                          {hasOrderIssue && " ⚠️"}
                        </td>
                      <td className="border px-2 py-1">{r.vehicle_reg}</td>
                      <td className="border px-2 py-1">{r.vehicle_colour}</td>
                      <td className="border px-2 py-1">{r.vehicle_make}</td>
                      <td className="border px-2 py-1">{r.vehicle_model}</td>
                      <td className="border px-2 py-1">{r.flight_number}</td>
                      <td className="border px-2 py-1">{r.phone}</td>
                      <td className="border px-2 py-1">{r.status}</td>
                      <td className="border px-2 py-1">{r.price ?? ""}</td>
                      <td className="border px-2 py-1">{r.money_received ?? ""}</td>
                      <td className="border px-2 py-1">{r.notes}</td>
                      </tr>
                    );
                  })}
                  {preview.length === 0 && (
                    <tr><td colSpan={15} className="text-center text-gray-500 p-6">No preview yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 border rounded">
            <div className="font-medium mb-2">Quick tips</div>
            <ul className="text-sm list-disc pl-5 space-y-1">
              <li>Use letters (A, B, C …, AA) or 0-based indexes (0,1,2…)</li>
              <li>Map both "Start Date" and "Start Time" for start timestamp</li>
              <li>Map both "End Date" and "End Time" for end timestamp</li>
              <li>Dates: Supports ddmmyy, dd/mm/yyyy, ISO dates, and Excel serial numbers (45306)</li>
              <li>Phones are normalised to +44 if they start 0 / 44 / 0044</li>
              <li>Status: <code>*CANX*</code> → cancelled, <code>*AMND*</code> → amended, else reserved</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffBlock({ current, saved }: { current: any; saved: any }) {
  const { diffs, score } = compareMaps(current, saved);
  if (!diffs.length) return null;
  return (
    <div className="bg-gray-50 rounded p-3 text-sm space-y-2">
      <div className="font-medium">Comparison with selected saved mapping: {score}% identical</div>
      <ul className="grid md:grid-cols-2 gap-2">
        {diffs.filter(d=>!d.equal).map(d=>(
          <li key={d.field}>
            <span className="font-mono">{d.field}</span>: <code>{String(d.b ?? "—")}</code> → <code>{String(d.a ?? "—")}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

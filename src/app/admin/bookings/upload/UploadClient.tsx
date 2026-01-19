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
  timezone?: string;
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

const FIELDS: Array<{key: keyof ImportProfileMap, label: string, required?: boolean, group?: string}> = [
  // Core fields
  { key: "reference", label: "Reference", required: true, group: "core" },
  { key: "source", label: "Source", group: "core" },
  
  // Customer info
  { key: "customer_name", label: "Full Name", group: "customer" },
  { key: "customer_firstname", label: "First Name", group: "customer" },
  { key: "customer_lastname", label: "Last Name", group: "customer" },
  { key: "customer_title", label: "Title", group: "customer" },
  
  // Dates - Start
  { key: "start_timestamp", label: "Start Timestamp", group: "dates_start" },
  { key: "start_date", label: "Start Date", group: "dates_start" },
  { key: "start_time", label: "Start Time", group: "dates_start" },
  
  // Dates - End
  { key: "end_timestamp", label: "End Timestamp", group: "dates_end" },
  { key: "end_date", label: "End Date", group: "dates_end" },
  { key: "end_time", label: "End Time", group: "dates_end" },
  
  // Vehicle
  { key: "vehicle_reg", label: "Vehicle Reg", group: "vehicle" },
  { key: "vehicle_make", label: "Make", group: "vehicle" },
  { key: "vehicle_model", label: "Model", group: "vehicle" },
  { key: "vehicle_colour", label: "Colour", group: "vehicle" },
  
  // Other
  { key: "flight_number", label: "Flight Number", group: "other" },
  { key: "phone", label: "Phone", group: "other" },
  { key: "status", label: "Status", group: "other" },
  { key: "price", label: "Price", group: "other" },
  { key: "money_received", label: "Money Received", group: "other" },
  { key: "notes", label: "Notes", group: "other" },
];

const FIELD_GROUPS = [
  { id: "core", label: "Core Fields", icon: "📋" },
  { id: "customer", label: "Customer Information", icon: "👤" },
  { id: "dates_start", label: "Start Date/Time", icon: "📅" },
  { id: "dates_end", label: "End Date/Time", icon: "📅" },
  { id: "vehicle", label: "Vehicle Details", icon: "🚗" },
  { id: "other", label: "Other Information", icon: "ℹ️" },
];

export default function UploadClient({ tenant, tenantId }: UploadClientProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [rows, setRows] = React.useState<any[][]>([]);
  const [map, setMap] = React.useState<ImportProfileMap>({});
  const [timezone, setTimezone] = React.useState(tenant.timezone || "Europe/London");
  const [preview, setPreview] = React.useState<CanonicalBooking[]>([]);
  const [profileName, setProfileName] = React.useState("Auto-generated");
  const [fileAnalysed, setFileAnalysed] = React.useState(false);
  const [overwrite, setOverwrite] = React.useState<boolean>(true);
  const [statusMsg, setStatusMsg] = React.useState<string>("");
  const [mappings, setMappings] = React.useState<{id:string;name:string;mapping:any}[]>([]);
  const [selectedMappingId, setSelectedMappingId] = React.useState<string>("");
  const [autoMsg, setAutoMsg] = React.useState<string>("");
  const [sourceMapping, setSourceMapping] = React.useState<string>("other");
  const [customSource, setCustomSource] = React.useState<string>("");
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set(["core", "customer", "dates_start", "dates_end"]));

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
    setMap(prev => ({ ...proposal }));
    setAutoMsg("Auto-detected mapping applied. Please review the letters, then Preview.");
    
    // If you have saved mappings, show the closest match:
    if (mappings.length) {
      // Transform mappings to have 'map' property for compatibility with bestMatchAgainstSaved
      const transformedMappings = mappings.map(m => ({ ...m, map: m.mapping }));
      const best = bestMatchAgainstSaved(proposal, transformedMappings);
      if (best) setStatusMsg(`Closest saved mapping: "${best.name}" (${best.score}% match). Use the dropdown to load it if preferred.`);
    }
  }

  function buildPreview() {
    const out: CanonicalBooking[] = [];
    console.log(`🔍 Building preview for ${rows.length} rows`);
    // Process all rows, not just a sample
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      // timestamps: use timestamp if provided (for Excel serial dates with time), otherwise compose date+time
      const startTimestamp = getCell(r, map.start_timestamp);
      const endTimestamp = getCell(r, map.end_timestamp);
      
      const start_at = startTimestamp 
        ? composeISO(startTimestamp, undefined, timezone as any, DATE_OPTS)
        : composeISO(getCell(r, map.start_date), getCell(r, map.start_time), timezone as any, DATE_OPTS);
      
      const end_at = endTimestamp
        ? composeISO(endTimestamp, undefined, timezone as any, DATE_OPTS)
        : composeISO(getCell(r, map.end_date), getCell(r, map.end_time), timezone as any, DATE_OPTS);

      // Handle full name or separate first/last name
      let customer_firstname: string;
      let customer_lastname: string;
      const customer_name_full = getCell(r, map.customer_name);
      
      if (customer_name_full && customer_name_full.trim()) {
        // If full name is provided, split it into first and last name
        const nameParts = customer_name_full.trim().split(/\s+/);
        if (nameParts.length === 1) {
          // Only one word, treat as last name
          customer_firstname = "";
          customer_lastname = nameParts[0].toUpperCase();
        } else {
          // Last word is last name, everything else is first name
          customer_lastname = nameParts[nameParts.length - 1].toUpperCase();
          customer_firstname = nameParts.slice(0, -1).join(" ");
        }
      } else {
        // Use separate first/last name fields
        customer_lastname = getCell(r, map.customer_lastname).toUpperCase();
        customer_firstname = getCell(r, map.customer_firstname);
      }
      
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
        _rawRow: r, // Store original raw row array for Holiday Extras phone finder
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
    const successCount = j.successCount ?? 0;
    const skippedCount = j.skippedCount ?? 0;
    const errorCount = j.errorCount ?? 0;
    
    let msg = `✅ Import complete!\n\n`;
    msg += `Successfully processed: ${successCount} booking(s)\n`;
    msg += `   (includes both new bookings and updates to existing bookings)\n`;
    
    if (errorCount > 0) {
      msg += `\n❌ Errors: ${errorCount}\n`;
      msg += `   Check the import errors page for details.`;
    }
    
    if (errorCount === 0) {
      msg += `\nAll rows processed successfully!`;
    }
    
    alert(msg);
    
    // Reset all state to upload ready
    setFile(null);
    setFileAnalysed(false);
    setRows([]);
    setMap({});
    setPreview([]);
    setStatusMsg("");
    setOverwrite(true);
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


  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const getFieldsByGroup = (groupId: string) => {
    return FIELDS.filter(f => f.group === groupId);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Import Bookings</h1>
        {fileAnalysed && (
          <button 
            onClick={autoDetect} 
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            disabled={!rows.length}
          >
            🔍 Auto-detect Mapping
          </button>
        )}
      </div>
      
      {statusMsg && (
        <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded text-sm text-blue-800">
          {statusMsg}
        </div>
      )}

      {autoMsg && (
        <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded text-sm text-green-800">
          {autoMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {/* Step 1: File Selection */}
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h2 className="text-lg font-semibold">1. Select File</h2>
            <label className="block">
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls,.tsv,.txt" 
                onChange={onFile}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </label>
            {file && (
              <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
            {file && !fileAnalysed && (
              <div className="space-y-2">
                {mappings.length > 0 && (
                  <select
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={selectedMappingId}
                    onChange={(e)=>{
                      const id = e.target.value;
                      setSelectedMappingId(id);
                      const m = mappings.find(x=>x.id===id);
                      if (m?.mapping) setMap(prev => ({ ...prev, ...m.mapping }));
                    }}
                  >
                    <option value="">Load saved mapping…</option>
                    {mappings.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                )}
                <button 
                  onClick={analyseFile} 
                  className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Analyse File
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Column Mapping */}
          {fileAnalysed && (
            <div className="bg-white border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">2. Map Columns</h2>
                <span className="text-xs text-gray-500">Use letters (A-Z) or numbers (0-9)</span>
              </div>
              
              {FIELD_GROUPS.map(group => {
                const groupFields = getFieldsByGroup(group.id);
                const isExpanded = expandedGroups.has(group.id);
                
                return (
                  <div key={group.id} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
                    >
                      <span className="font-medium text-sm flex items-center gap-2">
                        <span>{group.icon}</span>
                        {group.label}
                      </span>
                      <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
                    </button>
                    {isExpanded && (
                      <div className="p-3 space-y-2 bg-white">
                        {groupFields.map(f => (
                          <div key={f.key as string} className="flex items-center gap-2">
                            <label className="w-32 text-sm flex items-center gap-1">
                              {f.label}
                              {f.required && <span className="text-red-500">*</span>}
                            </label>
                            <input
                              className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="A or 0"
                              value={(map[f.key] as string) || ""}
                              onChange={e => setMap(m => ({ ...m, [f.key]: e.target.value }))}
                            />
                          </div>
                        ))}
                        {group.id === "dates_start" && (
                          <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded mt-2">
                            💡 Use <strong>Start Timestamp</strong> for Excel serial dates (e.g., 46143.125) or ISO timestamps. 
                            Or use separate <strong>Start Date</strong> + <strong>Start Time</strong> fields.
                          </div>
                        )}
                        {group.id === "dates_end" && (
                          <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded mt-2">
                            💡 Use <strong>End Timestamp</strong> for Excel serial dates (e.g., 46150.625) or ISO timestamps. 
                            Or use separate <strong>End Date</strong> + <strong>End Time</strong> fields.
                          </div>
                        )}
                        {group.id === "customer" && (
                          <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded mt-2">
                            💡 Use <strong>Full Name</strong> for CAVU imports, or separate <strong>First Name</strong> + <strong>Last Name</strong>.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="bg-gray-50 border rounded-lg p-4 space-y-3">
                <h3 className="font-medium text-sm">Source Mapping</h3>
                <select 
                  className="w-full border rounded px-3 py-2 text-sm"
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
                {sourceMapping === "custom" && (
                  <input 
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder="e.g. EXT1, MyCompany, etc."
                    value={customSource}
                    onChange={e => setCustomSource(e.target.value)}
                  />
                )}
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={buildPreview} 
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
                >
                  Build Preview
                </button>
                <button 
                  onClick={saveProfile} 
                  className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  Save Profile
                </button>
              </div>

              {preview.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-green-900">Ready to Import</p>
                      <p className="text-sm text-green-700">{preview.length} booking(s) ready</p>
                    </div>
                    <button 
                      onClick={commitImport} 
                      className="px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
                    >
                      Import {preview.length} Booking{preview.length !== 1 ? 's' : ''}
                    </button>
                  </div>
                  <p className="text-xs text-green-700">
                    ✓ Existing bookings with the same reference will be updated automatically
                  </p>
                </div>
              )}

              {/* Diff with selected saved mapping */}
              {selectedMappingId && (
                <DiffBlock 
                  current={map} 
                  saved={(mappings.find(m=>m.id===selectedMappingId)?.mapping)||{}} 
                />
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {/* Raw File Data */}
          {fileAnalysed && rows.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Raw File Data</h3>
                <span className="text-sm text-gray-500">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-auto max-h-[400px] border rounded">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="border px-2 py-2 text-left font-semibold">Row</th>
                      {rows[0]?.map((_, idx) => (
                        <th key={idx} className="border px-2 py-2 text-left font-semibold">
                          <div>{String.fromCharCode(65 + idx)}</div>
                          <div className="text-gray-500 font-normal">({idx})</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border px-2 py-1 font-mono text-gray-600">{idx + 1}</td>
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className="border px-2 py-1">
                            {String(cell || "").slice(0, 15)}
                            {String(cell || "").length > 15 && "…"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {rows.length > 10 && (
                      <tr>
                        <td colSpan={rows[0]?.length + 1} className="text-center py-2 text-gray-500 text-xs">
                          ... and {rows.length - 10} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Processed Preview */}
          {preview.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Preview</h3>
                <span className="text-sm text-gray-500">{preview.length} booking{preview.length !== 1 ? 's' : ''} ready</span>
              </div>
              <div className="overflow-auto max-h-[500px] border rounded">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {[
                        "Ref","Customer","Start","End","Vehicle","Status"
                      ].map(h => <th key={h} className="border px-2 py-2 text-left font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((r, idx) => {
                      const startDate = r.start_at;
                      const endDate = r.end_at;
                      const hasDateIssue = !startDate || !endDate;
                      const hasOrderIssue = startDate && endDate && dayjs(startDate).isAfter(dayjs(endDate));
                      
                      return (
                        <tr key={idx} className={`hover:bg-gray-50 ${hasDateIssue || hasOrderIssue ? "bg-yellow-50" : ""}`}>
                          <td className="border px-2 py-1 font-mono text-xs">{r.reference}</td>
                          <td className="border px-2 py-1">{r.customer_name}</td>
                          <td className="border px-2 py-1">
                            {startDate ? dayjs(startDate).format("DD/MM/YY HH:mm") : <span className="text-red-500">❌</span>}
                            {hasOrderIssue && <span className="text-orange-500 ml-1">⚠️</span>}
                          </td>
                          <td className="border px-2 py-1">
                            {endDate ? dayjs(endDate).format("DD/MM/YY HH:mm") : <span className="text-red-500">❌</span>}
                          </td>
                          <td className="border px-2 py-1">{r.vehicle_reg || "-"}</td>
                          <td className="border px-2 py-1">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              r.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              r.status === 'amended' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {preview.length > 50 && (
                      <tr>
                        <td colSpan={6} className="text-center py-2 text-gray-500 text-xs">
                          ... and {preview.length - 50} more bookings
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

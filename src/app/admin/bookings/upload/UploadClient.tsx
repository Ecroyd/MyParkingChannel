"use client";

import * as XLSX from "xlsx";
import React from "react";
import dayjs from "dayjs";
import type { DateParseOptions } from "@/lib/imports/datetime";
import { previewStatus } from "@/lib/imports/normalise";
import { looksLikeHeaderRow } from "@/lib/imports/header";
import { buildImportRows, type RowIssue } from "@/lib/imports/buildRows";
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

/** Rows per commit request: keeps each body well under Vercel's 4.5MB limit and the timeout. */
const COMMIT_CHUNK_SIZE = 200;

/** Decode CSV bytes as UTF-8, falling back to Windows-1252 when the file isn't valid UTF-8. */
function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function isDelimitedTextFile(name: string) {
  return /\.(csv|tsv)$/i.test(name);
}

type CommitSummary = {
  inserted: number;
  updated: number;
  duplicates: RowIssue[];
  warnings: RowIssue[];
  errors: Array<{ rowIndex: number; reference: string; reason: string }>;
  failedChunk?: string;
  rowsNotSent: number;
};

async function readJsonSafe(res: Response): Promise<any | null> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function describeHttpError(res: Response, j: any): string {
  if (res.status === 401) return j?.error || "Your session has expired. Sign in again and retry.";
  if (res.status === 403) return "You need Admin or Operations access to import";
  if (res.status === 413) return j?.error || "The request was too large for the server.";
  if (res.status === 504 || res.status === 408) return "The server timed out processing this batch.";
  if (j?.error) return String(j.error);
  return `Server returned ${res.status} ${res.statusText || ""}`.trim() + (j ? "" : " (not a JSON response)");
}

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
  const [overwrite, setOverwrite] = React.useState<boolean>(false);
  const [hasHeader, setHasHeader] = React.useState<boolean>(true);
  const [rowNumbers, setRowNumbers] = React.useState<number[]>([]);
  const [emptyRowsSkipped, setEmptyRowsSkipped] = React.useState(0);
  const [rowErrors, setRowErrors] = React.useState<RowIssue[]>([]);
  const [fileDuplicates, setFileDuplicates] = React.useState<RowIssue[]>([]);
  const [importing, setImporting] = React.useState(false);
  const [commitSummary, setCommitSummary] = React.useState<CommitSummary | null>(null);
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
    setRowErrors([]);
    setFileDuplicates([]);
    setCommitSummary(null);
  }

  function analyseFile() {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let aoa: any[][] = [];
      
      // Check if it's a text file (txt) that might need special parsing
      if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().includes('aph')) {
        // Parse as text file (handles APH format with quoted CSV)
        const text = reader.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        
        for (const line of lines) {
          // Parse CSV with quoted fields - format: "value1","value2","value3"
          // Each field is quoted and separated by commas
          const row: any[] = [];
          let current = '';
          let inQuotes = false;
          
          let i = 0;
          while (i < line.length) {
            const char = line[i];
            const nextChar = i < line.length - 1 ? line[i + 1] : '';
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                // Escaped quote inside quoted field (double quote = literal quote)
                current += '"';
                i += 2; // Skip both quotes
                continue;
              } else if (inQuotes) {
                // Closing quote - end of field
                inQuotes = false;
                i++;
                // If next is comma, skip it; otherwise we'll process it next iteration
                if (nextChar === ',') {
                  row.push(current.trim());
                  current = '';
                  i++; // Skip the comma
                }
                continue;
              } else {
                // Opening quote - start of new field
                inQuotes = true;
                i++;
                continue;
              }
            } else if (char === ',' && !inQuotes) {
              // Field separator (outside quotes)
              row.push(current.trim());
              current = '';
              i++;
              continue;
            } else {
              // Regular character - add to current field
              current += char;
              i++;
            }
          }
          
          // Add the last field if there's any content
          if (current.length > 0) {
            row.push(current.trim());
          }
          
          if (row.length > 0) {
            aoa.push(row);
          }
        }
      } else {
        // Parse as Excel/CSV using XLSX (handles both .xlsx and .csv files)
        try {
          let wb: XLSX.WorkBook;
          if (isDelimitedTextFile(file.name)) {
            // CSV/TSV: keep every cell as the exact text in the file. Without raw:true SheetJS
            // turns "01/02/2026" into a US-date serial (2 Jan), strips phone leading zeros and
            // reads "12,50" as 1250. Dates are parsed later as DD/MM/YYYY.
            const text = decodeText(reader.result as ArrayBuffer);
            wb = XLSX.read(text, { type: "string", raw: true });
          } else {
            // XLSX/XLS: real date cells arrive as Excel serial numbers and are converted exactly.
            const data = new Uint8Array(reader.result as ArrayBuffer);
            wb = XLSX.read(data, { type: "array" });
          }
          const ws = wb.Sheets[wb.SheetNames[0]];
          // Parse with header: 1 to get array of arrays, preserve empty cells
          aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
        } catch (err) {
          // If XLSX fails, try parsing as CSV text
          console.warn("XLSX parsing failed, trying text CSV parsing:", err);
          const text = new TextDecoder().decode(reader.result as ArrayBuffer);
          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
          
          for (const line of lines) {
            // Simple CSV parsing (handles quoted fields)
            const row: any[] = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                row.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            if (current.length > 0 || line.endsWith(',')) {
              row.push(current.trim());
            }
            if (row.length > 0) {
              aoa.push(row);
            }
          }
        }
      }
      
      // Find the maximum column count to normalize all rows
      const maxCols = Math.max(...aoa.map(r => r?.length || 0), 0);
      
      // Normalize rows: ensure all rows have the same length, padding with empty strings
      // Filter out completely empty rows, but keep rows with at least one non-empty cell
      const filteredRows: any[][] = [];
      const lineNumbers: number[] = [];
      let empty = 0;
      aoa.forEach((r, idx) => {
        const normalized = [...(r || [])];
        while (normalized.length < maxCols) normalized.push("");
        if (normalized.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== "")) {
          filteredRows.push(normalized);
          lineNumbers.push(idx + 1);
        } else {
          empty++;
        }
      });
      
      setRows(filteredRows);
      setRowNumbers(lineNumbers);
      setEmptyRowsSkipped(empty);
      setHasHeader(looksLikeHeaderRow(filteredRows[0]));
      setFileAnalysed(true);
      console.log(`📄 File analysed: ${filteredRows.length} rows loaded, ${maxCols} columns detected, ${empty} empty rows skipped`);
    };
    
    // Read as text for .txt files, as array buffer for Excel files
    if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().includes('aph')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
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

  function currentProfileName() {
    return selectedMappingId ? (mappings.find(m=>m.id===selectedMappingId)?.name || "Auto-generated") : "Auto-generated";
  }

  function buildPreview() {
    const profileUpper = currentProfileName().toUpperCase().replace(/\s+/g, "");
    const result = buildImportRows(rows, map, {
      hasHeader,
      source: sourceMapping === "custom" ? customSource : sourceMapping,
      dateOpts: { ...DATE_OPTS, timezone },
      // The server only uses the raw row for the Holiday Extras phone finder.
      includeRawRow: profileUpper.includes("HOLIDAYEXTRAS"),
      rowNumbers,
    });
    console.log(`✅ Preview built: ${result.rows.length} ready, ${result.errors.length} errors, ${result.duplicates.length} duplicates`);
    setPreview(result.rows);
    setRowErrors(result.errors);
    setFileDuplicates(result.duplicates);
    setCommitSummary(null);
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
    if (importing) return;
    setImporting(true);
    setStatusMsg("");

    const summary: CommitSummary = {
      inserted: 0, updated: 0, duplicates: [], warnings: [], errors: [], rowsNotSent: 0,
    };
    let runId: string | null = null;
    const profileName = currentProfileName();

    try {
      for (let i = 0; i < preview.length; i += COMMIT_CHUNK_SIZE) {
        const chunk = preview.slice(i, i + COMMIT_CHUNK_SIZE);
        setStatusMsg(`Importing rows ${i + 1}-${i + chunk.length} of ${preview.length}…`);
        const url = "/api/import/bookings/commit" + (runId ? `?runId=${encodeURIComponent(runId)}` : "");
        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tenantId,
              rows: chunk,
              profileName,
              overwriteDuplicates: overwrite,
              sourceMapping: sourceMapping === "custom" ? "other" : sourceMapping, // Custom sources map to 'other' in database
            }),
          });
        } catch (err: any) {
          summary.failedChunk = `Network error: ${err?.message ?? String(err)}`;
          summary.rowsNotSent = preview.length - i;
          break;
        }
        const j = await readJsonSafe(res);
        if (!res.ok || !j) {
          summary.failedChunk = describeHttpError(res, j);
          summary.rowsNotSent = preview.length - i;
          break;
        }
        runId = j.runId ?? runId;
        summary.inserted += j.insertedCount ?? 0;
        summary.updated += j.updatedCount ?? 0;
        summary.duplicates.push(...(j.duplicates ?? []));
        summary.warnings.push(...(j.warnings ?? []));
        summary.errors.push(...(j.errors ?? []));
      }
    } finally {
      setImporting(false);
    }

    setCommitSummary(summary);
    if (summary.failedChunk) {
      setStatusMsg(`Import stopped: ${summary.failedChunk}. ${summary.inserted + summary.updated} booking(s) were saved before it stopped; ${summary.rowsNotSent} row(s) were not sent.`);
      return;
    }
    setStatusMsg(
      `Import complete: ${summary.inserted} new, ${summary.updated} updated, ${summary.duplicates.length} skipped as duplicates, ${summary.errors.length} error(s).`
    );
    // Clear the file so the same rows aren't committed twice; the summary stays on screen.
    setFile(null);
    setFileAnalysed(false);
    setRows([]);
    setPreview([]);
    setRowErrors([]);
    setFileDuplicates([]);
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
              <>
                <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                </div>
                {!fileAnalysed && (
                  <div className="space-y-3 pt-2">
                    {mappings.length > 0 && (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Optional: Load saved mapping</label>
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
                          <option value="">None - start fresh</option>
                          {mappings.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button 
                      onClick={analyseFile} 
                      className="w-full px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold text-base hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
                    >
                      📄 Analyse File & Continue
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                      This will read your file and prepare it for column mapping
                    </p>
                  </div>
                )}
              </>
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

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} />
                First row is a header (column names)
              </label>

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
                      disabled={importing}
                      className="px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {importing ? "Importing…" : `Import ${preview.length} Booking${preview.length !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-green-800">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={overwrite}
                      onChange={e => setOverwrite(e.target.checked)}
                    />
                    <span>
                      Update existing bookings with the same reference. When off, they are skipped and listed as duplicates.
                      Checked-in/out and cancelled bookings keep their status; empty cells keep existing values.
                    </span>
                  </label>
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
          {commitSummary && <CommitSummaryBlock summary={commitSummary} />}

          {fileAnalysed && (preview.length > 0 || rowErrors.length > 0 || fileDuplicates.length > 0) && (
            <div className="bg-white border rounded-lg p-4 space-y-3 text-sm">
              <h3 className="font-semibold">Rows not in the import</h3>
              <ul className="text-gray-700 space-y-1">
                <li>{hasHeader ? 1 : 0} header row skipped{hasHeader ? "" : " (first row treated as data)"}</li>
                <li>{emptyRowsSkipped} empty row(s) skipped</li>
                <li className={rowErrors.length ? "text-red-700 font-medium" : ""}>
                  {rowErrors.length} row(s) with errors (will NOT be imported)
                </li>
                <li className={fileDuplicates.length ? "text-amber-700 font-medium" : ""}>
                  {fileDuplicates.length} duplicate reference(s) in this file (the last row for each reference is used)
                </li>
              </ul>
              <IssueList title="Row errors" issues={rowErrors} tone="red" />
              <IssueList title="Duplicates in file" issues={fileDuplicates} tone="amber" />
            </div>
          )}

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
              <div className="overflow-auto max-h-[600px] border rounded">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {[
                        "Ref","Source","Customer","Title","Start","End","Vehicle","Make","Model","Colour","Flight","Phone","Status","Price","Paid","Notes"
                      ].map(h => <th key={h} className="border px-2 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}
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
                          <td className="border px-2 py-1 font-mono text-xs">{r.reference || "-"}</td>
                          <td className="border px-2 py-1">{r.source || "-"}</td>
                          <td className="border px-2 py-1">{r.customer_name || "-"}</td>
                          <td className="border px-2 py-1">{r.customer_title || "-"}</td>
                          <td className="border px-2 py-1">
                            {startDate ? dayjs(startDate).format("DD/MM/YY HH:mm") : <span className="text-red-500">❌</span>}
                            {hasOrderIssue && <span className="text-orange-500 ml-1">⚠️</span>}
                          </td>
                          <td className="border px-2 py-1">
                            {endDate ? dayjs(endDate).format("DD/MM/YY HH:mm") : <span className="text-red-500">❌</span>}
                          </td>
                          <td className="border px-2 py-1 font-mono">{r.vehicle_reg || "-"}</td>
                          <td className="border px-2 py-1">{r.vehicle_make || "-"}</td>
                          <td className="border px-2 py-1">{r.vehicle_model || "-"}</td>
                          <td className="border px-2 py-1">{r.vehicle_colour || "-"}</td>
                          <td className="border px-2 py-1">{r.flight_number || "-"}</td>
                          <td className="border px-2 py-1">{r.phone || "-"}</td>
                          <td className="border px-2 py-1">
                            <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${
                              previewStatus(r.status) === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-green-100 text-green-700'
                            }`} title={r.status ? `File: ${r.status}` : "No status in file"}>
                              {previewStatus(r.status)}
                            </span>
                          </td>
                          <td className="border px-2 py-1">{r.price != null ? `£${r.price.toFixed(2)}` : "-"}</td>
                          <td className="border px-2 py-1">{r.money_received != null ? `£${r.money_received.toFixed(2)}` : "-"}</td>
                          <td className="border px-2 py-1 max-w-[200px] truncate" title={r.notes || ""}>{r.notes || "-"}</td>
                        </tr>
                      );
                    })}
                    {preview.length > 50 && (
                      <tr>
                        <td colSpan={16} className="text-center py-2 text-gray-500 text-xs">
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

function IssueList({ title, issues, tone }: { title: string; issues: RowIssue[]; tone: "red" | "amber" }) {
  if (!issues.length) return null;
  const color = tone === "red" ? "text-red-800 bg-red-50 border-red-200" : "text-amber-800 bg-amber-50 border-amber-200";
  return (
    <details className={`border rounded p-2 ${color}`} open={issues.length <= 20}>
      <summary className="cursor-pointer font-medium">{title} ({issues.length})</summary>
      <ul className="mt-2 space-y-0.5 max-h-60 overflow-auto font-mono text-xs">
        {issues.slice(0, 500).map((e, i) => (
          <li key={i}>Row {e.rowNumber}{e.reference ? ` (${e.reference})` : ""}: {e.reason}</li>
        ))}
        {issues.length > 500 && <li>… and {issues.length - 500} more</li>}
      </ul>
    </details>
  );
}

function CommitSummaryBlock({ summary }: { summary: CommitSummary }) {
  const failed = Boolean(summary.failedChunk);
  return (
    <div className={`border rounded-lg p-4 space-y-2 text-sm ${failed ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"}`}>
      <h3 className="font-semibold">{failed ? "Import stopped" : "Import complete"}</h3>
      {failed && <p className="text-red-800">{summary.failedChunk} ({summary.rowsNotSent} row(s) not sent)</p>}
      <ul className="space-y-0.5">
        <li>{summary.inserted} new booking(s)</li>
        <li>{summary.updated} existing booking(s) updated</li>
        <li>{summary.duplicates.length} skipped as duplicates</li>
        <li>{summary.errors.length} error(s)</li>
      </ul>
      <IssueList
        title="Errors"
        issues={summary.errors.map(e => ({ rowNumber: e.rowIndex, reference: e.reference, reason: e.reason }))}
        tone="red"
      />
      <IssueList title="Skipped duplicates" issues={summary.duplicates} tone="amber" />
      <IssueList title="Warnings" issues={summary.warnings} tone="amber" />
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

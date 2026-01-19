// Pattern-first, headerless column detector for your importer.
// Analyses the first N rows, scores each column by patterns, and proposes a MapState.
// Also includes helpers to compare with previously-saved mappings.

import { cellToCleanString } from "./utils";

export type MapState = {
  source?: string; reference?: string;
  customer_name?: string; // Full name (optional, can be used instead of first/last)
  customer_lastname?: string; customer_title?: string; customer_firstname?: string;

  start_mode?: "single"|"split";
  end_mode?: "single"|"split";
  start_timestamp?: string; end_timestamp?: string;
  start_date?: string; start_time?: string;
  end_date?: string; end_time?: string;

  vehicle_reg?: string; vehicle_colour?: string; vehicle_make?: string; vehicle_model?: string;
  flight_number?: string; phone?: string; status?: string; price?: string; money_received?: string; notes?: string;

  timezone?: "UTC"|"Europe/London";
};

const TITLES = new Set(["MR","MRS","MISS","MS","DR","PROF"]);
const COLOURS = new Set(["BLACK","BLUE","GREY","GRAY","WHITE","RED","BRONZE","SILVER","GREEN","YELLOW","BROWN","ORANGE","PURPLE","BEIGE"]);
const MAKES = new Set(["AUDI","BMW","CITROEN","CITROËN","CUPRA","FORD","HONDA","LAND","LAND ROVER","MAZDA","MINI","PEUGEOT","PORSCHE","SEAT","SKODA","TOYOTA","VAUXHALL","VOLVO","POLESTAR"]);

const RE = {
  source: /^EXT\d*$/i,
  reference: /^[A-Z0-9]{5,10}$/,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
  date6: /^\d{6}$/,           // ddmmyy
  dateDmy: /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  isoDate: /^\d{4}-\d{2}-\d{2}/,
  isoTs: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
  excelDate: /^\d{5,6}$/,     // Excel serial dates (30000-60000 range)
  flight: /^[A-Z]{2,3}\d{3,5}$/i,
  status: /\*(CANX|FIRM|AMND)\*/i,
  phone: /^(\+|0|\(?0|0044|44)?[\d\s\-\(\)]{9,}$/,
  decimal: /^\d+\.\d+$/,
  integer: /^\d+$/,
  vrm: /^[A-Z]{1,3}\s*\d{1,4}\s*[A-Z]{1,3}$/,
};

function idxToLetter(i: number) {
  let n = i+1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s.toLowerCase(); // we use lowercase letters in UI
}

type ColScore = {
  i: number;
  samples: string[];
  counts: Record<string, number>;
};

function scoreColumns(rows: any[][], sampleRows = 50): ColScore[] {
  const take = rows.slice(0, sampleRows);
  const width = Math.max(...take.map(r => r.length));
  const cols: ColScore[] = Array.from({ length: width }, (_, i) => ({
    i, samples: [], counts: Object.create(null),
  }));

  for (const r of take) {
    for (let i = 0; i < width; i++) {
      const raw = r[i];
      const s = cellToCleanString(raw).trim();
      cols[i].samples.push(s);
      const C = cols[i].counts;

      if (!s) { C.blank = (C.blank||0)+1; continue; }

      const U = s.toUpperCase();
      if (RE.source.test(s))        C.source = (C.source||0)+1;
      if (RE.reference.test(U))     C.reference = (C.reference||0)+1;
      if (TITLES.has(U))            C.title = (C.title||0)+1;
      if (RE.time.test(s))            C.time = (C.time||0)+1;
      if (RE.date6.test(s))         C.date6 = (C.date6||0)+1;
      if (RE.dateDmy.test(s))       C.dateDmy = (C.dateDmy||0)+1;
      if (RE.isoDate.test(s))       C.isoDate = (C.isoDate||0)+1;
      if (RE.isoTs.test(s))         C.isoTs = (C.isoTs||0)+1;
      if (RE.excelDate.test(s))     C.excelDate = (C.excelDate||0)+1;
      if (RE.flight.test(U))        C.flight = (C.flight||0)+1;
      if (RE.status.test(U))        C.status = (C.status||0)+1;
      if (RE.phone.test(s))         C.phone = (C.phone||0)+1;
      if (RE.decimal.test(s))       C.dec = (C.dec||0)+1;
      if (RE.vrm.test(U))           C.vrm = (C.vrm||0)+1;
      if (COLOURS.has(U))           C.colour = (C.colour||0)+1;
      if (MAKES.has(U))             C.make = (C.make||0)+1;
    }
  }
  return cols;
}

function bestBy(cols: ColScore[], key: string, minRatio = 0.5) {
  const total = Math.max(...cols.map(c => c.samples.length), 1);
  let best: ColScore | null = null, bestScore = 0;
  for (const c of cols) {
    const v = c.counts[key] || 0;
    const ratio = v / total;
    if (ratio > bestScore) { bestScore = ratio; best = c; }
  }
  return (best && (best.counts[key]||0)/Math.max(best.samples.length,1) >= minRatio) ? best : null;
}

function positionAfter(cols: ColScore[], idx: number, key: string, minRatio = 0.4) {
  // find the first column RIGHT of idx that matches key well
  const total = Math.max(...cols.map(c => c.samples.length), 1);
  let best: ColScore | null = null, bestScore = 0;
  for (const c of cols) {
    if (c.i <= idx) continue;
    const ratio = (c.counts[key] || 0) / total;
    if (ratio > bestScore) { bestScore = ratio; best = c; }
  }
  return (best && (best.counts[key]||0)/Math.max(best.samples.length,1) >= minRatio) ? best : null;
}

// Header name patterns for common field names
const HEADER_PATTERNS: Record<string, RegExp[]> = {
  reference: [
    /^booking[_\s-]?reference$/i,
    /^ref$/i,
    /^reference$/i,
    /^booking[_\s-]?ref$/i,
  ],
  customer_name: [
    /^customer[_\s-]?name$/i,
    /^name$/i,
    /^passenger[_\s-]?name$/i,
    /^full[_\s-]?name$/i,
  ],
  customer_firstname: [
    /^first[_\s-]?name$/i,
    /^customer[_\s-]?first[_\s-]?name$/i,
    /^forename$/i,
  ],
  customer_lastname: [
    /^last[_\s-]?name$/i,
    /^surname$/i,
    /^customer[_\s-]?last[_\s-]?name$/i,
    /^family[_\s-]?name$/i,
  ],
  customer_title: [
    /^title$/i,
    /^customer[_\s-]?title$/i,
    /^salutation$/i,
  ],
  start_timestamp: [
    /^entry[_\s-]?datetime$/i,
    /^start[_\s-]?timestamp$/i,
    /^arrival[_\s-]?datetime$/i,
    /^entry[_\s-]?date[_\s-]?time$/i,
  ],
  end_timestamp: [
    /^exit[_\s-]?datetime$/i,
    /^end[_\s-]?timestamp$/i,
    /^departure[_\s-]?datetime$/i,
    /^exit[_\s-]?date[_\s-]?time$/i,
  ],
  start_date: [
    /^start[_\s-]?date$/i,
    /^arrival[_\s-]?date$/i,
    /^entry[_\s-]?date$/i,
  ],
  start_time: [
    /^start[_\s-]?time$/i,
    /^arrival[_\s-]?time$/i,
    /^entry[_\s-]?time$/i,
  ],
  end_date: [
    /^end[_\s-]?date$/i,
    /^departure[_\s-]?date$/i,
    /^exit[_\s-]?date$/i,
  ],
  end_time: [
    /^end[_\s-]?time$/i,
    /^departure[_\s-]?time$/i,
    /^exit[_\s-]?time$/i,
  ],
  vehicle_reg: [
    /^license[_\s-]?plate$/i,
    /^vehicle[_\s-]?reg$/i,
    /^registration$/i,
    /^reg$/i,
    /^plate$/i,
    /^vrm$/i,
    /^number[_\s-]?plate$/i,
  ],
  vehicle_make: [
    /^vehicle[_\s-]?make$/i,
    /^make$/i,
    /^car[_\s-]?make$/i,
  ],
  vehicle_model: [
    /^vehicle[_\s-]?model$/i,
    /^model$/i,
    /^car[_\s-]?model$/i,
  ],
  vehicle_colour: [
    /^vehicle[_\s-]?colour$/i,
    /^vehicle[_\s-]?color$/i,
    /^colour$/i,
    /^color$/i,
    /^car[_\s-]?colour$/i,
  ],
  flight_number: [
    /^flight[_\s-]?number$/i,
    /^flight$/i,
  ],
  phone: [
    /^contact[_\s-]?number$/i,
    /^phone$/i,
    /^telephone$/i,
    /^mobile$/i,
    /^customer[_\s-]?phone$/i,
  ],
  status: [
    /^booking[_\s-]?status$/i,
    /^status$/i,
    /^booking[_\s-]?status[_\s-]?name$/i,
  ],
  price: [
    /^price$/i,
    /^product[_\s-]?native[_\s-]?price$/i,
    /^amount$/i,
    /^total[_\s-]?price$/i,
  ],
  money_received: [
    /^money[_\s-]?received$/i,
    /^deposit[_\s-]?amount$/i,
    /^paid$/i,
  ],
  source: [
    /^source$/i,
    /^booking[_\s-]?source$/i,
  ],
};

function matchHeader(header: string, field: string): boolean {
  const patterns = HEADER_PATTERNS[field];
  if (!patterns) return false;
  const cleanHeader = header.trim();
  return patterns.some(pattern => pattern.test(cleanHeader));
}

function detectHeaders(rows: any[][]): Map<number, string> | null {
  if (rows.length === 0) return null;
  
  const firstRow = rows[0];
  // Check if first row looks like headers (mostly text, not dates/numbers)
  const textCount = firstRow.filter(cell => {
    const s = cellToCleanString(cell).trim();
    return s && !/^\d+\.?\d*$/.test(s) && !RE.isoDate.test(s) && !RE.dateDmy.test(s);
  }).length;
  
  // If more than 50% of first row is text (not numbers/dates), treat as headers
  if (textCount / Math.max(firstRow.length, 1) > 0.5) {
    const headerMap = new Map<number, string>();
    firstRow.forEach((cell, idx) => {
      const header = cellToCleanString(cell).trim();
      if (header) headerMap.set(idx, header);
    });
    return headerMap;
  }
  
  return null;
}

export function autoDetectMap(rows: any[][]): MapState {
  console.log("🔍 autoDetectMap called with rows:", rows.length);
  
  // First, try to detect headers
  const headerMap = detectHeaders(rows);
  const dataRows = headerMap ? rows.slice(1) : rows;
  
  const cols = scoreColumns(dataRows);
  const total = Math.max(...cols.map(c => c.samples.length), 1);
  
  console.log("📊 Scored columns:", cols.map(c => ({ i: c.i, counts: c.counts })));
  if (headerMap) {
    console.log("📋 Detected headers:", Array.from(headerMap.entries()));
  }

  // Match headers to fields
  const headerMatches: Partial<Record<string, number>> = {};
  if (headerMap) {
    for (const [field, patterns] of Object.entries(HEADER_PATTERNS)) {
      for (const [colIdx, header] of headerMap.entries()) {
        if (patterns.some(pattern => pattern.test(header))) {
          headerMatches[field] = colIdx;
          break;
        }
      }
    }
  }

  const source = headerMatches.source !== undefined 
    ? cols.find(c => c.i === headerMatches.source)
    : bestBy(cols, "source", 0.5);
  const reference = headerMatches.reference !== undefined
    ? cols.find(c => c.i === headerMatches.reference)
    : bestBy(cols, "reference", 0.5);

  // Customer name fields
  const customer_name = headerMatches.customer_name !== undefined
    ? cols.find(c => c.i === headerMatches.customer_name)
    : null;
  const customer_firstname = headerMatches.customer_firstname !== undefined
    ? cols.find(c => c.i === headerMatches.customer_firstname)
    : null;
  const customer_lastname = headerMatches.customer_lastname !== undefined
    ? cols.find(c => c.i === headerMatches.customer_lastname)
    : null;
  const title = headerMatches.customer_title !== undefined
    ? cols.find(c => c.i === headerMatches.customer_title)
    : bestBy(cols, "title", 0.5);
  
  // If we have customer_name but not first/last, try to infer from position
  const lastname = customer_lastname || (title ? cols.find(c => c.i === title.i - 1) : null);
  const firstname = customer_firstname || (title ? cols.find(c => c.i === title.i + 1) : null);

  // Dates/Times - prioritize header matches
  const start_timestamp_header = headerMatches.start_timestamp !== undefined
    ? cols.find(c => c.i === headerMatches.start_timestamp)
    : null;
  const end_timestamp_header = headerMatches.end_timestamp !== undefined
    ? cols.find(c => c.i === headerMatches.end_timestamp)
    : null;
  
  const isoTs = start_timestamp_header || bestBy(cols, "isoTs", 0.6);
  const time1 = bestBy(cols, "time", 0.5);
  
  // consider date candidates as those that look like ddmmyy, dd/mm/yy, isoDate, or Excel serial dates but NOT isoTs
  const dateScores = cols.map(c => ({
    c,
    score: ((c.counts.date6||0) + (c.counts.dateDmy||0) + (c.counts.isoDate||0) + (c.counts.excelDate||0)) / total
  })).filter(x => x.score >= 0.5).sort((a,b)=>a.c.i-b.c.i);

  let start_mode: "single"|"split" = "split";
  let end_mode: "single"|"split" = "split";
  let start_date: ColScore | null = null, end_date: ColScore | null = null;
  let start_timestamp: ColScore | null = null, end_timestamp: ColScore | null = null;

  // Use header-matched timestamps if available
  if (start_timestamp_header) {
    start_mode = "single";
    start_timestamp = start_timestamp_header;
  }
  if (end_timestamp_header) {
    end_mode = "single";
    end_timestamp = end_timestamp_header;
  }
  
  // Fall back to pattern matching if headers didn't match
  if (!start_timestamp && isoTs) {
    start_mode = "single";
    start_timestamp = isoTs;
  }
  if (!end_timestamp && isoTs && !end_timestamp_header) {
    // Try to pick a second date for end; else also use single
    if (dateScores.length >= 2) {
      end_mode = "split";
      end_date = dateScores[1]!.c;
    } else {
      end_mode = "single";
      end_timestamp = isoTs;
    }
  } else if (!end_timestamp && dateScores.length >= 2) {
    start_date = dateScores[0].c;
    end_date = dateScores[1].c;
  } else if (!start_timestamp && dateScores.length >= 1) {
    start_date = dateScores[0].c;
  }

  // Use header matches for date/time if available
  if (headerMatches.start_date !== undefined) {
    start_date = cols.find(c => c.i === headerMatches.start_date) || start_date;
  }
  if (headerMatches.end_date !== undefined) {
    end_date = cols.find(c => c.i === headerMatches.end_date) || end_date;
  }

  const end_time = headerMatches.end_time !== undefined
    ? cols.find(c => c.i === headerMatches.end_time)
    : (end_date ? positionAfter(cols, end_date.i - 1, "time", 0.4) : null);
  const start_time = headerMatches.start_time !== undefined
    ? cols.find(c => c.i === headerMatches.start_time)
    : (start_date ? positionAfter(cols, start_date.i - 1, "time", 0.4) : time1);

  const vrm = headerMatches.vehicle_reg !== undefined
    ? cols.find(c => c.i === headerMatches.vehicle_reg)
    : bestBy(cols, "vrm", 0.5);
  const colour = headerMatches.vehicle_colour !== undefined
    ? cols.find(c => c.i === headerMatches.vehicle_colour)
    : bestBy(cols, "colour", 0.5);
  const make = headerMatches.vehicle_make !== undefined
    ? cols.find(c => c.i === headerMatches.vehicle_make)
    : bestBy(cols, "make", 0.5);
  // model: usually immediately after make, or use header match
  const model = headerMatches.vehicle_model !== undefined
    ? cols.find(c => c.i === headerMatches.vehicle_model)
    : (make ? cols.find(c => c.i === make.i + 1) : null);

  const flight = headerMatches.flight_number !== undefined
    ? cols.find(c => c.i === headerMatches.flight_number)
    : bestBy(cols, "flight", 0.5);
  const phone = headerMatches.phone !== undefined
    ? cols.find(c => c.i === headerMatches.phone)
    : bestBy(cols, "phone", 0.5);
  const status = headerMatches.status !== undefined
    ? cols.find(c => c.i === headerMatches.status)
    : bestBy(cols, "status", 0.4);

  // price/money: use header matches first, then fall back to pattern matching
  let price: ColScore | null = null, money: ColScore | null = null;
  if (headerMatches.price !== undefined) {
    price = cols.find(c => c.i === headerMatches.price) || null;
  }
  if (headerMatches.money_received !== undefined) {
    money = cols.find(c => c.i === headerMatches.money_received) || null;
  }
  
  // Fall back to pattern matching if headers didn't match
  if (!price || !money) {
    const decimalCols = cols.filter(c => (c.counts.dec||0)/total >= 0.5);
    if (!price && status) {
      const afterStatus = decimalCols.filter(c => c.i > status.i).sort((a,b)=>a.i-b.i);
      price = price || afterStatus[0] || null;
      money = money || afterStatus[1] || null;
    } else if (!price) {
      price = decimalCols[0] || null;
      money = money || decimalCols[1] || null;
    }
  }

  // notes: try short alnum near VRM (often bay) OR skip
  let notes: ColScore | null = null;
  if (vrm) {
    const candidates = cols.filter(c => c.i === vrm.i + 1 || c.i === vrm.i + 2);
    notes = candidates.find(c => {
      const shortish = c.samples.filter(s => s && s.length <= 4).length;
      return shortish / Math.max(c.samples.length,1) >= 0.5;
    }) || null;
  }

  const out: MapState = {
    source: source ? idxToLetter(source.i) : undefined,
    reference: reference ? idxToLetter(reference.i) : undefined,

    customer_name: customer_name ? idxToLetter(customer_name.i) : undefined,
    customer_lastname: lastname ? idxToLetter(lastname.i) : undefined,
    customer_title: title ? idxToLetter(title.i) : undefined,
    customer_firstname: firstname ? idxToLetter(firstname.i) : undefined,

    start_mode,
    end_mode,
    start_timestamp: start_timestamp ? idxToLetter(start_timestamp.i) : undefined,
    end_timestamp: end_timestamp ? idxToLetter(end_timestamp.i) : undefined,
    start_date: start_date ? idxToLetter(start_date.i) : undefined,
    start_time: start_time ? idxToLetter(start_time.i) : undefined,
    end_date: end_date ? idxToLetter(end_date.i) : undefined,
    end_time: end_time ? idxToLetter(end_time.i) : undefined,

    vehicle_reg: vrm ? idxToLetter(vrm.i) : undefined,
    vehicle_colour: colour ? idxToLetter(colour.i) : undefined,
    vehicle_make: make ? idxToLetter(make.i) : undefined,
    vehicle_model: model ? idxToLetter(model.i) : undefined,

    flight_number: flight ? idxToLetter(flight.i) : undefined,
    phone: phone ? idxToLetter(phone.i) : undefined,
    status: status ? idxToLetter(status.i) : undefined,

    price: price ? idxToLetter(price.i) : undefined,
    money_received: money ? idxToLetter(money.i) : undefined,
    notes: notes ? idxToLetter(notes.i) : undefined,

    timezone: "Europe/London",
  };

  console.log("🎯 Final auto-detect result:", out);
  return out;
}

// ---------- Comparison helpers ----------

export function compareMaps(a: MapState, b: MapState) {
  // Only compare fields that exist in both MapState and ImportProfileMap
  const fields = [
    "source","reference","customer_name","customer_lastname","customer_title","customer_firstname",
    "start_timestamp","start_date","start_time",
    "end_timestamp","end_date","end_time",
    "vehicle_reg","vehicle_colour","vehicle_make","vehicle_model",
    "flight_number","phone","status","price","money_received","notes",
  ] as const;

  const diffs: Array<{field:string; a:any; b:any; equal:boolean}> = [];
  let equalCount = 0, considered = 0;
  for (const f of fields) {
    const va = (a as any)[f];
    const vb = (b as any)[f];
    if (va == null && vb == null) continue;
    const eq = String(va ?? "") === String(vb ?? "");
    considered++;
    if (eq) equalCount++;
    diffs.push({ field: f, a: va, b: vb, equal: eq });
  }
  const score = considered ? Math.round((equalCount/considered)*100) : 0;
  return { diffs, score, considered, equalCount };
}

export function bestMatchAgainstSaved(autoMap: MapState, saved: Array<{id:string; name:string; map:any}>) {
  let best = null as null | { id:string; name:string; score:number; diffs: any[]; map:any };
  for (const m of saved) {
    const { score, diffs } = compareMaps(autoMap, m.map || {});
    if (!best || score > best.score) {
      best = { id: m.id, name: m.name, score, diffs, map: m.map };
    }
  }
  return best;
}

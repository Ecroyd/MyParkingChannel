// src/lib/analytics.ts
export async function fetchDailyOcc({ start, end, tz, vehicle }:{
  start: string; end: string; tz: string; vehicle?: "car" | "van" | "all";
}) {
  const params = new URLSearchParams({ start, end, tz });
  if (vehicle && vehicle !== "all") params.set("vehicle", vehicle);
  const r = await fetch(`/api/analytics/daily-occupancy?${params.toString()}`, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Failed to load occupancy");
  return j.data as { day: string; channel: string; occupancy: number }[];
}

// Helper to group data by day for charting
export function groupDailyOccByDay(rows: { day: string; channel: string; occupancy: number }[]) {
  const byDay = new Map<string, any>();
  for (const r of rows) {
    const key = r.day;
    if (!byDay.has(key)) byDay.set(key, { day: key });
    byDay.get(key)[r.channel] = (byDay.get(key)[r.channel] || 0) + r.occupancy;
  }
  return Array.from(byDay.values()).sort((a,b)=> a.day.localeCompare(b.day));
}

// Helper to calculate y-axis max
export function calculateYMax(dataset: any[]) {
  return Math.max(1, ...dataset.map(d =>
    Object.entries(d).filter(([k])=>k!=="day").reduce((s, [,v])=>s + Number(v), 0)
  ));
}



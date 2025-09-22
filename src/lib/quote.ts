export async function fetchQuote({rate_plan_id,start_date,end_date,channel}:{rate_plan_id:string;start_date:string;end_date:string;channel?:string|null}) {
  const r = await fetch("/api/pricing/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("jwt")||""}` },
    body: JSON.stringify({ rate_plan_id, start_date, end_date, channel: channel ?? null }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j as { lines: any[]; total: { nights:number; total_cents:number; currency:string } };
}



"use client";
import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { format } from "date-fns";

type Tier = { id:string; code:string; label:string; type:'flat'|'multiplier'|'delta'; value:number; color?:string|null; sort_order:number; is_active:boolean };
type Season = { id:string; code:string; name:string; color?:string|null };
type SeasonRange = { id:string; range:[string,string] };
type Rule = {
  id:string;
  rate_plan_id?:string|null;
  date_range?:string|null;
  date_range_start?:string|null;
  date_range_end?:string|null;
  season_id?:string|null;
  tier_id:string;
  weekdays?:number[]|null;
  channel?:string|null;
  min_stay?:number|null;
  max_stay?:number|null;
  priority:number;
  note?:string|null;
  is_active:boolean;          // NEW
  ranges?: [string,string][]; // only when expand=1
};

const api = {
  get: (u:string) => fetch(u, { credentials: 'include' }),
  post: (u:string,b:any)=>fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},credentials: 'include',body:JSON.stringify(b)}),
  put: (u:string,b:any)=>fetch(u,{method:"PUT",headers:{"Content-Type":"application/json"},credentials: 'include',body:JSON.stringify(b)}),
  del: (u:string)=>fetch(u,{method:"DELETE",credentials: 'include'}),
};

// Helper: overlap + scope compare
function rangesOverlap(a:[string,string], b:[string,string]) {
  // dates are yyyy-mm-dd, compare lexicographically (safe)
  const [as,ae]=a, [bs,be]=b;
  // [start,end) overlaps if as < be && bs < ae
  return as < be && bs < ae;
}
function sameScope(a:Rule,b:Rule) {
  const rpA = a.rate_plan_id || null, rpB = b.rate_plan_id || null;
  const chA = a.channel || "",        chB = b.channel || "";
  return rpA === rpB && chA === chB;
}

export default function AdminPricing() {
  const [tab,setTab] = useState<"tiers"|"seasons"|"rules"|"sim">("tiers");
  return (
    <div className="min-h-[calc(100vh-64px)] bg-[hsl(210,16%,98%)] p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="backdrop-blur-xl bg-white/60 rounded-2xl shadow-sm border border-black/5 p-5">
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-sm text-black/60">Tiers, Seasons, Rules, and a Quote Simulator.</p>
          <div className="mt-4 flex gap-2">
            {(["tiers","seasons","rules","sim"] as const).map(k=>(
              <button key={k} onClick={()=>setTab(k)}
                className={`px-3 py-1.5 rounded-xl border ${tab===k?"bg-black text-white":"bg-white/70 hover:bg-white"}`}>
                {k[0].toUpperCase()+k.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {tab==="tiers" && <TiersPane/>}
        {tab==="seasons" && <SeasonsPane/>}
        {tab==="rules" && <RulesPane/>}
        {tab==="sim" && <SimulatorPane/>}
      </div>
    </div>
  );
}

function TiersPane(){
  const [tiers,setTiers]=useState<Tier[]>([]);
  const [draft,setDraft]=useState<Partial<Tier>>({code:"peak",label:"Peak",type:"multiplier",value:1.25,sort_order:20,is_active:true});

  const load=async()=>{ const r=await api.get("/api/pricing/tiers"); const j=await r.json(); if(j.error) toast.error(j.error); else setTiers(j.data); };
  useEffect(()=>{ load(); },[]);

  const save=async()=>{ const r=await api.post("/api/pricing/tiers",draft); const j=await r.json(); if(j.error) toast.error(j.error); else {toast.success("Tier added"); setDraft({}); load();}};

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card title="Add Tier (Variable)">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Code" value={draft.code||""} onChange={v=>setDraft(d=>({...d,code:v}))}/>
          <Input placeholder="Label" value={draft.label||""} onChange={v=>setDraft(d=>({...d,label:v}))}/>
          <Select value={draft.type||"multiplier"} onChange={v=>setDraft(d=>({...d,type:v as any}))} options={[
            ["flat","Flat (pence/day)"],["multiplier","Multiplier (e.g. 1.25)"],["delta","Delta (pence)"]
          ]}/>
          <Input placeholder="Value" value={(draft.value??"").toString()} onChange={v=>setDraft(d=>({...d,value:Number(v)}))}/>
          <Input placeholder="Color #RRGGBB" value={draft.color||""} onChange={v=>setDraft(d=>({...d,color:v}))}/>
          <Input placeholder="Sort" value={(draft.sort_order??100).toString()} onChange={v=>setDraft(d=>({...d,sort_order:Number(v)}))}/>
        </div>
        <div className="mt-3">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={draft.is_active ?? true} onChange={e=>setDraft(d=>({...d,is_active:e.target.checked}))}/>
            <span className="text-sm">Active</span>
          </label>
        </div>
        <div className="mt-4"><Button onClick={save}>Save Tier</Button></div>
      </Card>

      <Card title="Existing">
        <ul className="space-y-2">
          {tiers.map(t=>(
            <li key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/70 border">
              <div className="flex items-center gap-3">
                <span className="block w-4 h-4 rounded" style={{background:t.color||"#ddd"}}/>
                <div>
                  <div className="font-medium">{t.label} <span className="text-xs text-black/50">({t.code})</span></div>
                  <div className="text-xs text-black/60">type {t.type} • value {t.value}</div>
                </div>
              </div>
              <button className="text-sm text-red-600" onClick={async()=>{
                const r=await api.del(`/api/pricing/tiers/${t.id}`); const j=await r.json();
                if(j.error) toast.error(j.error); else { toast.success("Deleted"); load(); }
              }}>Delete</button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function SeasonsPane(){
  const [seasons,setSeasons]=useState<Season[]>([]);
  const [ranges,setRanges]=useState<Record<string,SeasonRange[]>>({});
  const [draft,setDraft]=useState<Partial<Season>>({code:"summer",name:"Summer",color:"#22c55e"});

  const load=async()=>{
    const r=await api.get("/api/pricing/seasons"); const j=await r.json();
    if(j.error) return toast.error(j.error);
    setSeasons(j.data);
    const map:Record<string,SeasonRange[]> = {};
    for(const s of j.data as Season[]){
      const rr=await api.get(`/api/pricing/seasons/${s.id}/ranges`); const jj=await rr.json();
      map[s.id] = jj.data || [];
    }
    setRanges(map);
  };
  useEffect(()=>{ load(); },[]);

  const add=async()=>{
    const r=await api.post("/api/pricing/seasons",draft); const j=await r.json();
    if(j.error) toast.error(j.error); else { toast.success("Season added"); setDraft({}); load(); }
  };

  const addRange=async(seasonId:string,start:string,end:string)=>{
    const r=await api.post(`/api/pricing/seasons/${seasonId}/ranges`,{start,end});
    const j=await r.json(); if(j.error) toast.error(j.error); else { toast.success("Range added"); load(); }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card title="Add Season">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Code" value={draft.code||""} onChange={v=>setDraft(d=>({...d,code:v}))}/>
          <Input placeholder="Name" value={draft.name||""} onChange={v=>setDraft(d=>({...d,name:v}))}/>
          <Input placeholder="Color #RRGGBB" value={draft.color||""} onChange={v=>setDraft(d=>({...d,color:v}))}/>
        </div>
        <div className="mt-4"><Button onClick={add}>Save Season</Button></div>
      </Card>

      <Card title="Seasons & Ranges">
        <div className="space-y-4">
          {seasons.map(s=>(
            <div key={s.id} className="rounded-xl border p-3 bg-white/70">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded" style={{background:s.color||"#ddd"}}/>
                <div className="font-medium">{s.name} <span className="text-xs text-black/50">({s.code})</span></div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 items-end">
                <Input type="date" placeholder="Start" id={`start-${s.id}`}/>
                <Input type="date" placeholder="End" id={`end-${s.id}`}/>
                <Button onClick={()=>{
                  const start=(document.getElementById(`start-${s.id}`) as HTMLInputElement).value;
                  const end=(document.getElementById(`end-${s.id}`) as HTMLInputElement).value;
                  if(!start||!end) return toast.error("Pick start & end");
                  addRange(s.id,start,end);
                }}>Add Range</Button>
              </div>
              <ul className="mt-2 text-sm text-black/70">
                {(ranges[s.id]||[]).map(r=>(
                  <li key={r.id}>{r.range[0]} → {r.range[1]}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function RulesPane(){
  const [tiers,setTiers]=useState<Tier[]>([]);
  const [rules,setRules]=useState<Rule[]>([]);
  const [draft,setDraft]=useState<Partial<Rule>>({priority:100, is_active:true});

  const load=async()=>{
    const t=await (await api.get("/api/pricing/tiers")).json(); if(t.error) toast.error(t.error); else setTiers(t.data);
    const r=await (await api.get("/api/pricing/rules?expand=1&all=1")).json(); if(r.error) toast.error(r.error); else setRules(r.data);
  };
  useEffect(()=>{ load(); },[]);

  async function getCandidateRanges(): Promise<[string,string][]> {
    const out: [string,string][] = [];
    if (draft.date_range_start && draft.date_range_end) {
      out.push([draft.date_range_start, draft.date_range_end]);
    }
    if (!draft.date_range_start && !draft.date_range_end && draft.season_id) {
      const res = await api.get(`/api/pricing/seasons/${draft.season_id}/ranges`);
      const j = await res.json();
      if (j?.data) {
        for (const row of j.data as {range:[string,string]}[]) {
          out.push(row.range);
        }
      }
    }
    return out;
  }

  async function detectConflicts(): Promise<Rule[]> {
    const candRanges = await getCandidateRanges();
    if (candRanges.length === 0) return [];
    const cand: Rule = {
      id:"_new",
      rate_plan_id: draft.rate_plan_id || null,
      channel: draft.channel || "",
      priority: draft.priority ?? 100,
      is_active: draft.is_active ?? true,
      tier_id: draft.tier_id!,
      date_range: undefined, season_id: draft.season_id || null,
      ranges: candRanges
    } as Rule;

    const samePriority = rules.filter(r=>r.is_active && r.priority === cand.priority && sameScope(r,cand));
    const hits: Rule[] = [];
    for (const r of samePriority) {
      for (const ar of candRanges) {
        for (const br of (r.ranges || [])) {
          if (rangesOverlap(ar, br)) { hits.push(r); break; }
        }
      }
    }
    return hits;
  }

  const save=async()=>{
    if (!draft.tier_id) return toast.error("Select a tier");
    const conflicts = await detectConflicts();
    if (conflicts.length>0) {
      const proceed = window.confirm(
        `Conflict: ${conflicts.length} active rule(s) share this scope + priority and overlap dates.\n`+
        `Continue anyway? (Lower priority number wins at runtime)`
      );
      if (!proceed) return;
    }

    const payload:any = {...draft};
    if(draft.date_range_start && draft.date_range_end) {
      payload.date_range = `[${draft.date_range_start},${draft.date_range_end})`;
    }
    // Remove the individual date fields that don't exist in the database
    delete payload.date_range_start;
    delete payload.date_range_end;
    
    console.log('Sending pricing rule:', payload);
    const r=await api.post("/api/pricing/rules",payload); 
    const j=await r.json();
    if(j.error) {
      console.error('Pricing rule error:', j);
      console.error('Error details:', j.details);
      console.error('Rule data sent:', j.ruleData);
      toast.error(j.error);
    } else { 
      toast.success("Rule added"); 
      setDraft({priority:100,is_active:true}); 
      load(); 
    }
  };

  const toggleActive = async (rule: Rule) => {
    const r = await api.put(`/api/pricing/rules/${rule.id}`, { is_active: !rule.is_active });
    const j = await r.json();
    if (j.error) toast.error(j.error); else { toast.success(j.data.is_active ? "Published" : "Draft"); load(); }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card title="Add Rule">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Rate plan id (optional)" value={draft.rate_plan_id||""} onChange={v=>setDraft(d=>({...d,rate_plan_id:v||null}))}/>
          <Select value={draft.tier_id||""} onChange={v=>setDraft(d=>({...d,tier_id:v}))}
            options={[["","Select Tier"],...tiers.map(t=>[t.id,`${t.label} (${t.code})`] as [string, string])]} />
          <Input id="dr-start" type="date" placeholder="Start (optional)" value={draft.date_range_start||""} onChange={v=>setDraft(d=>({...d,date_range_start:v||null}))}/>
          <Input id="dr-end"   type="date" placeholder="End (optional)" value={draft.date_range_end||""} onChange={v=>setDraft(d=>({...d,date_range_end:v||null}))}/>
          <Input placeholder="Season id (optional)" value={draft.season_id||""} onChange={v=>setDraft(d=>({...d,season_id:v||null}))}/>
          <Input placeholder="Channel (optional)" value={draft.channel||""} onChange={v=>setDraft(d=>({...d,channel:v||null}))}/>
          <Input placeholder="Min stay (optional)" value={(draft.min_stay??"").toString()} onChange={v=>setDraft(d=>({...d,min_stay:v?Number(v):null}))}/>
          <Input placeholder="Max stay (optional)" value={(draft.max_stay??"").toString()} onChange={v=>setDraft(d=>({...d,max_stay:v?Number(v):null}))}/>
          <Input placeholder="Priority" value={(draft.priority??100).toString()} onChange={v=>setDraft(d=>({...d,priority:Number(v)}))}/>
          <div className="flex items-center gap-2">
            <input id="is_active" type="checkbox" checked={draft.is_active ?? true} onChange={e=>setDraft(d=>({...d,is_active:e.target.checked}))}/>
            <label htmlFor="is_active" className="text-sm">Published (active)</label>
          </div>
          <Input placeholder="Note" value={draft.note||""} onChange={v=>setDraft(d=>({...d,note:v||null}))}/>
        </div>
        <div className="mt-4"><Button onClick={save}>Save Rule</Button></div>
      </Card>

      <Card title="Existing Rules (active first)">
        <ul className="space-y-2">
          {rules
            .sort((a,b)=> (Number(b.is_active)-Number(a.is_active)) || (a.priority-b.priority))
            .map(r=>(
            <li key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-white/70 border">
              <div className="text-sm">
                <div className="font-medium">priority {r.priority} {r.is_active ? "• Active" : "• Draft"}</div>
                <div className="text-black/70">
                  {r.date_range ? r.date_range : r.season_id ? `season ${r.season_id}` : "—"} → tier {r.tier_id}
                  {r.channel ? ` • channel ${r.channel}` : ""} {r.min_stay ? ` • min ${r.min_stay}`:""} {r.max_stay?` • max ${r.max_stay}`:""}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-xs underline" onClick={()=>toggleActive(r)}>{r.is_active ? "Set Draft" : "Publish"}</button>
                <button className="text-sm text-red-600" onClick={async()=>{
                  const d=await (await api.del(`/api/pricing/rules/${r.id}`)).json();
                  if(d.error) toast.error(d.error); else { toast.success("Deleted"); load(); }
                }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function SimulatorPane(){
  const [ratePlanId,setRatePlanId]=useState("");
  const [start,setStart]=useState("");
  const [end,setEnd]=useState("");
  const [channel,setChannel]=useState("");
  const [result,setResult]=useState<any>(null);

  const quote=async()=>{
    const r=await api.post("/api/pricing/quote",{rate_plan_id:ratePlanId,start_date:start,end_date:end,channel:channel||null});
    const j=await r.json(); if(j.error) toast.error(j.error); else setResult(j);
  };

  return (
    <Card title="Simulator">
      <div className="grid md:grid-cols-5 gap-3">
        <Input placeholder="Rate plan id" value={ratePlanId} onChange={setRatePlanId}/>
        <Input type="date" value={start} onChange={setStart}/>
        <Input type="date" value={end} onChange={setEnd}/>
        <Input placeholder="Channel (optional)" value={channel} onChange={setChannel}/>
        <Button onClick={quote}>Simulate</Button>
      </div>
      {result && (
        <div className="mt-4">
          <div className="text-sm text-black/70">Total: £{((result.total?.total_cents ?? 0)/100).toFixed(2)} • {result.total?.nights} nights</div>
          <div className="mt-2 grid gap-2">
            {result.lines?.map((row:any)=>(
              <div key={row.day} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/70 border">
                <div className="text-sm">{format(new Date(row.day),'EEE dd MMM')}</div>
                <div className="text-sm">Base £{(row.base_price_cents/100).toFixed(2)}</div>
                <div className="text-sm">{row.tier_label ?? '—'} {row.applied_type ? `(${row.applied_type} ${row.tier_value})` : ''}</div>
                <div className="font-medium">£{(row.final_price_cents/100).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

/** Mini UI kit (Tailwind) */
function Card({title,children}:{title:string;children:React.ReactNode}) {
  return <section className="backdrop-blur-xl bg-white/60 rounded-2xl shadow-sm border border-black/5 p-5">
    <h3 className="font-medium mb-3">{title}</h3>{children}
  </section>
}
function Input({type="text",placeholder,value,onChange,id}:{type?:string;placeholder?:string;value?:string;onChange?:(v:string)=>void;id?:string}) {
  return <input id={id} type={type} placeholder={placeholder} value={value||""}
    onChange={e=>onChange?.(e.target.value)}
    className="w-full rounded-xl border bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"/>;
}
function Select({value,onChange,options}:{value:string;onChange:(v:string)=>void;options:[string,string][]}) {
  return <select value={value} onChange={e=>onChange(e.target.value)}
    className="w-full rounded-xl border bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10">
    {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
  </select>
}
function Button({onClick,children}:{onClick:()=>void;children:React.ReactNode}) {
  return <button onClick={onClick} className="inline-flex items-center rounded-xl bg-black text-white px-4 py-2 text-sm hover:bg-black/90">{children}</button>
}


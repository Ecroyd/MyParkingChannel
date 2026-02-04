"use client";
import { useState, useMemo, useEffect } from "react";

interface BookingBannerHeroProps {
  slug: string;
  tenantId?: string;
}

export default function BookingBannerHero({ slug, tenantId }: BookingBannerHeroProps) {
  // Get current datetime in local format for datetime-local input
  const getCurrentDateTimeLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };
  
  const getTomorrowDateTimeLocal = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = String(tomorrow.getHours()).padStart(2, '0');
    const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const today = useMemo(() => getCurrentDateTimeLocal(), []);
  const tomorrow = useMemo(() => getTomorrowDateTimeLocal(), []);

  // 15-minute time options for drop-off/pick-up selectors only (backend accepts any time)
  const timeOptions15 = useMemo(() => {
    const opts: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return opts;
  }, []);

  const roundTimeTo15 = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const totalMins = (h ?? 0) * 60 + (m ?? 0);
    const rounded = Math.round(totalMins / 15) * 15;
    const rh = Math.floor(rounded / 60) % 24;
    const rm = rounded % 60;
    return `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`;
  };

  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(tomorrow);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);

  // Fetch quote when dates change (same as card – price appears once dates are set)
  useEffect(() => {
    if (!tenantId || !start || !end) {
      setCalculatedPrice(null);
      setCalculatingPrice(false);
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate >= endDate) {
      setCalculatedPrice(null);
      setCalculatingPrice(false);
      return;
    }
    setCalculatingPrice(true);
    fetch("/api/pricing/public-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
      }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Quote failed")))
      .then((result) => {
        if (result?.success && result?.data?.amount != null) {
          setCalculatedPrice(result.data.amount);
        } else {
          setCalculatedPrice(null);
        }
      })
      .catch(() => setCalculatedPrice(null))
      .finally(() => setCalculatingPrice(false));
  }, [tenantId, start, end]);

  async function continueToBackend() {
    setError(null); 
    setLoading(true);
    
    // Validate required fields
    if (!phone.trim()) {
      setError("Contact number is required");
      setLoading(false);
      return;
    }
    
    try {
      const qs = new URLSearchParams({ slug, start, end, email, phone, plate }).toString();
      const res = await fetch(`/api/booking/start?${qs}`, { redirect: "follow" });
      // If the API responds with a redirect, the browser will follow automatically (Next route returns 307).
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Unable to continue to booking.");
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full bg-slate-50 border-b">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            continueToBackend();
          }}
          className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end"
        >
          {/* Drop-off Date */}
          <div className="md:col-span-1">
            <label className="block text-sm font-medium mb-1">Drop-off date</label>
            <input 
              type="date" 
              value={start.includes('T') ? start.split('T')[0] : start} 
              onChange={(e) => {
                const time = start.includes('T') ? start.split('T')[1] : '00:00';
                setStart(`${e.target.value}T${time}`);
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {/* Drop-off Time – native <select> with 15-min options only (no input type="time") */}
          <div className="md:col-span-1">
            <label className="block text-sm font-medium mb-1">Drop-off time</label>
            <select
              data-time-select="15min"
              value={roundTimeTo15(start.includes("T") ? start.split("T")[1] ?? "00:00" : "00:00")}
              onChange={(e) => {
                const date = start.includes("T") ? start.split("T")[0] : start;
                setStart(`${date}T${e.target.value}`);
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
            >
              {timeOptions15.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Pick-up Date */}
          <div className="md:col-span-1">
            <label className="block text-sm font-medium mb-1">Pick-up date</label>
            <input 
              type="date" 
              value={end.includes('T') ? end.split('T')[0] : end} 
              onChange={(e) => {
                const time = end.includes('T') ? end.split('T')[1] : '00:00';
                setEnd(`${e.target.value}T${time}`);
              }}
              min={start.includes('T') ? start.split('T')[0] : start}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {/* Pick-up Time – native <select> with 15-min options only (no input type="time") */}
          <div className="md:col-span-1">
            <label className="block text-sm font-medium mb-1">Pick-up time</label>
            <select
              data-time-select="15min"
              value={roundTimeTo15(end.includes("T") ? end.split("T")[1] ?? "00:00" : "00:00")}
              onChange={(e) => {
                const date = end.includes("T") ? end.split("T")[0] : end;
                setEnd(`${date}T${e.target.value}`);
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
            >
              {timeOptions15.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Search button */}
          <div className="md:col-span-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full md:w-auto h-12 rounded-md bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </div>

          {/* Price – shown as soon as dates are set (same as card modal) */}
          {tenantId && (
            <div className="col-span-full md:col-span-6 flex items-center gap-2 min-h-[2.5rem]">
              {calculatingPrice && (
                <span className="text-sm text-slate-600">Calculating price…</span>
              )}
              {!calculatingPrice && calculatedPrice != null && calculatedPrice > 0 && (
                <span className="text-sm font-semibold text-slate-900">
                  Total: £{calculatedPrice.toFixed(2)}
                </span>
              )}
            </div>
          )}

          {/* Error message - spans full width */}
          {error && (
            <div className="col-span-full text-red-600 text-sm mt-2">
              {error}
            </div>
          )}
        </form>

        {/* Additional fields below in a second row on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 gap-2 mt-4 md:grid-cols-3 md:gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contact number *</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 ${
                !phone.trim() 
                  ? 'border-red-300 focus:ring-red-500' 
                  : 'border-slate-300 focus:ring-slate-400'
              }`}
              placeholder="+44 1234 567890" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Vehicle plate</label>
            <input 
              value={plate} 
              onChange={(e) => setPlate(e.target.value)} 
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

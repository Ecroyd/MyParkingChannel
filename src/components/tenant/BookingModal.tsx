"use client";
import { useState, useMemo } from "react";

export default function BookingModal({ slug }: { slug: string }) {
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

  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(tomorrow);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueToBackend() {
    setError(null); setLoading(true);
    
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
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Arrival Date & Time</label>
          <input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} step="900" className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Departure Date & Time</label>
          <input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} min={start} step="900" className="w-full rounded-xl border border-slate-300 px-3 py-2" />
          <p className="text-xs text-gray-500 italic mt-1">
            If unsure, please use your return flight time
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Contact number *</label>
          <input 
            type="tel" 
            value={phone} 
            onChange={e=>setPhone(e.target.value)} 
            className={`w-full rounded-xl border px-3 py-2 ${!phone.trim() ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-slate-500'}`}
            placeholder="+44 1234 567890" 
            required 
          />
          {!phone.trim() && <p className="text-red-600 text-xs mt-1">Contact number is required</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Vehicle plate</label>
          <input value={plate} onChange={e=>setPlate(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex gap-3">
        <button onClick={continueToBackend} disabled={loading}
          className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-3 rounded-2xl shadow">
          {loading ? "Continuing…" : "Continue to booking"}
        </button>
      </div>
    </div>
  );
}

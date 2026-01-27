"use client";
import { useState, useMemo, useEffect } from "react";
import { X } from "lucide-react";

interface BookingModalBannerProps {
  slug: string;
  open: boolean;
  onClose: () => void;
}

export default function BookingModalBanner({ slug, open, onClose }: BookingModalBannerProps) {
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

  // Handle ESC key to close
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

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

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="mx-auto mt-6 w-[calc(100%-2rem)] max-w-7xl rounded-lg bg-white shadow-xl">
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-2 z-10 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 p-1"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              continueToBackend();
            }}
            className="grid grid-cols-1 gap-2 p-3 md:grid-cols-5 md:gap-3 md:p-4 md:items-end"
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

            {/* Drop-off Time */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium mb-1">Drop-off time</label>
              <input 
                type="time" 
                value={start.includes('T') ? start.split('T')[1] : '00:00'} 
                onChange={(e) => {
                  const date = start.includes('T') ? start.split('T')[0] : start;
                  setStart(`${date}T${e.target.value}`);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
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

            {/* Pick-up Time */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium mb-1">Pick-up time</label>
              <input 
                type="time" 
                value={end.includes('T') ? end.split('T')[1] : '00:00'} 
                onChange={(e) => {
                  const date = end.includes('T') ? end.split('T')[0] : end;
                  setEnd(`${date}T${e.target.value}`);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            {/* Search button */}
            <div className="md:col-span-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>

            {/* Error message - spans full width */}
            {error && (
              <div className="col-span-full text-red-600 text-sm mt-2">
                {error}
              </div>
            )}
          </form>

          {/* Additional fields below in a second row on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 gap-2 px-3 pb-3 md:grid-cols-3 md:gap-3 md:px-4 md:pb-4">
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
    </div>
  );
}

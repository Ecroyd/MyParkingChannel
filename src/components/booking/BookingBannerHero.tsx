"use client";

import { useMemo, useState } from "react";
import {
  getSessionId,
  trackFunnelEvent,
} from "@/lib/website-performance/clientTracker";

interface BookingBannerHeroProps {
  slug: string;
  tenantId?: string;
  cookieConsentMode?: string | null;
}

type BannerStep = "search" | "price" | "details";

function durationLabel(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const ms = endDate.getTime() - startDate.getTime();
  if (ms <= 0) return "";
  const hours = ms / (1000 * 60 * 60);
  const days = Math.max(1, Math.ceil(hours / 24));
  return days === 1 ? "1 day" : `${days} days`;
}

export default function BookingBannerHero({
  slug,
  tenantId,
  cookieConsentMode,
}: BookingBannerHeroProps) {
  const getCurrentDateTimeLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const getTomorrowDateTimeLocal = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");
    const hours = String(tomorrow.getHours()).padStart(2, "0");
    const minutes = String(tomorrow.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const today = useMemo(() => getCurrentDateTimeLocal(), []);
  const tomorrow = useMemo(() => getTomorrowDateTimeLocal(), []);

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
  const [step, setStep] = useState<BannerStep>("search");

  async function fetchPrice(): Promise<number | null> {
    if (!tenantId || !start || !end) return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate >= endDate) {
      setError("Return must be after arrival.");
      return null;
    }

    trackFunnelEvent("availability_search", {
      tenantSlug: slug,
      cookieConsentMode,
      allowRepeat: true,
      dedupeKey: `${getSessionId()}:availability_search:${startDate.toISOString()}:${endDate.toISOString()}`,
    });

    setCalculatingPrice(true);
    setError(null);
    try {
      const res = await fetch("/api/pricing/public-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          startAt: startDate.toISOString(),
          endAt: endDate.toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Quote failed");
      const result = await res.json();
      if (result?.success && result?.data?.amount != null) {
        const amount = result.data.amount as number;
        setCalculatedPrice(amount);
        trackFunnelEvent("availability_result", {
          tenantSlug: slug,
          cookieConsentMode,
          allowRepeat: true,
          dedupeKey: `${getSessionId()}:availability_result:${startDate.toISOString()}:${endDate.toISOString()}:${amount}`,
          bookingValueCents: Math.round(amount * 100),
          bookingCurrency: result.data.currency || "GBP",
        });
        return amount;
      }
      setCalculatedPrice(null);
      return null;
    } catch {
      setCalculatedPrice(null);
      setError("Unable to calculate price. Please try again.");
      return null;
    } finally {
      setCalculatingPrice(false);
    }
  }

  async function handleGetPrice() {
    const amount = await fetchPrice();
    if (amount && amount > 0) setStep("price");
  }

  function goToDetails() {
    trackFunnelEvent("booking_started", {
      tenantSlug: slug,
      cookieConsentMode,
      bookingValueCents:
        calculatedPrice != null ? Math.round(calculatedPrice * 100) : undefined,
    });
    trackFunnelEvent("customer_details_started", {
      tenantSlug: slug,
      cookieConsentMode,
    });
    setStep("details");
  }

  async function continueToBackend() {
    setError(null);
    setLoading(true);

    // Backend redirect only requires slug/start/end; phone was a UI rule.
    // Keep phone required at the details step for ops follow-up, not for pricing.
    if (!phone.trim()) {
      setError("Contact number is required");
      setLoading(false);
      return;
    }

    try {
      const qs = new URLSearchParams({ slug, start, end, email, phone, plate }).toString();
      const res = await fetch(`/api/booking/start?${qs}`, { redirect: "follow" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Unable to continue to booking.");
      }
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const duration = durationLabel(start, end);
  const stepIndex = step === "search" ? 1 : step === "price" ? 2 : 3;

  return (
    <div className="w-full bg-slate-50 border-b">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Step {stepIndex} of 3 —{" "}
          {step === "search" ? "Check price" : step === "price" ? "Your price" : "Your details"}
        </p>

        {(step === "search" || step === "price") && (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium mb-1">Arrival date</label>
              <input
                type="date"
                value={start.includes("T") ? start.split("T")[0] : start}
                disabled={step === "price"}
                onChange={(e) => {
                  const time = start.includes("T") ? start.split("T")[1] : "00:00";
                  setStart(`${e.target.value}T${time}`);
                  setStep("search");
                  setCalculatedPrice(null);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium mb-1">Arrival time</label>
              <select
                data-time-select="15min"
                disabled={step === "price"}
                value={roundTimeTo15(start.includes("T") ? start.split("T")[1] ?? "00:00" : "00:00")}
                onChange={(e) => {
                  const date = start.includes("T") ? start.split("T")[0] : start;
                  setStart(`${date}T${e.target.value}`);
                  setStep("search");
                  setCalculatedPrice(null);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white disabled:bg-slate-100"
              >
                {timeOptions15.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium mb-1">Return date</label>
              <input
                type="date"
                value={end.includes("T") ? end.split("T")[0] : end}
                disabled={step === "price"}
                onChange={(e) => {
                  const time = end.includes("T") ? end.split("T")[1] : "00:00";
                  setEnd(`${e.target.value}T${time}`);
                  setStep("search");
                  setCalculatedPrice(null);
                }}
                min={start.includes("T") ? start.split("T")[0] : start}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium mb-1">Return time</label>
              <select
                data-time-select="15min"
                disabled={step === "price"}
                value={roundTimeTo15(end.includes("T") ? end.split("T")[1] ?? "00:00" : "00:00")}
                onChange={(e) => {
                  const date = end.includes("T") ? end.split("T")[0] : end;
                  setEnd(`${date}T${e.target.value}`);
                  setStep("search");
                  setCalculatedPrice(null);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white disabled:bg-slate-100"
              >
                {timeOptions15.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              {step === "search" ? (
                <button
                  type="button"
                  disabled={calculatingPrice}
                  onClick={() => void handleGetPrice()}
                  className="w-full md:w-auto h-12 rounded-md bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {calculatingPrice ? "Checking…" : "Get my price"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={goToDetails}
                    className="w-full md:w-auto h-12 rounded-md bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700"
                  >
                    Continue to booking
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("search")}
                    className="w-full md:w-auto h-12 rounded-md border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    Change dates
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {step === "price" && calculatedPrice != null && calculatedPrice > 0 ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-4">
            <p className="text-sm font-medium text-slate-600">Parking price</p>
            <p className="text-3xl font-semibold text-slate-900">£{calculatedPrice.toFixed(2)}</p>
            {duration ? <p className="mt-1 text-sm text-slate-600">Duration: {duration}</p> : null}
          </div>
        ) : null}

        {step === "details" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void continueToBackend();
            }}
            className="space-y-4"
          >
            {calculatedPrice != null && calculatedPrice > 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <p className="text-sm text-slate-600">
                  Price <span className="font-semibold text-slate-900">£{calculatedPrice.toFixed(2)}</span>
                  {duration ? ` · ${duration}` : ""}
                </p>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                  className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
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
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={loading}
                className="h-12 rounded-md bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "Continuing…" : "Continue"}
              </button>
              <button
                type="button"
                onClick={() => setStep("price")}
                className="h-12 rounded-md border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
              >
                Back to price
              </button>
            </div>
          </form>
        ) : null}

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </div>
    </div>
  );
}

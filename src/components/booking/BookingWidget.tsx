"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { redirectToCheckout } from "@/lib/utils/redirect";
import {
  getAnonymousId,
  getSessionId,
  trackFunnelEvent,
} from "@/lib/website-performance/clientTracker";

interface BookingWidgetProps {
  tenantSlug: string;
  tenantId: string;
  cookieConsentMode?: string | null;
}

interface PricingInfo {
  dailyRate: number;
  currency: string;
}

/** STEP 1 search → STEP 2 price → STEP 3 details → STEP 4 payment (Stripe redirect) */
type BookingStep = "search" | "price" | "details" | "payment";

function durationLabel(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "";
  const start = new Date(startDate);
  const end = new Date(endDate);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return "";
  const hours = ms / (1000 * 60 * 60);
  const days = Math.max(1, Math.ceil(hours / 24));
  return days === 1 ? "1 day" : `${days} days`;
}

function formatDisplayDate(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BookingWidget({
  tenantSlug,
  tenantId,
  cookieConsentMode,
}: BookingWidgetProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [step, setStep] = useState<BookingStep>("search");

  const [errors, setErrors] = useState<{
    startDate?: string;
    endDate?: string;
    customerName?: string;
    customerEmail?: string;
    vehicleReg?: string;
    general?: string;
  }>({});

  const loadPricing = useCallback(async () => {
    try {
      const response = await fetch(`/api/pricing/public?tenantId=${tenantId}`);
      if (!response.ok) {
        setPricing({ dailyRate: 7.0, currency: "GBP" });
        return;
      }
      const result = await response.json();
      if (result.success && result.data) {
        setPricing(result.data);
      } else {
        setPricing({ dailyRate: 7.0, currency: "GBP" });
      }
    } catch (error) {
      console.error("Error loading pricing:", error);
      setPricing({ dailyRate: 7.0, currency: "GBP" });
    }
  }, [tenantId]);

  useEffect(() => {
    void loadPricing();
  }, [loadPricing]);

  const resetQuoteIfNeeded = () => {
    if (calculatedPrice != null || step !== "search") {
      setCalculatedPrice(null);
      setStep("search");
      setErrors((prev) => ({ ...prev, general: undefined }));
    }
  };

  const clearError = (field: keyof typeof errors) => {
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateField = (field: string, value: string): string | undefined => {
    switch (field) {
      case "customerName":
        if (!value.trim()) return "Full name is required";
        if (value.trim().length < 2) return "Name must be at least 2 characters";
        return undefined;
      case "customerEmail": {
        if (!value.trim()) return "Email address is required";
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return "Please enter a valid email address";
        return undefined;
      }
      case "vehicleReg":
        if (!value.trim()) return "Vehicle registration is required";
        if (value.trim().length < 2) return "Registration must be at least 2 characters";
        return undefined;
      case "startDate": {
        if (!value) return "Drop-off date and time is required";
        const start = new Date(value);
        if (start < new Date()) return "Drop-off cannot be in the past";
        return undefined;
      }
      case "endDate":
        if (!value) return "Pick-up date and time is required";
        if (startDate && value <= startDate) return "Pick-up must be after drop-off";
        return undefined;
      default:
        return undefined;
    }
  };

  const calculatePrice = async (): Promise<number | null> => {
    if (!startDate || !endDate) {
      setCalculatedPrice(null);
      return null;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      setCalculatedPrice(null);
      return null;
    }

    trackFunnelEvent("availability_search", {
      tenantSlug,
      cookieConsentMode,
      allowRepeat: true,
      dedupeKey: `${getSessionId()}:availability_search:${start.toISOString()}:${end.toISOString()}`,
      meta: { step: "search" },
    });

    setCalculatingPrice(true);
    try {
      const response = await fetch("/api/pricing/public-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const amount = result.data.amount as number;
          setCalculatedPrice(amount);
          if (result.data.currency) {
            setPricing({
              dailyRate: pricing?.dailyRate || 7.0,
              currency: result.data.currency,
            });
          }
          trackFunnelEvent("availability_result", {
            tenantSlug,
            cookieConsentMode,
            allowRepeat: true,
            dedupeKey: `${getSessionId()}:availability_result:${start.toISOString()}:${end.toISOString()}:${amount}`,
            bookingValueCents: Math.round(amount * 100),
            bookingCurrency: result.data.currency || "GBP",
            meta: { available: true },
          });
          setCalculatingPrice(false);
          return amount;
        }
      } else {
        const errorText = await response.text();
        console.error(`[BookingWidget] Quote API error (${response.status}):`, errorText);
      }

      setCalculatedPrice(null);
      setCalculatingPrice(false);
      setErrors({ general: "Unable to calculate price. Please try again." });
      return null;
    } catch (error) {
      console.error("[BookingWidget] Error calculating quote:", error);
      setCalculatedPrice(null);
      setCalculatingPrice(false);
      setErrors({ general: "Unable to calculate price. Please try again." });
      return null;
    }
  };

  const handleCheckAvailability = async () => {
    setErrors({});
    const startErr = validateField("startDate", startDate);
    const endErr = validateField("endDate", endDate);
    if (startErr || endErr) {
      setErrors({ startDate: startErr, endDate: endErr });
      return;
    }
    const amount = await calculatePrice();
    if (amount && amount > 0) {
      setStep("price");
    }
  };

  const goToDetails = () => {
    trackFunnelEvent("booking_started", {
      tenantSlug,
      cookieConsentMode,
      bookingValueCents:
        calculatedPrice != null ? Math.round(calculatedPrice * 100) : undefined,
      bookingCurrency: pricing?.currency || "GBP",
    });
    trackFunnelEvent("customer_details_started", {
      tenantSlug,
      cookieConsentMode,
    });
    setStep("details");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: typeof errors = {};
    let hasErrors = false;

    const startDateError = validateField("startDate", startDate);
    if (startDateError) {
      newErrors.startDate = startDateError;
      hasErrors = true;
    }
    const endDateError = validateField("endDate", endDate);
    if (endDateError) {
      newErrors.endDate = endDateError;
      hasErrors = true;
    }
    const customerNameError = validateField("customerName", customerName);
    if (customerNameError) {
      newErrors.customerName = customerNameError;
      hasErrors = true;
    }
    const customerEmailError = validateField("customerEmail", customerEmail);
    if (customerEmailError) {
      newErrors.customerEmail = customerEmailError;
      hasErrors = true;
    }
    const vehicleRegError = validateField("vehicleReg", vehicleReg);
    if (vehicleRegError) {
      newErrors.vehicleReg = vehicleRegError;
      hasErrors = true;
    }

    if (hasErrors) {
      setErrors(newErrors);
      toast({
        title: "Please fix the errors below",
        description: "Some fields need to be corrected before you can continue.",
        variant: "destructive",
      });
      return;
    }

    if (!calculatedPrice) {
      setErrors({ general: "Please check availability for your dates first." });
      return;
    }

    setLoading(true);
    setStep("payment");
    try {
      const paymentResponse = await fetch("/api/payments/public-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          start_at: new Date(startDate).toISOString(),
          end_at: new Date(endDate).toISOString(),
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          plate: vehicleReg.toUpperCase(),
          flight_number: flightNumber || null,
          application_fee_cents: Math.round(calculatedPrice * 0.1 * 100),
          anonymous_id: getAnonymousId(),
          session_id: getSessionId(),
        }),
      });

      const paymentResult = await paymentResponse.json();

      if (!paymentResponse.ok) {
        setStep("details");
        let errorMessage = "Unable to process payment. Please try again.";
        const fieldErrors: typeof errors = {};

        if (paymentResult.error) {
          if (paymentResult.field_errors) {
            if (paymentResult.field_errors.customer_name) {
              fieldErrors.customerName = paymentResult.field_errors.customer_name;
            }
            if (paymentResult.field_errors.customer_email) {
              fieldErrors.customerEmail = paymentResult.field_errors.customer_email;
            }
            if (paymentResult.field_errors.plate) {
              fieldErrors.vehicleReg = paymentResult.field_errors.plate;
            }
            if (paymentResult.field_errors.start_at) {
              fieldErrors.startDate = paymentResult.field_errors.start_at;
            }
            if (paymentResult.field_errors.end_at) {
              fieldErrors.endDate = paymentResult.field_errors.end_at;
            }
            if (Object.keys(fieldErrors).length > 0) {
              setErrors(fieldErrors);
              toast({
                title: "Please fix the errors below",
                description: "Some fields need to be corrected before you can continue.",
                variant: "destructive",
              });
              return;
            }
          }

          if (paymentResult.error.includes("email")) {
            fieldErrors.customerEmail = "Please check your email address";
            errorMessage = "There's an issue with your email address. Please check and try again.";
          } else if (
            paymentResult.error.includes("tenant") ||
            paymentResult.error.includes("Stripe not connected")
          ) {
            errorMessage = "This parking service is temporarily unavailable. Please try again later.";
          } else if (paymentResult.error.includes("Invalid amount")) {
            errorMessage = "There's an issue with the booking amount. Please refresh and try again.";
          } else if (paymentResult.details && Array.isArray(paymentResult.details)) {
            errorMessage = paymentResult.details.join(". ");
          } else {
            errorMessage = paymentResult.error;
          }
        }

        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
        } else {
          setErrors({ general: errorMessage });
        }

        toast({
          title: "Payment Failed",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }

      if (paymentResult.url) {
        redirectToCheckout(paymentResult.url);
      } else {
        setStep("details");
        toast({
          title: "Payment Error",
          description: "No payment URL received. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Booking error:", error);
      setStep("details");
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getCurrentDateTimeLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const minDateTime = getCurrentDateTimeLocal();
  const split = (value: string) => {
    const [date = "", time = ""] = (value || "").split("T");
    return { date, time };
  };
  const startParts = split(startDate);
  const endParts = split(endDate);
  const join = (date: string, time: string) => {
    if (!date) return "";
    return `${date}T${time || "12:00"}`;
  };

  const fieldClass = (hasError?: string) =>
    `h-12 text-base ${hasError ? "border-red-500 focus-visible:ring-red-500" : ""}`;

  const duration = durationLabel(startDate, endDate);
  const stepIndex =
    step === "search" ? 1 : step === "price" ? 2 : step === "details" ? 3 : 4;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
      <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Step {stepIndex} of 4
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
          {step === "search" && "Check price"}
          {step === "price" && "Your price"}
          {step === "details" && "Your details"}
          {step === "payment" && "Payment"}
        </h2>
        <p className="mt-1.5 text-[15px] leading-snug text-slate-500">
          {step === "search" && "Choose arrival and return to see your parking price."}
          {step === "price" && "Review the quote, then continue to book."}
          {step === "details" && "Tell us how to reach you and your vehicle details."}
          {step === "payment" && "Redirecting you to secure payment…"}
        </p>
      </div>

      <div className="px-6 py-6 sm:px-7 sm:py-7">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {(step === "search" || step === "price") && (
            <fieldset className="space-y-4" disabled={step === "price"}>
              <legend className="sr-only">Drop-off and pick-up</legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="arrivalDate" className="text-[15px] font-medium text-slate-800">
                    Arrival date
                  </Label>
                  <Input
                    id="arrivalDate"
                    type="date"
                    value={startParts.date}
                    onChange={(e) => {
                      resetQuoteIfNeeded();
                      setStartDate(join(e.target.value, startParts.time || "10:00"));
                      clearError("startDate");
                    }}
                    min={minDateTime.slice(0, 10)}
                    required
                    className={fieldClass(errors.startDate)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arrivalTime" className="text-[15px] font-medium text-slate-800">
                    Arrival time
                  </Label>
                  <Input
                    id="arrivalTime"
                    type="time"
                    value={startParts.time}
                    onChange={(e) => {
                      resetQuoteIfNeeded();
                      setStartDate(join(startParts.date, e.target.value));
                      clearError("startDate");
                    }}
                    required
                    className={fieldClass(errors.startDate)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="returnDate" className="text-[15px] font-medium text-slate-800">
                    Return date
                  </Label>
                  <Input
                    id="returnDate"
                    type="date"
                    value={endParts.date}
                    onChange={(e) => {
                      resetQuoteIfNeeded();
                      setEndDate(join(e.target.value, endParts.time || "18:00"));
                      clearError("endDate");
                    }}
                    min={startParts.date || minDateTime.slice(0, 10)}
                    required
                    className={fieldClass(errors.endDate)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="returnTime" className="text-[15px] font-medium text-slate-800">
                    Return time
                  </Label>
                  <Input
                    id="returnTime"
                    type="time"
                    value={endParts.time}
                    onChange={(e) => {
                      resetQuoteIfNeeded();
                      setEndDate(join(endParts.date, e.target.value));
                      clearError("endDate");
                    }}
                    required
                    className={fieldClass(errors.endDate)}
                  />
                </div>
              </div>
              {(errors.startDate || errors.endDate) && (
                <p className="text-sm text-red-600" role="alert">
                  {errors.startDate || errors.endDate}
                </p>
              )}
            </fieldset>
          )}

          {calculatingPrice ? (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-[15px] text-slate-700"
              aria-live="polite"
            >
              Checking price…
            </div>
          ) : null}

          {(step === "price" || step === "details" || step === "payment") &&
          calculatedPrice &&
          calculatedPrice > 0 ? (
            <div
              className="rounded-xl border border-slate-200 px-5 py-5"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--tenant-secondary, #65a30d) 10%, white)",
                borderColor:
                  "color-mix(in srgb, var(--tenant-secondary, #65a30d) 35%, #e2e8f0)",
              }}
              aria-live="polite"
            >
              <p className="text-[15px] font-medium text-slate-600">Parking price</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-900">
                £{calculatedPrice.toFixed(2)}
              </p>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {duration ? <p>Duration: {duration}</p> : null}
                <p>Arrival: {formatDisplayDate(startDate)}</p>
                <p>Return: {formatDisplayDate(endDate)}</p>
              </div>
            </div>
          ) : null}

          {errors.general ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
              <p className="text-sm text-red-700">{errors.general}</p>
            </div>
          ) : null}

          {step === "search" ? (
            <>
              <Button
                type="button"
                className="h-12 w-full text-base font-semibold"
                style={{
                  backgroundColor: "var(--tenant-action, #1e40af)",
                  color: "var(--tenant-action-fg, #ffffff)",
                }}
                disabled={calculatingPrice || !startDate || !endDate}
                onClick={() => void handleCheckAvailability()}
              >
                {calculatingPrice ? "Checking…" : "Get my price"}
              </Button>
              <p className="text-center text-sm text-slate-500">
                No contact details needed to see your price.
              </p>
            </>
          ) : null}

          {step === "price" ? (
            <>
              <Button
                type="button"
                className="h-12 w-full text-base font-semibold"
                style={{
                  backgroundColor: "var(--tenant-action, #1e40af)",
                  color: "var(--tenant-action-fg, #ffffff)",
                }}
                onClick={goToDetails}
              >
                Continue to booking
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900"
                onClick={() => {
                  setStep("search");
                }}
              >
                Change dates
              </button>
            </>
          ) : null}

          {step === "details" || step === "payment" ? (
            <fieldset className="space-y-4 border-t border-slate-100 pt-5" disabled={step === "payment"}>
              <legend className="text-base font-semibold text-slate-900">Customer details</legend>

              <div className="space-y-2">
                <Label htmlFor="customerName" className="text-[15px]">
                  Full name *
                </Label>
                <Input
                  id="customerName"
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    clearError("customerName");
                  }}
                  autoComplete="name"
                  required
                  className={fieldClass(errors.customerName)}
                />
                {errors.customerName ? (
                  <p className="text-sm text-red-600">{errors.customerName}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerEmail" className="text-[15px]">
                  Email address *
                </Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => {
                    setCustomerEmail(e.target.value);
                    clearError("customerEmail");
                  }}
                  autoComplete="email"
                  required
                  className={fieldClass(errors.customerEmail)}
                />
                {errors.customerEmail ? (
                  <p className="text-sm text-red-600">{errors.customerEmail}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerPhone" className="text-[15px]">
                  Contact telephone
                </Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  autoComplete="tel"
                  className="h-12 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicleReg" className="text-[15px]">
                  Vehicle registration *
                </Label>
                <Input
                  id="vehicleReg"
                  type="text"
                  value={vehicleReg}
                  onChange={(e) => {
                    setVehicleReg(e.target.value.toUpperCase());
                    clearError("vehicleReg");
                  }}
                  required
                  className={`h-12 text-base uppercase ${errors.vehicleReg ? "border-red-500" : ""}`}
                />
                {errors.vehicleReg ? (
                  <p className="text-sm text-red-600">{errors.vehicleReg}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="flightNumber" className="text-[15px]">
                  Flight number (optional)
                </Label>
                <Input
                  id="flightNumber"
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                  className="h-12 text-base uppercase"
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !calculatedPrice || step === "payment"}
                className="h-12 w-full text-base font-semibold"
                style={{
                  backgroundColor: "var(--tenant-action, #1e40af)",
                  color: "var(--tenant-action-fg, #ffffff)",
                }}
              >
                {loading || step === "payment" ? "Going to payment…" : "Continue to payment"}
              </Button>

              <button
                type="button"
                className="w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900"
                onClick={() => setStep("price")}
                disabled={step === "payment"}
              >
                Back to price
              </button>
            </fieldset>
          ) : null}
        </form>
      </div>
    </div>
  );
}

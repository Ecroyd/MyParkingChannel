// src/components/bookings/ExtendBookingSheet.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { addDays, formatISO } from "date-fns";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

type Props = {
  tenantId: string;
  booking: {
    id: string;
    end_at: string;          // ISO
    flight_number?: string | null;
    reference?: string | null;
  };
  publishableKey: string;    // from tenant_secrets (expose via server component)
  onExtended: () => void;    // reload/refresh list + close
};

function InnerExtendForm({ tenantId, booking, onExtended }: Omit<Props, "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const [quickDays, setQuickDays] = useState<number>(1);
  const [newEndAt, setNewEndAt] = useState<string>(() => formatISO(addDays(new Date(booking.end_at), 1)));
  const [overrideFlight, setOverrideFlight] = useState<string>(booking.flight_number ?? "");
  const [overridePickup, setOverridePickup] = useState<string>(""); // ISO datetime-local
  const [quoteCents, setQuoteCents] = useState<number>(0);
  const [amountCents, setAmountCents] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = addDays(new Date(booking.end_at), quickDays);
    const iso = formatISO(next);
    setNewEndAt(iso);
  }, [quickDays, booking.end_at]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/pricing/quote-extension", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            bookingEndAtISO: booking.end_at,
            newEndAtISO: newEndAt,
          }),
        });
        const json = await res.json();
        if (mounted && json.ok) {
          setQuoteCents(json.quoteCents);
          setAmountCents((prev) => (prev && prev > 0 ? prev : json.quoteCents));
        }
      } catch {
        toast.error("Failed to quote extension.");
      }
    })();
    return () => { mounted = false; };
  }, [newEndAt, tenantId, booking.end_at]);

  const amountDisplay = useMemo(() => (amountCents/100).toFixed(2), [amountCents]);

  const handlePayAndExtend = async () => {
    setBusy(true);
    try {
      // In development without Stripe, simulate the extension
      if (!stripe || !elements) {
        // Simulate extension without payment
        const res = await fetch(`/api/bookings/${booking.id}/extend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            newEndAtISO: newEndAt,
            overrideFlight: overrideFlight || null,
            overridePickupAtISO: overridePickup || null,
            amountOverrideCents: amountCents,
            paymentMethodId: "dev_test_payment_method", // Mock payment method for dev
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Extension failed");

        toast.success("Extension applied (dev mode - no payment required).");
        onExtended();
        return;
      }

      // Normal Stripe flow
      const pm = await stripe.createPaymentMethod({
        type: "card",
        card: elements.getElement(CardElement)!,
      });
      if (pm.error) {
        toast.error(pm.error.message ?? "Card error");
        setBusy(false);
        return;
      }

      const res = await fetch(`/api/bookings/${booking.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          newEndAtISO: newEndAt,
          overrideFlight: overrideFlight || null,
          overridePickupAtISO: overridePickup || null,
          amountOverrideCents: amountCents,
          paymentMethodId: pm.paymentMethod?.id,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Extension failed");

      if (json.intentStatus === "succeeded") {
        toast.success("Extension paid and applied.");
        onExtended();
      } else {
        toast(`Payment status: ${json.intentStatus}`);
      }
    } catch (e:any) {
      toast.error(e.message ?? "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick pick days */}
      <div>
        <Label className="text-sm font-medium mb-3 block">Quick Extend</Label>
        <div className="grid grid-cols-7 gap-2">
          {[1,2,3,4,5,6,7].map(d => (
            <Button
              key={d}
              variant={quickDays === d ? "default" : "outline"}
              size="sm"
              onClick={() => setQuickDays(d)}
              className="text-xs"
            >
              +{d} day{d>1?"s":""}
            </Button>
          ))}
        </div>
      </div>

      {/* New end date/time */}
      <div>
        <Label htmlFor="new-end" className="text-sm font-medium">New end (date/time)</Label>
        <Input
          id="new-end"
          type="datetime-local"
          className="mt-1"
          value={new Date(newEndAt).toISOString().slice(0,16)}
          onChange={(e) => {
            const iso = new Date(e.target.value).toISOString();
            setNewEndAt(iso);
          }}
        />
      </div>

      {/* Override fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="override-flight" className="text-sm font-medium">Override flight #</Label>
          <Input
            id="override-flight"
            className="mt-1"
            value={overrideFlight}
            onChange={e => setOverrideFlight(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="override-pickup" className="text-sm font-medium">Pickup time (optional)</Label>
          <Input
            id="override-pickup"
            type="datetime-local"
            className="mt-1"
            value={overridePickup ? new Date(overridePickup).toISOString().slice(0,16) : ""}
            onChange={(e) => setOverridePickup(e.target.value ? new Date(e.target.value).toISOString() : "")}
          />
        </div>
      </div>

      {/* Pricing */}
      <Card className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Quoted total</span>
            <span className="font-semibold">£{(quoteCents/100).toFixed(2)}</span>
          </div>
          <div>
            <Label htmlFor="charge-amount" className="text-sm font-medium">Charge amount (editable)</Label>
            <Input
              id="charge-amount"
              className="mt-1"
              value={amountDisplay}
              onChange={(e) => {
                const v = Math.round(parseFloat(e.target.value||"0") * 100);
                setAmountCents(Number.isFinite(v) ? v : 0);
              }}
            />
          </div>
        </div>
      </Card>

      {/* Stripe Card Element - only show if Stripe is configured */}
      {stripe && elements && (
        <div>
          <Label className="text-sm font-medium mb-2 block">Payment Card</Label>
          <Card className="p-4">
            <CardElement 
              options={{ 
                hidePostalCode: true,
                style: {
                  base: {
                    fontSize: '16px',
                    color: '#424770',
                    '::placeholder': {
                      color: '#aab7c4',
                    },
                  },
                },
              }} 
            />
          </Card>
        </div>
      )}

      {/* Development mode notice */}
      {!stripe && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Development Mode:</strong> No payment required. Extension will be applied directly.
          </p>
        </div>
      )}

      {/* Submit button */}
      <Button
        disabled={busy}
        onClick={handlePayAndExtend}
        className="w-full"
        size="lg"
      >
        {busy ? "Processing…" : (stripe ? "Charge & Extend" : "Extend Booking")}
      </Button>
    </div>
  );
}

export default function ExtendBookingSheet(props: Props) {
  const stripePromise = useMemo(() => {
    if (!props.publishableKey) {
      console.log("🔴 Stripe publishable key not provided");
      return null;
    }
    console.log("✅ Loading Stripe with publishable key:", props.publishableKey.substring(0, 20) + "...");
    return loadStripe(props.publishableKey);
  }, [props.publishableKey]);

  // In development, allow testing without Stripe
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (!props.publishableKey && !isDevelopment) {
    return (
      <div className="p-4 text-center text-gray-500">
        Stripe not configured. Please add your Stripe keys in Admin → Integrations.
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <InnerExtendForm {...props} />
    </Elements>
  );
}

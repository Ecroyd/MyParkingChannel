"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, Car, MapPin, CreditCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface BookingWidgetProps {
  tenantSlug: string;
  tenantId: string;
}

interface PricingInfo {
  dailyRate: number;
  currency: string;
}

export default function BookingWidget({ tenantSlug, tenantId }: BookingWidgetProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    loadPricing();
  }, [tenantId]);

  useEffect(() => {
    calculatePrice();
  }, [startDate, endDate, pricing]);

  const loadPricing = async () => {
    try {
      const response = await fetch(`/api/pricing/public?tenantId=${tenantId}`);
      
      if (!response.ok) {
        // If the endpoint doesn't exist or returns an error, use default pricing
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
      // Fallback to default pricing
      setPricing({ dailyRate: 7.0, currency: "GBP" });
    }
  };

  const calculatePrice = () => {
    if (!startDate || !endDate || !pricing) {
      setCalculatedPrice(null);
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      setCalculatedPrice(null);
      return;
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    setCalculatedPrice(diffDays * pricing.dailyRate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startDate || !endDate || !customerName || !customerEmail || !vehicleReg) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!calculatedPrice) {
      toast({
        title: "Invalid Dates",
        description: "Please select valid start and end dates.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // First create the booking
      const bookingResponse = await fetch("/api/public/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          customer_name: customerName,
          customer_email: customerEmail,
          plate: vehicleReg.toUpperCase(),
          start_at: new Date(startDate).toISOString(),
          end_at: new Date(endDate).toISOString(),
          source: "website",
        }),
      });

      const bookingResult = await bookingResponse.json();

      if (!bookingResponse.ok) {
        toast({
          title: "Booking Failed",
          description: bookingResult.error || "Unable to create booking. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Now process payment
      const paymentResponse = await fetch("/api/payments/public-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          start_at: new Date(startDate).toISOString(),
          end_at: new Date(endDate).toISOString(),
          customer_name: customerName,
          reference: bookingResult.booking?.reference || "new",
          application_fee_cents: Math.round(calculatedPrice * 0.1 * 100), // 10% platform fee
        }),
      });

      const paymentResult = await paymentResponse.json();

      if (!paymentResponse.ok) {
        toast({
          title: "Payment Failed",
          description: paymentResult.error || "Unable to process payment. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Redirect to Stripe checkout
      if (paymentResult.url) {
        window.location.href = paymentResult.url;
      } else {
        toast({
          title: "Payment Error",
          description: "No payment URL received. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Booking error:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg">
      <CardHeader className="text-center pb-4">
        <CardTitle className="flex items-center justify-center gap-2 text-xl">
          <Car className="h-6 w-6 text-blue-600" />
          Book Your Parking
        </CardTitle>
        <p className="text-sm text-gray-600">Secure your parking space today</p>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="flex items-center gap-1 text-sm">
                <Calendar className="h-4 w-4" />
                Arrival
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={today}
                required
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="flex items-center gap-1 text-sm">
                <Calendar className="h-4 w-4" />
                Departure
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || today}
                required
                className="text-sm"
              />
            </div>
          </div>

          {/* Customer Information */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="customerName" className="text-sm">Full Name *</Label>
              <Input
                id="customerName"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="John Doe"
                required
                className="text-sm"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="customerEmail" className="text-sm">Email Address *</Label>
              <Input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="john@example.com"
                required
                className="text-sm"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="vehicleReg" className="text-sm">Vehicle Registration *</Label>
              <Input
                id="vehicleReg"
                type="text"
                value={vehicleReg}
                onChange={(e) => setVehicleReg(e.target.value.toUpperCase())}
                placeholder="AB12 CDE"
                required
                className="text-sm uppercase"
              />
            </div>
          </div>

          {/* Price Display */}
          {calculatedPrice && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">Total Price:</span>
                <span className="text-lg font-bold text-blue-900">
                  £{calculatedPrice.toFixed(2)}
                </span>
              </div>
              {pricing && (
                <p className="text-xs text-blue-700 mt-1">
                  £{pricing.dailyRate.toFixed(2)} per day
                </p>
              )}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading || !calculatedPrice}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating Booking...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Book Now
              </div>
            )}
          </Button>
        </form>

        {/* Trust Indicators */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Secure Location
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              24/7 Access
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

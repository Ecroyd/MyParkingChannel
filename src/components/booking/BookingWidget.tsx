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
  const [customerPhone, setCustomerPhone] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  
  // Error state management
  const [errors, setErrors] = useState<{
    startDate?: string;
    endDate?: string;
    customerName?: string;
    customerEmail?: string;
    vehicleReg?: string;
    general?: string;
  }>({});

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

  // Show quote when price is calculated
  useEffect(() => {
    if (calculatedPrice && calculatedPrice > 0 && startDate && endDate) {
      // Show quote with a slight delay for smooth transition
      const quoteTimer = setTimeout(() => {
        setShowQuote(true);
      }, 200);
      
      // Expand customer details after quote is shown
      const expandTimer = setTimeout(() => {
        setShowCustomerDetails(true);
      }, 700);
      
      return () => {
        clearTimeout(quoteTimer);
        clearTimeout(expandTimer);
      };
    } else {
      // Reset when dates are cleared or price is invalid
      setShowQuote(false);
      setShowCustomerDetails(false);
    }
  }, [calculatedPrice, startDate, endDate]);

  // Clear errors when user starts typing
  const clearError = (field: keyof typeof errors) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Validation functions
  const validateField = (field: string, value: string): string | undefined => {
    switch (field) {
      case 'customerName':
        if (!value.trim()) return 'Full name is required';
        if (value.trim().length < 2) return 'Name must be at least 2 characters';
        return undefined;
      
      case 'customerEmail':
        if (!value.trim()) return 'Email address is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return 'Please enter a valid email address';
        return undefined;
      
      case 'vehicleReg':
        if (!value.trim()) return 'Vehicle registration is required';
        if (value.trim().length < 2) return 'Registration must be at least 2 characters';
        return undefined;
      
      case 'startDate':
        if (!value) return 'Arrival date and time is required';
        const start = new Date(value);
        const now = new Date();
        if (start < now) return 'Arrival date and time cannot be in the past';
        return undefined;
      
      case 'endDate':
        if (!value) return 'Departure date and time is required';
        if (startDate && value <= startDate) return 'Departure must be after arrival date and time';
        return undefined;
      
      default:
        return undefined;
    }
  };

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
    
    // Clear previous errors
    setErrors({});
    
    // Validate all fields
    const newErrors: typeof errors = {};
    let hasErrors = false;
    
    const startDateError = validateField('startDate', startDate);
    if (startDateError) {
      newErrors.startDate = startDateError;
      hasErrors = true;
    }
    
    const endDateError = validateField('endDate', endDate);
    if (endDateError) {
      newErrors.endDate = endDateError;
      hasErrors = true;
    }
    
    const customerNameError = validateField('customerName', customerName);
    if (customerNameError) {
      newErrors.customerName = customerNameError;
      hasErrors = true;
    }
    
    const customerEmailError = validateField('customerEmail', customerEmail);
    if (customerEmailError) {
      newErrors.customerEmail = customerEmailError;
      hasErrors = true;
    }
    
    const vehicleRegError = validateField('vehicleReg', vehicleReg);
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
      setErrors({ general: "Please select valid start and end dates and times." });
      toast({
        title: "Invalid Dates",
        description: "Please select valid start and end dates and times.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Process payment first - booking will be created after successful payment
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
          customer_email: customerEmail,
          customer_phone: customerPhone,
          plate: vehicleReg.toUpperCase(),
          flight_number: flightNumber || null,
          application_fee_cents: Math.round(calculatedPrice * 0.1 * 100), // 10% platform fee
        }),
      });

      const paymentResult = await paymentResponse.json();

      if (!paymentResponse.ok) {
        let errorMessage = "Unable to process payment. Please try again.";
        const newErrors: typeof errors = {};
        
        if (paymentResult.error) {
          // Handle server-side validation errors
          if (paymentResult.field_errors) {
            // Map server field errors to client field errors
            if (paymentResult.field_errors.customer_name) {
              newErrors.customerName = paymentResult.field_errors.customer_name;
            }
            if (paymentResult.field_errors.customer_email) {
              newErrors.customerEmail = paymentResult.field_errors.customer_email;
            }
            if (paymentResult.field_errors.plate) {
              newErrors.vehicleReg = paymentResult.field_errors.plate;
            }
            if (paymentResult.field_errors.start_at) {
              newErrors.startDate = paymentResult.field_errors.start_at;
            }
            if (paymentResult.field_errors.end_at) {
              newErrors.endDate = paymentResult.field_errors.end_at;
            }
            
            // If we have field errors, show them and return early
            if (Object.keys(newErrors).length > 0) {
              setErrors(newErrors);
              toast({
                title: "Please fix the errors below",
                description: "Some fields need to be corrected before you can continue.",
                variant: "destructive",
              });
              return;
            }
          }
          
          // Handle specific error cases
          if (paymentResult.error.includes('email')) {
            newErrors.customerEmail = "Please check your email address";
            errorMessage = "There's an issue with your email address. Please check and try again.";
          } else if (paymentResult.error.includes('tenant') || paymentResult.error.includes('Stripe not connected')) {
            errorMessage = "This parking service is temporarily unavailable. Please try again later.";
          } else if (paymentResult.error.includes('Invalid amount')) {
            errorMessage = "There's an issue with the booking amount. Please refresh and try again.";
          } else if (paymentResult.details && Array.isArray(paymentResult.details)) {
            errorMessage = paymentResult.details.join('. ');
          } else {
            errorMessage = paymentResult.error;
          }
        }
        
        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
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
  
  const minDateTime = getCurrentDateTimeLocal();

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
          {/* Date & Time Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="flex items-center gap-1 text-sm">
                <Calendar className="h-4 w-4" />
                Arrival Date & Time
              </Label>
              <Input
                id="startDate"
                type="datetime-local"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  clearError('startDate');
                }}
                min={minDateTime}
                required
                className={`text-sm ${errors.startDate ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              {errors.startDate && (
                <p className="text-red-500 text-xs">{errors.startDate}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="flex items-center gap-1 text-sm">
                <Calendar className="h-4 w-4" />
                Departure Date & Time
              </Label>
              <Input
                id="endDate"
                type="datetime-local"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  clearError('endDate');
                }}
                min={startDate || minDateTime}
                required
                className={`text-sm ${errors.endDate ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              {errors.endDate && (
                <p className="text-red-500 text-xs">{errors.endDate}</p>
              )}
              <p className="text-xs text-gray-500 italic">
                If unsure, please use your return flight time
              </p>
            </div>
          </div>

          {/* Quote Display - Smooth fade in */}
          <div
            className={`transition-all duration-500 ease-out overflow-hidden ${
              showQuote
                ? 'opacity-100 max-h-32 mt-4 translate-y-0'
                : 'opacity-0 max-h-0 mt-0 -translate-y-2'
            }`}
          >
            {calculatedPrice && calculatedPrice > 0 && (
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
          </div>

          {/* General Error Display */}
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700 text-sm">{errors.general}</p>
            </div>
          )}

          {/* Customer Information - Smooth expansion */}
          <div
            className={`transition-all duration-700 ease-out overflow-hidden ${
              showCustomerDetails
                ? 'opacity-100 max-h-[800px] mt-4 translate-y-0'
                : 'opacity-0 max-h-0 mt-0 -translate-y-4'
            }`}
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="customerName" className="text-sm">Full Name *</Label>
                <Input
                  id="customerName"
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    clearError('customerName');
                  }}
                  placeholder="John Doe"
                  required
                  className={`text-sm ${errors.customerName ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                {errors.customerName && (
                  <p className="text-red-500 text-xs">{errors.customerName}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="customerEmail" className="text-sm">Email Address *</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => {
                    setCustomerEmail(e.target.value);
                    clearError('customerEmail');
                  }}
                  placeholder="john@example.com"
                  required
                  className={`text-sm ${errors.customerEmail ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                {errors.customerEmail && (
                  <p className="text-red-500 text-xs">{errors.customerEmail}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="customerPhone" className="text-sm">Phone Number (optional)</Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+44 1234 567890"
                  className="text-sm"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="vehicleReg" className="text-sm">Vehicle Registration *</Label>
                <Input
                  id="vehicleReg"
                  type="text"
                  value={vehicleReg}
                  onChange={(e) => {
                    setVehicleReg(e.target.value.toUpperCase());
                    clearError('vehicleReg');
                  }}
                  placeholder="AB12 CDE"
                  required
                  className={`text-sm uppercase ${errors.vehicleReg ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                {errors.vehicleReg && (
                  <p className="text-red-500 text-xs">{errors.vehicleReg}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="flightNumber" className="text-sm">Flight Number (optional)</Label>
                <Input
                  id="flightNumber"
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                  placeholder="BA123"
                  className="text-sm uppercase"
                />
              </div>
            </div>
          </div>

          {/* Submit Button - Smooth fade in */}
          <div
            className={`transition-all duration-500 ease-out overflow-hidden ${
              showCustomerDetails
                ? 'opacity-100 max-h-20 mt-4 translate-y-0'
                : 'opacity-0 max-h-0 mt-0 -translate-y-2'
            }`}
          >
            <Button
              type="submit"
              disabled={loading || !calculatedPrice || !showCustomerDetails}
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
          </div>
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

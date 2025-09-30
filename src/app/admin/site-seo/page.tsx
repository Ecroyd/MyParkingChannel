"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Save, Globe, Search, Star, MapPin, Clock, HelpCircle } from "lucide-react";
import { UploadTenantLogo } from "@/components/admin/UploadTenantLogo";

export default function SiteSeoPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantId, setTenantId] = useState<string>("");
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        // First check the status
        const statusResponse = await fetch('/api/admin/site-seo/status');
        const statusData = await statusResponse.json();
        
        if (statusData.setupRequired) {
          setSetupRequired(true);
          toast({
            title: "Setup Required",
            description: "The tenant_public_profile table needs to be created. Please run the SQL migration script.",
            variant: "destructive"
          });
          return;
        }
        
        if (statusData.status !== 'ok') {
          toast({
            title: "Error",
            description: statusData.message || "Failed to load site data",
            variant: "destructive"
          });
          return;
        }

        console.log('Site SEO status response:', statusData);
        setTenantId(statusData.tenantId);

        // Load existing profile data using API endpoint
        const dataResponse = await fetch('/api/admin/site-seo/data');
        const dataResult = await dataResponse.json();

        if (!dataResult.success) {
          toast({
            title: "Error",
            description: dataResult.error || "Failed to load profile data",
            variant: "destructive"
          });
          return;
        }

        console.log("Loaded profile:", dataResult.data);
        setData(dataResult.data || { 
          tenant_id: statusData.tenantId, 
          features: ["CCTV", "24/7 Access", "Free Shuttle", "ANPR-protected"],
          faq: [],
          hours: []
        });
      } catch (error) {
        console.error("Error loading data:", error);
        toast({
          title: "Error",
          description: "Failed to load site data",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [toast]);


  const handleSave = async () => {
    if (!tenantId) {
      console.error("No tenant ID available");
      toast({
        title: "Error",
        description: "No tenant ID available. Please refresh the page.",
        variant: "destructive"
      });
      return;
    }
    
    setSaving(true);
    try {
      console.log("Tenant ID:", tenantId);
      console.log("Data object:", data);
      console.log("Logo URL in save data:", data.logo_url);
      console.log("Latitude:", data.latitude);
      console.log("Longitude:", data.longitude);
      
      const updateData = { ...data, tenant_id: tenantId };
      console.log("Saving data:", updateData);
      
      // Use API endpoint instead of direct Supabase calls
      const response = await fetch('/api/admin/site-seo/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save data');
      }

      console.log("Save result:", result);
      toast({
        title: "Success",
        description: "Site & SEO settings saved successfully"
      });
    } catch (error: any) {
      console.error("Error saving details:", error);
      
      let errorMessage = "Failed to save settings";
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = `Unknown error: ${JSON.stringify(error)}`;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const addFeature = () => {
    const newFeature = prompt("Enter feature name:");
    if (newFeature) {
      setData({
        ...data,
        features: [...(data.features || []), newFeature]
      });
    }
  };

  const removeFeature = (index: number) => {
    setData({
      ...data,
      features: data.features.filter((_: any, i: number) => i !== index)
    });
  };

  const addFAQ = () => {
    const question = prompt("Enter question:");
    const answer = prompt("Enter answer:");
    if (question && answer) {
      setData({
        ...data,
        faq: [...(data.faq || []), { q: question, a: answer }]
      });
    }
  };

  const removeFAQ = (index: number) => {
    setData({
      ...data,
      faq: data.faq.filter((_: any, i: number) => i !== index)
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (setupRequired) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-2">Setup Required</h2>
          <p className="text-amber-700 mb-4">
            The Site & SEO functionality requires the tenant_public_profile table to be created first. Please run the migration script to continue.
          </p>
          <div className="bg-amber-100 rounded p-4 font-mono text-sm">
            <p className="text-amber-800 font-semibold mb-2">Run this SQL script in your Supabase dashboard:</p>
            <code className="text-amber-900">supabase-migrations/create-tenant-public-profile.sql</code>
          </div>
          <div className="mt-4 text-sm text-amber-700">
            <p>After running the migration:</p>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Refresh this page</li>
              <li>The Site & SEO settings will be available</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Site & SEO</h1>
          <p className="text-slate-600 mt-1">Manage your public site content and SEO settings</p>
          {!tenantId && (
            <p className="text-amber-600 text-sm mt-1">
              ⚠️ Loading tenant information...
            </p>
          )}
        </div>
        <Button onClick={handleSave} disabled={saving || !tenantId} className="bg-sky-600 hover:bg-sky-700">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Logo Upload */}
      <UploadTenantLogo 
        tenantId={tenantId} 
        currentLogoUrl={data.logo_url}
        onLogoUpdated={async (logoUrl) => {
          setData((prev: any) => ({ ...prev, logo_url: logoUrl }))
          
          // Immediately save the logo URL to the database using API endpoint
          try {
            const updateData = { 
              ...data, 
              tenant_id: tenantId,
              logo_url: logoUrl 
            };
            
            console.log("Saving logo URL:", logoUrl);
            console.log("Update data for logo save:", updateData);
            
            const response = await fetch('/api/admin/site-seo/data', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updateData),
            });

            const result = await response.json();
              
            if (!result.success) {
              console.error("Error saving logo:", result.error);
              toast({
                title: "Error",
                description: "Failed to save logo to database",
                variant: "destructive"
              });
            } else {
              console.log("Logo saved successfully to database");
              // Trigger admin header refresh via localStorage event
              localStorage.setItem('logo-updated', Date.now().toString());
              localStorage.removeItem('logo-updated');
              
              // Also trigger tenant site refresh
              localStorage.setItem('tenant-site-refresh', Date.now().toString());
              localStorage.removeItem('tenant-site-refresh');
              
              // Fallback: reload after 2 seconds if localStorage event doesn't work
              setTimeout(() => {
                window.location.reload();
              }, 2000);
              
              toast({
                title: "Success",
                description: "Logo updated successfully!",
                variant: "default"
              });
            }
          } catch (err) {
            console.error("Error saving logo:", err);
            toast({
              title: "Error", 
              description: "Failed to save logo",
              variant: "destructive"
            });
          }
        }}
      />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="business_name">Business Name</Label>
              <Input
                id="business_name"
                value={data.business_name || ""}
                onChange={(e) => setData({ ...data, business_name: e.target.value })}
                placeholder="e.g., Exeter Airport Parking"
              />
            </div>
            <div>
              <Label htmlFor="short_tagline">Short Tagline</Label>
              <Input
                id="short_tagline"
                value={data.short_tagline || ""}
                onChange={(e) => setData({ ...data, short_tagline: e.target.value })}
                placeholder="e.g., Secure parking, clear pricing, easy check-in"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={data.phone || ""}
                onChange={(e) => setData({ ...data, phone: e.target.value })}
                placeholder="e.g., +44 1392 123456"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={data.email || ""}
                onChange={(e) => setData({ ...data, email: e.target.value })}
                placeholder="e.g., info@exeterparking.com"
              />
            </div>
            <div>
              <Label htmlFor="price_range">Price Range</Label>
              <Input
                id="price_range"
                value={data.price_range || ""}
                onChange={(e) => setData({ ...data, price_range: e.target.value })}
                placeholder="e.g., ££ or £5-15 per day"
              />
            </div>
            <div>
              <Label htmlFor="what3words">What3Words Location</Label>
              <Input
                id="what3words"
                value={data.what3words || ""}
                onChange={(e) => setData({ ...data, what3words: e.target.value })}
                placeholder="e.g., ///filled.count.soap"
              />
              <p className="text-xs text-slate-500 mt-1">
                Enter your What3Words location (e.g., ///filled.count.soap) for precise mapping
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={data.latitude || ""}
                  onChange={(e) => setData({ ...data, latitude: parseFloat(e.target.value) || null })}
                  placeholder="e.g., 51.5074"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Decimal degrees (-90 to 90)
                </p>
              </div>
              <div>
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={data.longitude || ""}
                  onChange={(e) => setData({ ...data, longitude: parseFloat(e.target.value) || null })}
                  placeholder="e.g., -0.1278"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Decimal degrees (-180 to 180)
                </p>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>💡 Tip:</strong> You can find coordinates by right-clicking on Google Maps and selecting "What's here?" 
                or use the What3Words location above. The map will center on these coordinates.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SEO Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              SEO Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="meta_title">Meta Title</Label>
              <Input
                id="meta_title"
                value={data.meta_title || ""}
                onChange={(e) => setData({ ...data, meta_title: e.target.value })}
                placeholder="e.g., Exeter Airport Parking | Book Secure Parking"
              />
            </div>
            <div>
              <Label htmlFor="meta_description">Meta Description</Label>
              <Textarea
                id="meta_description"
                value={data.meta_description || ""}
                onChange={(e) => setData({ ...data, meta_description: e.target.value })}
                placeholder="e.g., Secure airport parking with CCTV, 24/7 access and fast shuttle to Exeter Airport terminal."
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="review_rating">Review Rating (1-5)</Label>
              <Input
                id="review_rating"
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={data.review_rating || 4.8}
                onChange={(e) => setData({ ...data, review_rating: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="review_count">Review Count</Label>
              <Input
                id="review_count"
                type="number"
                value={data.review_count || 12}
                onChange={(e) => setData({ ...data, review_count: parseInt(e.target.value) })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Features & USPs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            {(data.features || []).map((feature: string, index: number) => (
              <div key={index} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-sm">{feature}</span>
                <button
                  onClick={() => removeFeature(index)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <Button onClick={addFeature} variant="outline" size="sm">
            Add Feature
          </Button>
        </CardContent>
      </Card>

      {/* Location & Hours */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="airports">Airports (comma-separated)</Label>
              <Input
                id="airports"
                value={(data.airports || []).join(", ")}
                onChange={(e) => setData({ ...data, airports: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                placeholder="e.g., Exeter, Bristol"
              />
            </div>
            <div>
              <Label htmlFor="address_street">Street Address</Label>
              <Input
                id="address_street"
                value={data.address?.street || ""}
                onChange={(e) => setData({ 
                  ...data, 
                  address: { ...data.address, street: e.target.value }
                })}
                placeholder="e.g., 123 Airport Road"
              />
            </div>
            <div>
              <Label htmlFor="address_city">City</Label>
              <Input
                id="address_city"
                value={data.address?.city || ""}
                onChange={(e) => setData({ 
                  ...data, 
                  address: { ...data.address, city: e.target.value }
                })}
                placeholder="e.g., Exeter"
              />
            </div>
            <div>
              <Label htmlFor="address_postal">Postal Code</Label>
              <Input
                id="address_postal"
                value={data.address?.postalCode || ""}
                onChange={(e) => setData({ 
                  ...data, 
                  address: { ...data.address, postalCode: e.target.value }
                })}
                placeholder="e.g., EX5 2BD"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Opening Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm text-slate-600 mb-3">
                Add opening hours (e.g., "Mon-Fri: 00:00-24:00")
              </div>
              {(data.hours || []).map((hour: any, index: number) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={hour.day || ""}
                    onChange={(e) => {
                      const newHours = [...(data.hours || [])];
                      newHours[index] = { ...newHours[index], day: e.target.value };
                      setData({ ...data, hours: newHours });
                    }}
                    placeholder="Day (e.g., Mon-Fri)"
                    className="flex-1"
                  />
                  <Input
                    value={hour.open || ""}
                    onChange={(e) => {
                      const newHours = [...(data.hours || [])];
                      newHours[index] = { ...newHours[index], open: e.target.value };
                      setData({ ...data, hours: newHours });
                    }}
                    placeholder="Open (e.g., 00:00)"
                    className="w-20"
                  />
                  <Input
                    value={hour.close || ""}
                    onChange={(e) => {
                      const newHours = [...(data.hours || [])];
                      newHours[index] = { ...newHours[index], close: e.target.value };
                      setData({ ...data, hours: newHours });
                    }}
                    placeholder="Close (e.g., 24:00)"
                    className="w-20"
                  />
                  <Button
                    onClick={() => {
                      setData({
                        ...data,
                        hours: data.hours.filter((_: any, i: number) => i !== index)
                      });
                    }}
                    variant="outline"
                    size="sm"
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button 
                onClick={() => {
                  setData({
                    ...data,
                    hours: [...(data.hours || []), { day: "", open: "", close: "" }]
                  });
                }}
                variant="outline"
                size="sm"
              >
                Add Hours
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FAQs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(data.faq || []).map((faq: any, index: number) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-slate-900">{faq.q}</h4>
                  <Button
                    onClick={() => removeFAQ(index)}
                    variant="outline"
                    size="sm"
                  >
                    Remove
                  </Button>
                </div>
                <p className="text-slate-600 text-sm">{faq.a}</p>
              </div>
            ))}
            <Button onClick={addFAQ} variant="outline">
              Add FAQ
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

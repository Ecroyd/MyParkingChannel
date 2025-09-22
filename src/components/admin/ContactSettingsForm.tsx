"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBrowserClient } from "@supabase/ssr";
import { Save, Phone, Mail, MapPin, Clock, Globe, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ContactSettings {
  contact_email?: string;
  contact_phone?: string;
  contact_address?: string;
  contact_city?: string;
  contact_postcode?: string;
  contact_country?: string;
  business_hours?: string;
  website_url?: string;
  social_media?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  };
}

interface ContactSettingsFormProps {
  tenantId: string;
}

export default function ContactSettingsForm({ tenantId }: ContactSettingsFormProps) {
  const [settings, setSettings] = useState<ContactSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    loadSettings();
  }, [tenantId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tenant/contact-settings?tenantId=${tenantId}`);
      const result = await response.json();

      if (result.success) {
        setSettings(result.data || {});
      } else {
        setError(result.error || "Failed to load settings");
      }
    } catch (err) {
      console.error("Error loading contact settings:", err);
      setError("Failed to load contact settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/tenant/contact-settings?tenantId=${tenantId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Settings saved",
          description: "Contact settings have been updated successfully.",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to save settings",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Error saving contact settings:", err);
      toast({
        title: "Error",
        description: "Failed to save contact settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof ContactSettings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSocialMediaChange = (platform: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      social_media: {
        ...prev.social_media,
        [platform]: value
      }
    }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading contact settings...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <p>{error}</p>
            <Button onClick={loadSettings} className="mt-4" variant="outline">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_email">Email Address</Label>
              <Input
                id="contact_email"
                type="email"
                value={settings.contact_email || ""}
                onChange={(e) => handleInputChange("contact_email", e.target.value)}
                placeholder="info@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Phone Number</Label>
              <Input
                id="contact_phone"
                type="tel"
                value={settings.contact_phone || ""}
                onChange={(e) => handleInputChange("contact_phone", e.target.value)}
                placeholder="+44 0000 000000"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Business Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact_address">Street Address</Label>
            <Input
              id="contact_address"
              value={settings.contact_address || ""}
              onChange={(e) => handleInputChange("contact_address", e.target.value)}
              placeholder="123 Business Street"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_city">City</Label>
              <Input
                id="contact_city"
                value={settings.contact_city || ""}
                onChange={(e) => handleInputChange("contact_city", e.target.value)}
                placeholder="London"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_postcode">Postcode</Label>
              <Input
                id="contact_postcode"
                value={settings.contact_postcode || ""}
                onChange={(e) => handleInputChange("contact_postcode", e.target.value)}
                placeholder="SW1A 1AA"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_country">Country</Label>
              <Input
                id="contact_country"
                value={settings.contact_country || "UK"}
                onChange={(e) => handleInputChange("contact_country", e.target.value)}
                placeholder="UK"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Hours & Website */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Business Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business_hours">Business Hours</Label>
            <Input
              id="business_hours"
              value={settings.business_hours || ""}
              onChange={(e) => handleInputChange("business_hours", e.target.value)}
              placeholder="Mon-Fri 8AM-6PM, Sat 9AM-4PM"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website_url">Website URL</Label>
            <Input
              id="website_url"
              type="url"
              value={settings.website_url || ""}
              onChange={(e) => handleInputChange("website_url", e.target.value)}
              placeholder="https://www.example.com"
            />
          </div>
        </CardContent>
      </Card>

      {/* Social Media */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Social Media
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="facebook">Facebook</Label>
              <Input
                id="facebook"
                type="url"
                value={settings.social_media?.facebook || ""}
                onChange={(e) => handleSocialMediaChange("facebook", e.target.value)}
                placeholder="https://facebook.com/yourpage"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitter">Twitter</Label>
              <Input
                id="twitter"
                type="url"
                value={settings.social_media?.twitter || ""}
                onChange={(e) => handleSocialMediaChange("twitter", e.target.value)}
                placeholder="https://twitter.com/yourhandle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                type="url"
                value={settings.social_media?.instagram || ""}
                onChange={(e) => handleSocialMediaChange("instagram", e.target.value)}
                placeholder="https://instagram.com/yourhandle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn</Label>
              <Input
                id="linkedin"
                type="url"
                value={settings.social_media?.linkedin || ""}
                onChange={(e) => handleSocialMediaChange("linkedin", e.target.value)}
                placeholder="https://linkedin.com/company/yourcompany"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

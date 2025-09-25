'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Code, ExternalLink, Globe } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface WidgetSnippetProps {
  tenantSlug: string;
  tenantName: string;
}

export default function WidgetSnippet({ tenantSlug, tenantName }: WidgetSnippetProps) {
  const [copied, setCopied] = useState(false);
  const [customDomain, setCustomDomain] = useState('');
  
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
  const widgetUrl = `${baseUrl}/widget/${tenantSlug}.js`;
  const tenantSiteUrl = `${baseUrl}/sites/${tenantSlug}`;
  
  const snippet = `<script src="${widgetUrl}"></script>`;
  const customSnippet = customDomain ? `<script src="${customDomain}/widget/${tenantSlug}.js"></script>` : snippet;
  
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Widget snippet copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };
  
  const copySiteUrl = async () => {
    try {
      await navigator.clipboard.writeText(tenantSiteUrl);
      toast({
        title: 'Copied!',
        description: 'Tenant site URL copied to clipboard',
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Widget Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Booking Widget
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Widget URL</Label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono">
                {widgetUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(widgetUrl)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div>
            <Label className="text-sm font-medium">Tenant Site</Label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono">
                {tenantSiteUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={copySiteUrl}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a href={tenantSiteUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Embed Snippet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Embed Code
          </CardTitle>
          <p className="text-sm text-gray-600">
            Add this code to any website to embed the booking widget for {tenantName}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Custom Domain Option */}
          <div>
            <Label htmlFor="customDomain">Custom Domain (Optional)</Label>
            <Input
              id="customDomain"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="https://your-custom-domain.com"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              If you have a custom domain configured, enter it here to generate the appropriate embed code.
            </p>
          </div>
          
          {/* Code Snippet */}
          <div>
            <Label className="text-sm font-medium">HTML Embed Code</Label>
            <div className="relative mt-1">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                <code>{customSnippet}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(customSnippet)}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          
          {/* Usage Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">How to use:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Copy the embed code above</li>
              <li>Paste it into your website's HTML where you want the booking widget to appear</li>
              <li>The widget will automatically load and display the booking form for {tenantName}</li>
              <li>Users can make bookings directly through your website</li>
            </ol>
          </div>
          
          {/* Features */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Widget Features:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Responsive</Badge>
                <span className="text-sm text-gray-600">Works on all devices</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Secure</Badge>
                <span className="text-sm text-gray-600">HTTPS encrypted</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Fast</Badge>
                <span className="text-sm text-gray-600">Optimized loading</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Customizable</Badge>
                <span className="text-sm text-gray-600">Matches your brand</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { upsertCavuConfig } from './actions';

interface CavuSettingsClientProps {
  tenantId: string;
  existingConfig: {
    operator_id?: number;
    operator_private_key?: string;
    subscription_key?: string;
  };
}

export default function CavuSettingsClient({
  tenantId,
  existingConfig,
}: CavuSettingsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showOperatorKey, setShowOperatorKey] = useState(false);
  const [showSubscriptionKey, setShowSubscriptionKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (fieldId: string) => {
    try {
      const input = document.getElementById(fieldId) as HTMLInputElement;
      if (!input || !input.value) {
        toast.error('No value to copy');
        return;
      }
      await navigator.clipboard.writeText(input.value);
      setCopiedField(fieldId);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      try {
        await upsertCavuConfig(tenantId, formData);
        toast.success('CAVU settings saved successfully!');
        router.refresh();
      } catch (error: any) {
        toast.error(error.message || 'Failed to save CAVU settings');
      }
    });
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">CAVU / ParkCloud Operator API</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect this tenant to your ParkCloud Operator account. All keys are stored
          per-tenant so you can onboard multiple operators in a SaaS-friendly way.
        </p>
      </div>

      <form action={handleSubmit} className="space-y-4 bg-white rounded-lg border p-6">
        <div className="space-y-2">
          <label htmlFor="operator_id" className="block text-sm font-medium">
            Operator ID
          </label>
          <input
            id="operator_id"
            name="operator_id"
            type="text"
            defaultValue={existingConfig.operator_id ?? ''}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="e.g. 7135"
            required
          />
          <p className="text-xs text-muted-foreground">
            Numeric ID returned by the <code>/operators</code> API call (e.g. 7135
            for FLYPARKS).
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="operator_private_key" className="block text-sm font-medium">
            Operator Private Key
          </label>
          <div className="relative">
            <input
              id="operator_private_key"
              name="operator_private_key"
              type={showOperatorKey ? 'text' : 'password'}
              defaultValue={existingConfig.operator_private_key ?? ''}
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-20 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Key from ParkCloud Operator portal (Generate Key)"
              required
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => handleCopy('operator_private_key')}
                title="Copy to clipboard"
              >
                {copiedField === 'operator_private_key' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setShowOperatorKey(!showOperatorKey)}
                title={showOperatorKey ? 'Hide key' : 'Show key'}
              >
                {showOperatorKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Copied from the classic ParkCloud Operator portal API page. Identifies
            this car park to CAVU.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="subscription_key" className="block text-sm font-medium">
            Subscription Key
          </label>
          <div className="relative">
            <input
              id="subscription_key"
              name="subscription_key"
              type={showSubscriptionKey ? 'text' : 'password'}
              defaultValue={existingConfig.subscription_key ?? ''}
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-20 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Primary key from Developer Portal → Profile → Subscriptions"
              required
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => handleCopy('subscription_key')}
                title="Copy to clipboard"
              >
                {copiedField === 'subscription_key' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setShowSubscriptionKey(!showSubscriptionKey)}
                title={showSubscriptionKey ? 'Hide key' : 'Show key'}
              >
                {showSubscriptionKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Azure subscription key for the <strong>Operator</strong> API product.
            This is per-operator so you can throttle and bill by tenant.
          </p>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <Button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save CAVU Settings'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/channels')}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}


'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type DynamicPricingRule = {
  id: string;
  threshold_percent: number;
  price_increase_percent: number;
  is_active: boolean;
  sort_order: number;
};

type DynamicPricingSettings = {
  id: string | null;
  tenant_id: string;
  is_enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export default function DynamicPricingPage() {
  const [settings, setSettings] = useState<DynamicPricingSettings | null>(null);
  const [rules, setRules] = useState<DynamicPricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DynamicPricingRule | null>(null);
  const [formData, setFormData] = useState({
    threshold_percent: '',
    price_increase_percent: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [settingsRes, rulesRes] = await Promise.all([
        fetch('/api/admin/dynamic-pricing/settings', { credentials: 'include' }),
        fetch('/api/admin/dynamic-pricing/rules', { credentials: 'include' }),
      ]);

      const settingsData = await settingsRes.json();
      const rulesData = await rulesRes.json();

      if (settingsData.error) {
        toast.error(settingsData.error);
      } else {
        setSettings(settingsData);
      }

      if (rulesData.error) {
        toast.error(rulesData.error);
      } else {
        // Sort by threshold_percent ascending for display
        setRules(rulesData.sort((a: DynamicPricingRule, b: DynamicPricingRule) => 
          a.threshold_percent - b.threshold_percent
        ));
      }
    } catch (error) {
      console.error('Error loading dynamic pricing data:', error);
      toast.error('Failed to load dynamic pricing settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleEnabled = async (enabled: boolean) => {
    try {
      setSaving(true);
      const response = await fetch('/api/admin/dynamic-pricing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_enabled: enabled }),
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        setSettings(result);
        toast.success(`Dynamic pricing ${enabled ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRule = () => {
    setEditingRule(null);
    setFormData({
      threshold_percent: '',
      price_increase_percent: '',
    });
    setDialogOpen(true);
  };

  const handleEditRule = (rule: DynamicPricingRule) => {
    setEditingRule(rule);
    setFormData({
      threshold_percent: rule.threshold_percent.toString(),
      price_increase_percent: rule.price_increase_percent.toString(),
    });
    setDialogOpen(true);
  };

  const handleSaveRule = async () => {
    const threshold = parseFloat(formData.threshold_percent);
    const increase = parseFloat(formData.price_increase_percent);

    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      toast.error('Occupancy threshold must be between 0 and 100');
      return;
    }

    if (isNaN(increase) || increase < 0) {
      toast.error('Price increase must be a non-negative number');
      return;
    }

    try {
      setSaving(true);
      const url = editingRule
        ? `/api/admin/dynamic-pricing/rules/${editingRule.id}`
        : '/api/admin/dynamic-pricing/rules';
      const method = editingRule ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          threshold_percent: threshold,
          price_increase_percent: increase,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        console.error('[DynamicPricing] Save error:', result);
        toast.error(result.details || result.error || 'Failed to save rule');
        return;
      }

      const result = await response.json();
      if (result.error) {
        console.error('[DynamicPricing] Save error:', result);
        toast.error(result.details || result.error);
      } else {
        toast.success(`Rule ${editingRule ? 'updated' : 'created'} successfully`);
        setDialogOpen(false);
        loadData();
      }
    } catch (error) {
      console.error('Error saving rule:', error);
      toast.error('Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (rule: DynamicPricingRule) => {
    if (!confirm(`Delete rule: Occupancy ≥ ${rule.threshold_percent}% → +${rule.price_increase_percent}%?`)) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/admin/dynamic-pricing/rules/${rule.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Rule deleted successfully');
        loadData();
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast.error('Failed to delete rule');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dynamic Pricing</h1>
        <p className="text-sm text-gray-500">
          Automatically adjust prices based on occupancy levels
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Enable dynamic pricing to automatically increase prices when capacity thresholds are reached
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Big Toggle Button */}
          <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border-2 border-dashed">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Dynamic Pricing Status
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {settings?.is_enabled
                  ? 'Dynamic pricing is currently active and will adjust prices based on occupancy'
                  : 'Dynamic pricing is currently disabled'}
              </p>
            </div>
            <button
              onClick={() => handleToggleEnabled(!(settings?.is_enabled || false))}
              disabled={saving}
              className={`
                relative inline-flex h-16 w-32 items-center rounded-full transition-colors duration-200 ease-in-out
                focus:outline-none focus:ring-4 focus:ring-offset-2
                ${settings?.is_enabled
                  ? 'bg-blue-600 focus:ring-blue-500'
                  : 'bg-gray-300 focus:ring-gray-400'
                }
                ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <span
                className={`
                  inline-block h-12 w-12 transform rounded-full bg-white shadow-lg transition-transform duration-200 ease-in-out
                  ${settings?.is_enabled ? 'translate-x-16' : 'translate-x-1'}
                `}
              />
            </button>
            <div className="mt-4 flex items-center gap-4 text-sm">
              <span className={`font-medium ${settings?.is_enabled ? 'text-gray-500' : 'text-gray-900'}`}>
                OFF
              </span>
              <span className={`font-medium ${settings?.is_enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                ON
              </span>
            </div>
            {saving && (
              <p className="mt-2 text-sm text-gray-500">Saving...</p>
            )}
          </div>

          {settings?.is_enabled && (
            <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-md">
              <strong>Note:</strong> Dynamic pricing applies to all channels. Prices are increased
              when occupancy reaches the thresholds defined below.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pricing Bands</CardTitle>
              <CardDescription>
                Define occupancy thresholds and corresponding price increases
              </CardDescription>
            </div>
            <Button onClick={handleCreateRule} disabled={!settings?.is_enabled}>
              <Plus className="h-4 w-4 mr-2" />
              Add Band
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {settings?.is_enabled
                ? 'No pricing bands configured. Add a band to get started.'
                : 'Enable dynamic pricing above to add pricing bands.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Occupancy ≥</TableHead>
                  <TableHead>Price Increase</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">
                      {rule.threshold_percent}%
                    </TableCell>
                    <TableCell>+{rule.price_increase_percent}%</TableCell>
                    <TableCell>
                      {rule.is_active ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <span className="text-gray-400">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditRule(rule)}
                          disabled={saving}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRule(rule)}
                          disabled={saving}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Pricing Band' : 'Add Pricing Band'}
            </DialogTitle>
            <DialogDescription>
              Define when prices should increase based on occupancy percentage
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="threshold">Occupancy Threshold (%)</Label>
              <Input
                id="threshold"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.threshold_percent}
                onChange={(e) =>
                  setFormData({ ...formData, threshold_percent: e.target.value })
                }
                placeholder="e.g. 50"
              />
              <p className="text-xs text-gray-500 mt-1">
                When occupancy reaches this percentage, the price increase will apply
              </p>
            </div>
            <div>
              <Label htmlFor="increase">Price Increase (%)</Label>
              <Input
                id="increase"
                type="number"
                min="0"
                step="0.1"
                value={formData.price_increase_percent}
                onChange={(e) =>
                  setFormData({ ...formData, price_increase_percent: e.target.value })
                }
                placeholder="e.g. 10"
              />
              <p className="text-xs text-gray-500 mt-1">
                Percentage increase to apply to the base price
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveRule} disabled={saving}>
              {saving ? 'Saving...' : editingRule ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


'use client';
import { useState, useEffect } from 'react';

interface OrphanTenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  capacity: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function OrphansClient() {
  const [orphans, setOrphans] = useState<OrphanTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState<string | null>(null);

  useEffect(() => {
    fetchOrphans();
  }, []);

  const fetchOrphans = async () => {
    try {
      const res = await fetch('/api/admin/tenants/orphans');
      const data = await res.json();
      if (res.ok) {
        setOrphans(data.tenants || []);
      } else {
        console.error('Failed to fetch orphans:', data);
      }
    } catch (error) {
      console.error('Error fetching orphans:', error);
    } finally {
      setLoading(false);
    }
  };

  const repairOrphan = async (tenantId: string, ownerEmail: string, invite: boolean) => {
    setRepairing(tenantId);
    try {
      const res = await fetch('/api/admin/tenants/assign-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          ownerEmail,
          invite,
        }),
      });
      
      const data = await res.json();
      if (res.ok) {
        // Remove from orphans list
        setOrphans(prev => prev.filter(o => o.id !== tenantId));
        alert('Owner assigned successfully!');
      } else {
        throw new Error(data.error?.message || 'Failed to assign owner');
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setRepairing(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (orphans.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Orphan Tenants</h2>
        <div className="text-center py-8 text-gray-500">
          <p>No orphan tenants found. All tenants have owners assigned.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Orphan Tenants ({orphans.length})</h2>
        <button 
          onClick={fetchOrphans}
          className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>
      
      <div className="space-y-4">
        {orphans.map((orphan) => (
          <OrphanCard 
            key={orphan.id} 
            orphan={orphan} 
            onRepair={repairOrphan}
            isRepairing={repairing === orphan.id}
          />
        ))}
      </div>
    </div>
  );
}

function OrphanCard({ 
  orphan, 
  onRepair, 
  isRepairing 
}: { 
  orphan: OrphanTenant; 
  onRepair: (tenantId: string, email: string, invite: boolean) => void;
  isRepairing: boolean;
}) {
  const [showRepair, setShowRepair] = useState(false);
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(true);

  const handleRepair = () => {
    if (!email.trim()) {
      alert('Please enter an owner email');
      return;
    }
    onRepair(orphan.id, email.trim(), invite);
    setShowRepair(false);
    setEmail('');
  };

  return (
    <div className="border rounded-lg p-4 bg-amber-50 border-amber-200">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-amber-800">{orphan.name}</h3>
          <p className="text-sm text-amber-600">/{orphan.slug} • {orphan.timezone} • cap {(orphan as any).default_capacity}</p>
          <p className="text-xs text-amber-500">Created: {new Date(orphan.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex gap-2">
          {!showRepair ? (
            <button
              onClick={() => setShowRepair(true)}
              className="px-3 py-1 text-sm bg-amber-600 text-white rounded hover:bg-amber-700"
            >
              Assign Owner
            </button>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                type="email"
                placeholder="owner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-2 py-1 text-sm border rounded"
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={invite}
                  onChange={(e) => setInvite(e.target.checked)}
                />
                Invite
              </label>
              <button
                onClick={handleRepair}
                disabled={isRepairing}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {isRepairing ? 'Assigning...' : 'Assign'}
              </button>
              <button
                onClick={() => setShowRepair(false)}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

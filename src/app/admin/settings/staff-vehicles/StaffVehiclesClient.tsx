'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTenant } from '@/hooks/useTenant'
import { Plus, Trash2, Edit2, X, Check, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

type StaffVehicle = {
  id: string
  plate: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function StaffVehiclesClient() {
  const { tenantId, loading: tenantLoading } = useTenant()
  const [vehicles, setVehicles] = useState<StaffVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({
    plate: '',
    description: '',
    is_active: true,
  })

  useEffect(() => {
    if (tenantId) {
      loadVehicles()
    }
  }, [tenantId])

  async function loadVehicles() {
    if (!tenantId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/staff-vehicles?tenantId=${tenantId}`)
      const json = await res.json()
      if (json.success) {
        setVehicles(json.data || [])
      } else {
        setError(json.error || 'Failed to load staff vehicles')
      }
    } catch (err) {
      console.error('Failed to load staff vehicles:', err)
      setError('Failed to load staff vehicles')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return

    const submitting = editingId ? 'updating' : 'creating'
    try {
      const url = editingId
        ? `/api/admin/staff-vehicles/${editingId}`
        : '/api/admin/staff-vehicles'
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          plate: formData.plate,
          description: formData.description || null,
          is_active: formData.is_active,
        }),
      })

      const json = await res.json()
      if (json.success) {
        toast({
          title: 'Success',
          description: `Staff vehicle ${editingId ? 'updated' : 'created'} successfully`,
        })
        setIsAdding(false)
        setEditingId(null)
        setFormData({ plate: '', description: '', is_active: true })
        loadVehicles()
      } else {
        toast({
          title: 'Error',
          description: json.error || `Failed to ${submitting} staff vehicle`,
          variant: 'destructive',
        })
      }
    } catch (err) {
      console.error(`Failed to ${submitting} staff vehicle:`, err)
      toast({
        title: 'Error',
        description: `Failed to ${submitting} staff vehicle`,
        variant: 'destructive',
      })
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this staff vehicle?')) return
    if (!tenantId) return

    try {
      const res = await fetch(`/api/admin/staff-vehicles/${id}`, {
        method: 'DELETE',
      })

      const json = await res.json()
      if (json.success) {
        toast({
          title: 'Success',
          description: 'Staff vehicle deleted successfully',
        })
        loadVehicles()
      } else {
        toast({
          title: 'Error',
          description: json.error || 'Failed to delete staff vehicle',
          variant: 'destructive',
        })
      }
    } catch (err) {
      console.error('Failed to delete staff vehicle:', err)
      toast({
        title: 'Error',
        description: 'Failed to delete staff vehicle',
        variant: 'destructive',
      })
    }
  }

  function startEdit(vehicle: StaffVehicle) {
    setEditingId(vehicle.id)
    setFormData({
      plate: vehicle.plate,
      description: vehicle.description || '',
      is_active: vehicle.is_active,
    })
    setIsAdding(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setIsAdding(false)
    setFormData({ plate: '', description: '', is_active: true })
  }

  function startAdd() {
    setIsAdding(true)
    setEditingId(null)
    setFormData({ plate: '', description: '', is_active: true })
  }

  if (tenantLoading || loading) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
            <p className="mt-4 text-gray-600">Loading staff vehicles...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Staff Vehicles</h1>
        <p className="text-sm text-gray-500">
          Manage staff vehicles that can always enter the car park via ANPR.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-soft">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Staff Vehicles</CardTitle>
          {!isAdding && !editingId && (
            <Button onClick={startAdd} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Vehicle
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {/* Add/Edit Form */}
          {(isAdding || editingId) && (
            <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="plate">Number Plate *</Label>
                  <Input
                    id="plate"
                    value={formData.plate}
                    onChange={(e) => setFormData({ ...formData, plate: e.target.value })}
                    placeholder="AB12 CDE"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Plate will be normalised (uppercase, no spaces)
                  </p>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="e.g., Manager's car"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  Active (vehicle can enter)
                </Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  <Check className="h-4 w-4 mr-2" />
                  {editingId ? 'Update' : 'Create'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Vehicles List */}
          {vehicles.length === 0 && !isAdding && !editingId ? (
            <div className="text-center py-8 text-gray-500">
              <p>No staff vehicles configured yet.</p>
              <Button onClick={startAdd} size="sm" variant="outline" className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add First Vehicle
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className={`p-4 border rounded-lg flex items-center justify-between ${
                    editingId === vehicle.id ? 'bg-blue-50' : ''
                  } ${!vehicle.is_active ? 'opacity-60' : ''}`}
                >
                  {editingId === vehicle.id ? (
                    <form onSubmit={handleSubmit} className="flex-1 grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="edit-plate">Number Plate *</Label>
                        <Input
                          id="edit-plate"
                          value={formData.plate}
                          onChange={(e) => setFormData({ ...formData, plate: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-description">Description</Label>
                        <Input
                          id="edit-description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="edit-is_active"
                          checked={formData.is_active}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          className="rounded"
                        />
                        <Label htmlFor="edit-is_active" className="cursor-pointer">
                          Active
                        </Label>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm">
                          <Check className="h-4 w-4 mr-2" />
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{vehicle.plate}</span>
                          {!vehicle.is_active && (
                            <span className="text-xs px-2 py-0.5 bg-gray-200 rounded">Inactive</span>
                          )}
                        </div>
                        {vehicle.description && (
                          <p className="text-sm text-gray-500 mt-1">{vehicle.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(vehicle)}
                          disabled={isAdding}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(vehicle.id)}
                          disabled={isAdding}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


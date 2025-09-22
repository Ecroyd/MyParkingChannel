'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit, Trash2, Calendar, DollarSign, Ban } from 'lucide-react'
import { BookingRule, CreateBookingRule } from '@/lib/validation/booking-rules'
import { getRuleDescription } from '@/lib/booking-rules/evaluation'
import BookingRuleDialog from './BookingRuleDialog'
import { api } from '@/lib/utils'

type BookingRulesPageClientProps = {
  tenant: {
    id: string
    name: string
    slug: string
    timezone: string
  }
}

export default function BookingRulesPageClient({ tenant }: BookingRulesPageClientProps) {
  const [rules, setRules] = useState<BookingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<BookingRule | null>(null)

  const fetchRules = async () => {
    try {
      const response = await api('/api/booking-rules')
      if (response.ok) {
        const data = await response.json()
        setRules(data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch booking rules:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRules()
  }, [])

  const handleCreateRule = async (ruleData: CreateBookingRule) => {
    try {
      console.log('Creating rule with data:', ruleData)
      
      const response = await api('/api/booking-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData)
      })

      console.log('Response status:', response.status)
      console.log('Response ok:', response.ok)

      if (response.ok) {
        const result = await response.json()
        console.log('Success:', result)
        await fetchRules()
        setDialogOpen(false)
      } else {
        const error = await response.json()
        console.error('Failed to create rule:', error)
        alert(`Failed to create rule: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to create rule:', error)
      alert(`Failed to create rule: ${error}`)
    }
  }

  const handleUpdateRule = async (ruleId: string, ruleData: Partial<CreateBookingRule>) => {
    try {
      const response = await api(`/api/booking-rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData)
      })

      if (response.ok) {
        await fetchRules()
        setEditingRule(null)
        setDialogOpen(false)
      } else {
        const error = await response.json()
        console.error('Failed to update rule:', error)
      }
    } catch (error) {
      console.error('Failed to update rule:', error)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this booking rule?')) {
      return
    }

    try {
      const response = await api(`/api/booking-rules/${ruleId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchRules()
      } else {
        const error = await response.json()
        console.error('Failed to delete rule:', error)
      }
    } catch (error) {
      console.error('Failed to delete rule:', error)
    }
  }

  const openCreateDialog = () => {
    setEditingRule(null)
    setDialogOpen(true)
  }

  const openEditDialog = (rule: BookingRule) => {
    setEditingRule(rule)
    setDialogOpen(true)
  }

  if (loading) {
    return <div>Loading booking rules...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Current Rules</h2>
          <p className="text-sm text-gray-600">
            {rules.length} rule{rules.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <Button onClick={openCreateDialog} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No booking rules configured</h3>
            <p className="text-gray-600 mb-4">
              Create rules to block certain dates or add surcharges to bookings
            </p>
            <Button onClick={openCreateDialog} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Your First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {rule.rule_kind === 'blackout' ? (
                      <Ban className="h-5 w-5 text-red-500" />
                    ) : (
                      <DollarSign className="h-5 w-5 text-green-500" />
                    )}
                    <div>
                      <CardTitle className="text-base">
                        {rule.rule_kind === 'blackout' ? 'Reject Bookings' : 'Price Adjust'}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={rule.type === 'both' ? 'default' : 'secondary'}>
                          {rule.type === 'both' ? 'Arrive OR Return' : 
                           rule.type === 'arrival' ? 'When Arriving' : 'When Returning'}
                        </Badge>
                        {rule.rule_kind === 'surcharge' && rule.surcharge_amount && (
                          <Badge variant="outline" className="text-green-600">
                            +£{rule.surcharge_amount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRule(rule.id!)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-gray-700 mb-2">
                  {getRuleDescription(rule)}
                </p>
                {rule.notes && (
                  <p className="text-xs text-gray-500 italic">
                    Note: {rule.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BookingRuleDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setEditingRule(null)
        }}
        onSave={editingRule ? 
          (data) => handleUpdateRule(editingRule.id!, data) :
          handleCreateRule
        }
        rule={editingRule}
        tenantId={tenant.id}
      />
    </div>
  )
}

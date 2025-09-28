'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { createBookingRuleSchema, CreateBookingRule, BookingRule } from '@/lib/validation/booking-rules'

type BookingRuleDialogProps = {
  open: boolean
  onClose: () => void
  onSave: (data: CreateBookingRule) => void
  rule?: BookingRule | null
  tenantId: string
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' }
]

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
]

export default function BookingRuleDialog({ 
  open, 
  onClose, 
  onSave, 
  rule, 
  tenantId 
}: BookingRuleDialogProps) {
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [useSpecificDate, setUseSpecificDate] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm<CreateBookingRule>({
    resolver: zodResolver(createBookingRuleSchema),
    defaultValues: {
      tenant_id: tenantId,
      type: 'both',
      rule_kind: 'blackout',
      applies_to_days: null,
      specific_date: null,
      surcharge_amount: null,
      notes: ''
    },
    mode: 'onChange'
  })

  const ruleKind = watch('rule_kind')
  const specificDate = watch('specific_date')
  const ruleType = watch('type')
  
  // Debug logging
  console.log('Form values:', { ruleKind, ruleType, specificDate })

  // Reset form when dialog opens/closes or rule changes
  useEffect(() => {
    if (open) {
      if (rule) {
        // Editing existing rule
        reset({
          tenant_id: tenantId,
          type: rule.type,
          rule_kind: rule.rule_kind,
          applies_to_days: rule.applies_to_days,
          specific_date: rule.specific_date,
          surcharge_amount: rule.surcharge_amount,
          notes: rule.notes || ''
        })
        setSelectedDays(rule.applies_to_days || [])
        // Convert month range to date range (approximate)
        if ((rule as any).month_range) {
          const [startMonth, endMonth] = (rule as any).month_range
          setStartDate(`2024-${startMonth.toString().padStart(2, '0')}-01`)
          setEndDate(`2024-${endMonth.toString().padStart(2, '0')}-28`)
        }
        setUseSpecificDate(!!rule.specific_date)
      } else {
        // Creating new rule - ensure defaults are set
        reset({
          tenant_id: tenantId,
          type: 'both',
          rule_kind: 'blackout',
          applies_to_days: null,
          specific_date: null,
          surcharge_amount: null,
          notes: ''
        })
        setSelectedDays([])
        setStartDate('')
        setEndDate('')
        setUseSpecificDate(false)
      }
    }
  }, [open, rule, tenantId, reset])

  const handleDayToggle = (day: number) => {
    const newDays = selectedDays.includes(day)
      ? selectedDays.filter(d => d !== day)
      : [...selectedDays, day]
    
    setSelectedDays(newDays)
    setValue('applies_to_days', newDays.length > 0 ? newDays : null)
  }

  const handleStartDateChange = (date: string) => {
    setStartDate(date)
    if (date && endDate) {
      setValue('date_range_start', date)
      setValue('date_range_end', endDate)
    }
  }

  const handleEndDateChange = (date: string) => {
    setEndDate(date)
    if (startDate && date) {
      setValue('date_range_start', startDate)
      setValue('date_range_end', date)
    }
  }

  const handleSpecificDateToggle = (checked: boolean) => {
    setUseSpecificDate(checked)
    if (!checked) {
      setValue('specific_date', null)
    }
  }

  const onSubmit = (data: CreateBookingRule) => {
    console.log('Form submitted with data:', data)
    console.log('Selected days:', selectedDays)
    console.log('Start date:', startDate)
    console.log('End date:', endDate)
    console.log('Use specific date:', useSpecificDate)
    
    // Ensure the form data includes all the state
    const formData = {
      ...data,
      applies_to_days: selectedDays.length > 0 ? selectedDays : null,
      date_range_start: startDate || null,
      date_range_end: endDate || null,
      specific_date: useSpecificDate ? data.specific_date : null
    }
    
    console.log('Final form data:', formData)
    onSave(formData)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white border border-gray-200 shadow-xl">
        <DialogHeader>
          <DialogTitle>
            {rule ? 'Edit Booking Rule' : 'Create Booking Rule'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Rule Type */}
          <div className="space-y-2">
            <Label htmlFor="type">When Booking</Label>
            <Select
              value={ruleType}
              onValueChange={(value) => setValue('type', value as any)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select when rule applies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="arrival">Arrives on selected days</SelectItem>
                <SelectItem value="return">Returns on selected days</SelectItem>
                <SelectItem value="both">Arrives OR returns on selected days</SelectItem>
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-sm text-red-600">{errors.type.message}</p>
            )}
          </div>

          {/* Rule Kind */}
          <div className="space-y-2">
            <Label htmlFor="rule_kind">Action</Label>
            <Select
              value={ruleKind}
              onValueChange={(value) => setValue('rule_kind', value as any)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blackout">Reject Bookings</SelectItem>
                <SelectItem value="surcharge">Price Adjust</SelectItem>
              </SelectContent>
            </Select>
            {errors.rule_kind && (
              <p className="text-sm text-red-600">{errors.rule_kind.message}</p>
            )}
          </div>

          {/* Price Adjustment Amount */}
          {ruleKind === 'surcharge' && (
            <div className="space-y-2">
              <Label htmlFor="surcharge_amount">Price Adjustment (£)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...register('surcharge_amount', { valueAsNumber: true })}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500">
                Enter positive amount to add to booking price
              </p>
              {errors.surcharge_amount && (
                <p className="text-sm text-red-600">{errors.surcharge_amount.message}</p>
              )}
            </div>
          )}

          {/* Specific Date Override */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="use_specific_date"
                checked={useSpecificDate}
                onCheckedChange={handleSpecificDateToggle}
              />
              <Label htmlFor="use_specific_date">Apply to specific date only</Label>
            </div>
            {useSpecificDate && (
              <Input
                type="date"
                {...register('specific_date')}
              />
            )}
            {errors.specific_date && (
              <p className="text-sm text-red-600">{errors.specific_date.message}</p>
            )}
          </div>

          {/* Days of Week */}
          <div className="space-y-2">
            <Label>Days of Week</Label>
            <p className="text-xs text-gray-500 mb-2">
              Select which days of the week this rule applies to
            </p>
            <div className="grid grid-cols-4 gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={selectedDays.includes(day.value)}
                    onCheckedChange={() => handleDayToggle(day.value)}
                  />
                  <Label htmlFor={`day-${day.value}`} className="text-sm">
                    {day.label}
                  </Label>
                </div>
              ))}
            </div>
            {errors.applies_to_days && (
              <p className="text-sm text-red-600">{errors.applies_to_days.message}</p>
            )}
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label>Date Range</Label>
            <p className="text-xs text-gray-500 mb-2">
              Select the date range when this rule applies (optional)
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor="start_date" className="text-sm">From Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="end_date" className="text-sm">To Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              {...register('notes')}
              placeholder="Add any additional notes about this rule..."
              rows={3}
            />
            {errors.notes && (
              <p className="text-sm text-red-600">{errors.notes.message}</p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {rule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

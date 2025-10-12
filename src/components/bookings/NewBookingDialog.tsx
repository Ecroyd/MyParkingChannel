'use client'

import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'

const Schema = z.object({
  reference: z.string().optional(),
  customer_name: z.string().min(2, 'Name required'),
  customer_email: z.string().email('Valid email required'),
  customer_phone: z.string().optional(),
  plate: z.string().optional(),
  startAt: z.string().min(1, 'Start required'),
  endAt: z.string().min(1, 'End required'),
  money_charged: z.coerce.number().min(0).default(0),
  money_received: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  flight_number: z.string().optional(),
})

type FormValues = z.infer<typeof Schema>

export default function NewBookingDialog({
  onCreated,
  tenantId,
}: {
  onCreated?: (booking: any) => void
  tenantId?: string
}) {
  const [open, setOpen] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      reference: '',
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      plate: '',
      startAt: '',
      endAt: '',
      money_charged: 0,
      money_received: 0,
      notes: '',
      flight_number: '',
    },
  })

  async function onSubmit(values: FormValues) {
    const res = await fetch('/api/bookings/create', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, tenantId }),
    })
    const json = await res.json()
    if (!res.ok) {
      alert(json.error || 'Failed to create booking')
      return
    }
    alert(`Booking ${json.booking.reference} created`)
    setOpen(false)
    form.reset()
    onCreated?.(json.booking)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-brand-600 hover:bg-brand-700">+ New booking</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Reference (optional)</FormLabel>
                  <FormControl><Input placeholder="Leave blank to auto-generate" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customer_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customer_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customer_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (optional)</FormLabel>
                  <FormControl><Input type="tel" placeholder="+44 1234 567890" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="plate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle plate</FormLabel>
                  <FormControl><Input placeholder="ABC123" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="flight_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Flight number (optional)</FormLabel>
                  <FormControl><Input placeholder="BA123" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start (local)</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End (local)</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="money_charged"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Charged (£)</FormLabel>
                  <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="money_received"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Received (£)</FormLabel>
                  <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
              <Button type="submit">Create booking</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}


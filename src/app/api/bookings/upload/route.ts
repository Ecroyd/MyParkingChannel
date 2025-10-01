import { withTenant } from '@/lib/tenant/withTenant'
import { createTenantScopedClient } from '@/lib/rls/context'
import { requireUser } from '@/lib/auth/requireUser'
import { TenantContext } from '@/lib/tenant/resolveTenant'
import { uploadPreviewSchema } from '@/lib/validation/upload'
import { bookingSchema } from '@/lib/validation/booking'
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'
import { parseISO, format } from 'date-fns'

export const POST = withTenant(async (tenant: TenantContext, request: Request) => {
  const user = await requireUser()
  const supabase = await createTenantScopedClient(tenant, user.id)
  
  const body = await request.json()
  
  try {
    const validatedData = uploadPreviewSchema.parse(body)
    const { rows, mapping } = validatedData
    
    const results = {
      success: 0,
      errorCount: 0,
      updated: 0,
      created: 0,
      errors: [] as any[]
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      
      try {
        // Map row data to booking format
        const bookingData = {
          reference: row[mapping.reference],
          customer_name: row[mapping.customer_name],
          customer_email: row[mapping.customer_email],
          plate: mapping.plate ? row[mapping.plate] : undefined,
          car_make: mapping.car_make ? row[mapping.car_make] : undefined,
          car_model: mapping.car_model ? row[mapping.car_model] : undefined,
          car_color: mapping.car_color ? row[mapping.car_color] : undefined,
          start_at: zonedTimeToUtc(
            parseISO(row[mapping.start_at]), 
            tenant.timezone
          ).toISOString(),
          end_at: zonedTimeToUtc(
            parseISO(row[mapping.end_at]), 
            tenant.timezone
          ).toISOString(),
          money_charged: mapping.money_charged ? parseFloat(row[mapping.money_charged]) : 0,
          money_received: mapping.money_received ? parseFloat(row[mapping.money_received]) : 0,
          notes: mapping.notes ? row[mapping.notes] : undefined,
          source: 'manual' as const
        }

        // Validate booking data
        const validatedBooking = bookingSchema.parse(bookingData)

        // Check if booking already exists by reference
        const { data: existingBooking } = await supabase
          .from('bookings')
          .select('id')
          .eq('tenant_id', tenant.tenant_id)
          .eq('reference', validatedBooking.reference)
          .single()

        if (existingBooking) {
          // Update existing booking
          const { error: updateError } = await supabase
            .from('bookings')
            .update(validatedBooking)
            .eq('id', existingBooking.id)
            .eq('tenant_id', tenant.tenant_id)

          if (updateError) {
            results.errorCount++
            results.errors.push({
              row: i + 1,
              reference: validatedBooking.reference,
              error: updateError.message
            })
          } else {
            results.updated++
            results.success++
          }
        } else {
          // Create new booking
          const { error: insertError } = await supabase
            .from('bookings')
            .insert({
              ...validatedBooking,
              tenant_id: tenant.tenant_id
            })

          if (insertError) {
            results.errorCount++
            results.errors.push({
              row: i + 1,
              reference: validatedBooking.reference,
              error: insertError.message
            })
          } else {
            results.created++
            results.success++
          }
        }
      } catch (error: any) {
        results.errorCount++
        results.errors.push({
          row: i + 1,
          reference: row[mapping.reference] || 'Unknown',
          error: error.message
        })
      }
    }

    // Log audit event
    await supabase
      .from('audit_logs')
      .insert({
        tenant_id: tenant.tenant_id,
        actor_user_id: user.id,
        action: 'bulk_upload',
        entity: 'booking',
        metadata: {
          total_rows: rows.length,
          results
        }
      })

    return Response.json(results)
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 400 })
  }
})


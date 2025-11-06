import { withTenant } from '@/lib/tenant/withTenant'
import { createTenantScopedClient } from '@/lib/rls/context'
import { requireUser } from '@/lib/auth/requireUser'
import { TenantContext } from '@/lib/tenant/resolveTenant'
import { uploadPreviewSchema } from '@/lib/validation/upload'
import { bookingSchema } from '@/lib/validation/booking'

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
        // Parse dates using Postgres function (handles all formats, converts to UTC)
        const tz = 'Europe/London'; // per-tenant later if needed
        const startRaw = row[mapping.start_at];
        const endRaw = row[mapping.end_at];

        // Use RPC function to parse and normalize to UTC in the database
        const { data: parsed, error: parseErr } = await supabase
          .rpc('normalise_booking_times', {
            p_start: startRaw,
            p_end: endRaw,
            p_tz: tz
          });

        if (parseErr || !parsed || parsed.length === 0) {
          throw new Error(`Failed to parse dates: ${parseErr?.message || 'No result'}`);
        }

        const { start_utc, end_utc } = parsed[0];

        if (!start_utc || !end_utc) {
          throw new Error('Invalid dates: start_at or end_at is null');
        }

        // Map row data to booking format
        const bookingData = {
          reference: row[mapping.reference],
          customer_name: row[mapping.customer_name],
          customer_email: row[mapping.customer_email],
          plate: mapping.plate ? row[mapping.plate] : undefined,
          car_make: mapping.car_make ? row[mapping.car_make] : undefined,
          car_model: mapping.car_model ? row[mapping.car_model] : undefined,
          car_color: mapping.car_color ? row[mapping.car_color] : undefined,
          start_at: start_utc, // Already UTC from Postgres
          end_at: end_utc,     // Already UTC from Postgres
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


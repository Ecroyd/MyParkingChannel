'use server'
import { cookies } from 'next/headers'

export async function rememberTenant(slug: string) {
  (await cookies()).set('tenant_slug', slug, { path: '/', maxAge: 60*60*24*365 })
}


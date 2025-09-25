declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Supabase Configuration
      NEXT_PUBLIC_SUPABASE_URL: string
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string
      SUPABASE_SERVICE_ROLE_KEY: string
      
      // Site Configuration
      NEXT_PUBLIC_SITE_URL: string
      APP_BASE_DOMAIN: string
      NEXT_PUBLIC_APP_BASE_DOMAIN: string
      
      // Feature Flags
      NEXT_PUBLIC_ENABLE_SELF_SIGNUP: string
      
      // Encryption
      ENCRYPTION_KEY: string
      
      // Email Providers (optional)
      RESEND_API_KEY?: string
      SENDGRID_API_KEY?: string
      POSTMARK_API_KEY?: string
      
      // Parking Partner APIs (optional)
      PARKVIA_API_KEY?: string
      HOLIDAYEXTRAS_API_KEY?: string
    }
  }
}

export {}

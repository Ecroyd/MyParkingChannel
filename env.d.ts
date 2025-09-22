declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_SUPABASE_URL: string
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string
      SUPABASE_SERVICE_ROLE_KEY: string
      APP_BASE_DOMAIN: string
      NEXT_PUBLIC_APP_BASE_DOMAIN: string
      ENCRYPTION_KEY: string
    }
  }
}

export {}

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// API helper function that prefixes requests with "/api" and sets tenant headers
export const api = async (url: string, options: RequestInit = {}) => {
  const fullUrl = url.startsWith('/api') ? url : `/api${url}`
  
  const defaultOptions: RequestInit = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }

  return fetch(fullUrl, { ...defaultOptions, ...options })
}
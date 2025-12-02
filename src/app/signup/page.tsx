'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { confirmUserAfterSignup } from './actions'

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  
  const supabase = createClient()

  // Pre-fill username from query params if provided
  useEffect(() => {
    const usernameParam = searchParams.get('username')
    if (usernameParam) {
      setUsername(usernameParam)
    }
  }, [searchParams])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    setLoading(true)
    setError('')

    if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) {
      setError('Username is required and can only contain letters, numbers, underscores, and hyphens')
      setLoading(false)
      return
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    try {
      console.log('📝 [SIGNUP] Starting signup process...');
      console.log('📝 [SIGNUP] Username:', username);
      
      // Generate a valid email for Supabase (required by Supabase Auth)
      // Format: username@users.myparkingchannel.app
      // Using a subdomain ensures valid email format while keeping usernames unique
      const fakeEmail = `${username}@users.myparkingchannel.app`
      console.log('📝 [SIGNUP] Generated email:', fakeEmail);
      
      console.log('📝 [SIGNUP] Calling signUp...');
      const { data, error } = await supabase.auth.signUp({
        email: fakeEmail,
        password,
        options: {
          data: {
            username: username, // Store actual username in metadata
          },
        },
      })

      if (error) {
        console.error('❌ [SIGNUP] SignUp error:', error);
        console.error('❌ [SIGNUP] Error message:', error.message);
        console.error('❌ [SIGNUP] Error status:', error.status);
        setError(error.message || 'Signup failed')
        setLoading(false)
        return
      }

      console.log('✅ [SIGNUP] SignUp succeeded');
      console.log('✅ [SIGNUP] User ID:', data?.user?.id);
      console.log('✅ [SIGNUP] User data:', data?.user);
      console.log('✅ [SIGNUP] Session:', data?.session);

      // If signup succeeded, auto-confirm the user (since we use fake emails)
      if (data?.user?.id) {
        console.log('📝 [SIGNUP] Auto-confirming user...');
        const confirmResult = await confirmUserAfterSignup(data.user.id)
        if (!confirmResult.success) {
          console.error('❌ [SIGNUP] Failed to auto-confirm user:', confirmResult.error)
          setError('Account created but failed to confirm. Please try logging in.')
          setLoading(false)
          return
        }
        console.log('✅ [SIGNUP] User confirmed');

        // After confirming, sign the user in
        console.log('📝 [SIGNUP] Signing user in...');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password,
        })

        if (signInError) {
          console.error('❌ [SIGNUP] Failed to sign in after confirmation:', signInError);
          console.error('❌ [SIGNUP] SignIn error message:', signInError.message);
          console.error('❌ [SIGNUP] SignIn error status:', signInError.status);
          setError('Account created but failed to sign in. Please try logging in manually.')
          setLoading(false)
          return
        }

        console.log('✅ [SIGNUP] Sign in succeeded');
        console.log('✅ [SIGNUP] SignIn session:', signInData?.session);

        // Wait a moment for cookies to be set, then use window.location for full page reload
        // This ensures cookies are available to the server on the next request
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Check if there's a redirect param
        const redirectParam = searchParams.get('redirect')
        if (redirectParam) {
          console.log('📝 [SIGNUP] Redirecting to:', redirectParam);
          window.location.href = redirectParam
          return
        } else {
          console.log('📝 [SIGNUP] Redirecting to /admin');
          window.location.href = '/admin'
          return
        }
      } else {
        console.error('❌ [SIGNUP] No user ID returned');
        setError('Account creation failed - no user ID returned')
        setLoading(false)
      }
    } catch (err: any) {
      console.error('❌ [SIGNUP] Unexpected error:', err);
      console.error('❌ [SIGNUP] Error stack:', err.stack);
      setError(err.message || 'An unexpected error occurred')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Check your email</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-4">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Account created successfully!</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Your account with username <strong>{username}</strong> has been created.
                </p>
              </div>
              <div className="space-y-2">
                <Button onClick={() => router.push('/login')} className="w-full">
                  Go to Login
                </Button>
                <Button 
                  onClick={() => {
                    setSuccess(false)
                    setUsername('')
                    setPassword('')
                  }} 
                  variant="outline" 
                  className="w-full"
                >
                  Create another account
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Create your account</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSignup}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  pattern="[a-zA-Z0-9_-]+"
                  title="Username can only contain letters, numbers, underscores, and hyphens"
                  placeholder="johndoe"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Letters, numbers, underscores, and hyphens only
                </p>
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-blue-600 hover:text-blue-500">
                Already have an account? Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}


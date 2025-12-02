'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, LogIn, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🔐 [LOGIN] Starting login process...');
    setLoading(true);
    setError('');

    try {
      const input = emailOrUsername.trim();
      console.log('🔐 [LOGIN] Input:', input);
      
      // If input doesn't contain @, treat it as username and convert to valid email format
      const loginEmail = input.includes('@') ? input : `${input}@users.myparkingchannel.app`;
      console.log('🔐 [LOGIN] Using email:', loginEmail);

      console.log('🔐 [LOGIN] Attempting signInWithPassword...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) {
        console.error('❌ [LOGIN] Error:', error);
        console.error('❌ [LOGIN] Error message:', error.message);
        console.error('❌ [LOGIN] Error status:', error.status);
        setError(error.message || 'Login failed');
        setLoading(false);
        return;
      }

      console.log('✅ [LOGIN] SignInWithPassword succeeded');
      console.log('✅ [LOGIN] User data:', data?.user);
      console.log('✅ [LOGIN] Session data:', data?.session);

      // Wait a bit for session to be set
      await new Promise(resolve => setTimeout(resolve, 100));

      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ [LOGIN] Session error:', sessionError);
      }

      console.log('🔐 [LOGIN] Retrieved session:', session);

      if (session) {
        console.log('✅ [LOGIN] Session is set, redirecting');
        // Wait a moment for cookies to be set, then use window.location for full page reload
        // This ensures cookies are available to the server on the next request
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Check for redirect param - respect invite flow
        const redirectParam = searchParams.get('redirect');
        const redirectTo = redirectParam || '/admin';
        console.log('🔐 [LOGIN] Redirecting to:', redirectTo);
        window.location.href = redirectTo;
      } else {
        console.error('❌ [LOGIN] No session after login');
        setError('Login failed to set session. Please try again.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('❌ [LOGIN] Unexpected error:', err);
      console.error('❌ [LOGIN] Error stack:', err.stack);
      setError(err.message || 'An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back to Home Link */}
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-sky-100 rounded-lg flex items-center justify-center mb-4">
              <LogIn className="h-6 w-6 text-sky-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Welcome Back
            </CardTitle>
            <p className="text-slate-600">
              Sign in to your My Parking Channel account
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div>
                <Label htmlFor="emailOrUsername" className="text-sm font-medium text-slate-700">
                  Username or Email
                </Label>
                <Input
                  id="emailOrUsername"
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="Enter your username or email"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Password
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-slate-700 focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-600">
                Don't have an account?{' '}
                <Link href="/signup" className="text-sky-600 hover:text-sky-700 font-medium">
                  Sign up
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Additional Info */}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            Need help? Contact our support team at{' '}
            <a href="mailto:support@myparkingchannel.com" className="text-sky-600 hover:text-sky-700">
              support@myparkingchannel.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error('Login error:', error.message);
        setError(error.message);
        setLoading(false);
        return;
      }

      console.log('Login success:', data);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        console.log('✅ Session is set, redirecting to admin');
        // Redirect to /admin which will handle tenant detection
        router.push('/admin');
      } else {
        setError('Login failed to set session');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
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
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
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
                <Link href="/" className="text-sky-600 hover:text-sky-700 font-medium">
                  Apply for early access
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

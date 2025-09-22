'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DebugPage() {
  const [user, setUser] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cookies, setCookies] = useState<string[]>([])
  
  const supabase = createClient()

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        console.log('Debug - User:', user)
        console.log('Debug - Session:', session)
        console.log('Debug - User Error:', userError)
        console.log('Debug - Session Error:', sessionError)
        
        setUser(user)
        setSession(session)
        
        // Get cookies
        setCookies(document.cookie.split(';').map(c => c.trim()))
        
      } catch (err) {
        console.error('Debug error:', err)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'jcecroyd@gmail.com',
      password: 'your-password-here' // Replace with your actual password
    })
    
    console.log('Debug login result:', { data, error })
    
    if (data) {
      setUser(data.user)
      setSession(data.session)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setCookies([])
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Supabase Auth Debug</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">User Status:</h3>
            <pre className="bg-gray-100 p-2 rounded text-sm">
              {user ? JSON.stringify(user, null, 2) : 'No user'}
            </pre>
          </div>
          
          <div>
            <h3 className="font-semibold">Session Status:</h3>
            <pre className="bg-gray-100 p-2 rounded text-sm">
              {session ? JSON.stringify(session, null, 2) : 'No session'}
            </pre>
          </div>
          
          <div>
            <h3 className="font-semibold">Cookies:</h3>
            <pre className="bg-gray-100 p-2 rounded text-sm">
              {cookies.length > 0 ? cookies.join('\n') : 'No cookies'}
            </pre>
          </div>
          
          <div className="flex space-x-4">
            <Button onClick={handleLogin}>
              Test Login
            </Button>
            <Button onClick={handleLogout} variant="outline">
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


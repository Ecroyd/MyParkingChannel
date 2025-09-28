import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, company, message } = body;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' }, 
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Save to applications table
    const { data, error } = await supabase
      .from('applications')
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        company: company?.trim() || null,
        message: message?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving application:', error);
      return NextResponse.json(
        { error: 'Failed to save application' }, 
        { status: 500 }
      );
    }

    console.log('New application received:', { id: data.id, email: data.email, company: data.company });

    return NextResponse.json({ 
      success: true, 
      message: 'Application submitted successfully',
      id: data.id 
    });

  } catch (error: any) {
    console.error('Apply API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

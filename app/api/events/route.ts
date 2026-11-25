import { NextResponse } from 'next/server';
import { logEvent } from '../../../lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, variant, event_name, metadata } = body;

    if (!user_id || !event_name) {
      return NextResponse.json({ error: 'user_id and event_name are required' }, { status: 400 });
    }

    logEvent({
      event_id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id,
      variant: variant || 'minimal',
      event_name,
      metadata
    });

    return NextResponse.json({ success: true, event_name, user_id });
  } catch (error: any) {
    console.error('Error logging event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

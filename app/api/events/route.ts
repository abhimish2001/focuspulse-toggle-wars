import { NextResponse } from 'next/server';
import { logEvent } from '../../../lib/db';

const ALLOWED_VARIANTS = new Set(['minimal', 'gamified']);
const ALLOWED_EVENTS = new Set([
  'experiment_exposed',
  'session_started',
  'session_abandoned',
  'session_completed',
]);

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const body = rawBody ? JSON.parse(rawBody) : {};
    const { event_id, user_id, variant, event_name, metadata } = body;

    if (!user_id || !event_name) {
      return NextResponse.json({ error: 'user_id and event_name are required' }, { status: 400 });
    }

    if (!ALLOWED_EVENTS.has(event_name)) {
      return NextResponse.json({ error: `Unsupported event_name: ${event_name}` }, { status: 400 });
    }

    const safeVariant = ALLOWED_VARIANTS.has(variant) ? variant : 'minimal';
    const resolvedEventId =
      typeof event_id === 'string' && event_id.trim().length > 0
        ? event_id.trim()
        : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const result = logEvent({
      event_id: resolvedEventId,
      user_id: String(user_id),
      variant: safeVariant,
      event_name,
      metadata,
    });

    return NextResponse.json({
      success: true,
      deduplicated: !result.inserted,
      event_id: resolvedEventId,
      event_name,
      user_id,
    });
  } catch (error: any) {
    console.error('Error logging event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

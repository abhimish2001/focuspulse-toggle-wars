import { NextResponse } from 'next/server';
import { logEvent } from '../../../lib/db';

const ALLOWED_VARIANTS = new Set(['minimal', 'gamified']);
const ALLOWED_EVENTS = new Set([
  'experiment_exposed',
  'session_started',
  'session_abandoned',
  'session_completed',
]);

const FLAGSMITH_EVENTS_ENDPOINT = 'https://events.api.flagsmith.com/v1/events';

async function forwardAbandonmentToFlagsmith(
  userId: string,
  metadata: Record<string, any> | undefined
) {
  const envKey = process.env.NEXT_PUBLIC_FLAGSMITH_ENV_KEY?.trim();
  if (!envKey) return;

  const elapsed =
    typeof metadata?.elapsed_seconds === 'number' ? String(metadata.elapsed_seconds) : null;

  try {
    await fetch(FLAGSMITH_EVENTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Environment-Key': envKey,
      },
      body: JSON.stringify({
        events: [
          {
            event: 'session_abandoned',
            feature_name: null,
            identifier: userId,
            value: elapsed,
            traits: null,
            metadata: {
              ...(metadata || {}),
              forwarded_from: 'next_api_events',
            },
            timestamp: Date.now(),
          },
        ],
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.warn('[Flagsmith] Server-side abandonment forward skipped:', err);
  }
}

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

    // Forward tab-close / API abandonments to Flagsmith Cloud when not already sent by client SDK
    if (
      event_name === 'session_abandoned' &&
      result.inserted &&
      !metadata?.forwarded_by_client
    ) {
      await forwardAbandonmentToFlagsmith(String(user_id), metadata);
    }

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

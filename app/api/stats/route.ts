import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getExperimentStats, logEvent, resetDatabase, getAllEventsForExport } from '../../../lib/db';

/** Constant-time comparison against ADMIN_SECRET to protect admin mutations. */
function isAuthorizedAdmin(provided: string, expected: string | undefined): boolean {
  const expectedTrimmed = expected?.trim();
  const providedTrimmed = provided.trim();
  if (!expectedTrimmed || !providedTrimmed) return false;

  const a = Buffer.from(providedTrimmed, 'utf8');
  const b = Buffer.from(expectedTrimmed, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format');
    const filterNoise = searchParams.get('filterNoise') !== 'false';
    const includeDemo = searchParams.get('includeDemo') !== 'false';

    // Raw Export Support: CSV or JSON
    if (format === 'csv') {
      const events = getAllEventsForExport();
      const headers = ['id', 'event_id', 'user_id', 'variant', 'event_name', 'timestamp', 'metadata'];
      const csvRows = [headers.join(',')];

      for (const e of events) {
        const metaEscaped = `"${(e.metadata || '').replace(/"/g, '""')}"`;
        csvRows.push([e.id, e.event_id, e.user_id, e.variant, e.event_name, e.timestamp, metaEscaped].join(','));
      }

      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="focuspulse_events_export.csv"',
        },
      });
    }

    if (format === 'json') {
      const events = getAllEventsForExport();
      return new NextResponse(JSON.stringify(events, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="focuspulse_events_export.json"',
        },
      });
    }

    const stats = getExperimentStats(filterNoise, includeDemo);
    return NextResponse.json({ success: true, ...stats });
  } catch (error: any) {
    console.error('Error in stats route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const headerSecret = req.headers.get('x-admin-secret') || '';
    const bodySecret = typeof body?.secret === 'string' ? body.secret : '';
    const providedSecret = headerSecret || bodySecret;

    if (!isAuthorizedAdmin(providedSecret, process.env.ADMIN_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized admin action' }, { status: 401 });
    }

    const action = body.action || 'simulate';

    if (action === 'reset') {
      resetDatabase();
      return NextResponse.json({ success: true, message: 'Database reset successfully' });
    }

    // Generate batch of realistic user sessions
    const count = body.count || 20;
    const batchTs = Date.now().toString(36);
    for (let i = 0; i < count; i++) {
      const simUser = `sim_${batchTs}_${Math.random().toString(36).substring(2, 6)}`;
      const variant = i % 2 === 0 ? 'minimal' : 'gamified';
      const sessionUuid = `sess_sim_${batchTs}_${i}`;

      logEvent({
        event_id: `exp_${simUser}`,
        user_id: simUser,
        variant,
        event_name: 'experiment_exposed',
        metadata: { source: 'simulated_traffic', is_demo_mode: false }
      });

      if (Math.random() < 0.90) {
        logEvent({
          event_id: `start_${sessionUuid}`,
          user_id: simUser,
          variant,
          event_name: 'session_started',
          metadata: { duration_seconds: 1500, is_demo_mode: false, session_uuid: sessionUuid }
        });

        const completionChance = variant === 'gamified' ? 0.75 : 0.45;
        if (Math.random() < completionChance) {
          logEvent({
            event_id: `comp_${sessionUuid}`,
            user_id: simUser,
            variant,
            event_name: 'session_completed',
            metadata: { xp_earned: variant === 'gamified' ? 120 : 0, is_demo_mode: false, session_uuid: sessionUuid }
          });
        } else {
          // Some abandoned sessions are realistic (>10s), some are accidental click noise (<10s)
          const elapsed = Math.random() < 0.15 ? Math.floor(Math.random() * 8) : Math.floor(Math.random() * 500) + 15;
          logEvent({
            event_id: `aban_${sessionUuid}`,
            user_id: simUser,
            variant,
            event_name: 'session_abandoned',
            metadata: { elapsed_seconds: elapsed, is_noise: elapsed < 10, is_demo_mode: false, session_uuid: sessionUuid }
          });
        }
      }
    }

    const updated = getExperimentStats(true, true);
    return NextResponse.json({ success: true, message: `Simulated ${count} users`, ...updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

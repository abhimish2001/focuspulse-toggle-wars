import { NextResponse } from 'next/server';
import { getExperimentStats, logEvent, resetDatabase, getAllEventsForExport } from '../../../lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format');
    const filterNoise = searchParams.get('filterNoise') !== 'false';

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

    const stats = getExperimentStats(filterNoise);
    return NextResponse.json({ success: true, ...stats });
  } catch (error: any) {
    console.error('Error in stats route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'simulate';

    if (action === 'reset') {
      resetDatabase();
      return NextResponse.json({ success: true, message: 'Database reset successfully' });
    }

    // Generate batch of realistic user sessions
    const count = body.count || 20;
    for (let i = 0; i < count; i++) {
      const simUser = `sim_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const variant = i % 2 === 0 ? 'minimal' : 'gamified';

      logEvent({
        event_id: `evt_sim_${Date.now()}_${i}_exp`,
        user_id: simUser,
        variant,
        event_name: 'experiment_exposed',
        metadata: { source: 'simulated_traffic', is_demo_mode: false }
      });

      if (Math.random() < 0.90) {
        logEvent({
          event_id: `evt_sim_${Date.now()}_${i}_start`,
          user_id: simUser,
          variant,
          event_name: 'session_started',
          metadata: { duration_minutes: 25, is_demo_mode: false }
        });

        const completionChance = variant === 'gamified' ? 0.75 : 0.45;
        if (Math.random() < completionChance) {
          logEvent({
            event_id: `evt_sim_${Date.now()}_${i}_comp`,
            user_id: simUser,
            variant,
            event_name: 'session_completed',
            metadata: { xp_earned: variant === 'gamified' ? 120 : 0, is_demo_mode: false }
          });
        } else {
          // Some abandoned sessions are realistic (>10s), some are accidental click noise (<10s)
          const elapsed = Math.random() < 0.2 ? Math.floor(Math.random() * 8) : Math.floor(Math.random() * 500) + 15;
          logEvent({
            event_id: `evt_sim_${Date.now()}_${i}_aban`,
            user_id: simUser,
            variant,
            event_name: 'session_abandoned',
            metadata: { elapsed_seconds: elapsed, is_demo_mode: false }
          });
        }
      }
    }

    const updated = getExperimentStats(true);
    return NextResponse.json({ success: true, message: `Simulated ${count} users`, ...updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

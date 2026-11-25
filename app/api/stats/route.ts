import { NextResponse } from 'next/server';
import { getExperimentStats, logEvent, resetDatabase } from '../../../lib/db';

export async function GET() {
  try {
    const stats = getExperimentStats();
    return NextResponse.json({ success: true, ...stats });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
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

    // Simulate batch of test users
    const count = body.count || 24;
    for (let i = 0; i < count; i++) {
      const simUser = `sim_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const variant = i % 2 === 0 ? 'minimal' : 'gamified';

      // 1. Exposure
      logEvent({
        event_id: `evt_sim_${Date.now()}_${i}_exp`,
        user_id: simUser,
        variant,
        event_name: 'experiment_exposed',
        metadata: { source: 'simulated_traffic' }
      });

      // 2. Session Started (90% of exposed users start)
      if (Math.random() < 0.90) {
        logEvent({
          event_id: `evt_sim_${Date.now()}_${i}_start`,
          user_id: simUser,
          variant,
          event_name: 'session_started',
          metadata: { duration_minutes: 25 }
        });

        // 3. Completion rate differs by hypothesis:
        // Minimal baseline completion: ~45%
        // Gamified enhanced completion: ~75%
        const completionChance = variant === 'gamified' ? 0.75 : 0.45;
        if (Math.random() < completionChance) {
          logEvent({
            event_id: `evt_sim_${Date.now()}_${i}_comp`,
            user_id: simUser,
            variant,
            event_name: 'session_completed',
            metadata: { xp_earned: variant === 'gamified' ? 120 : 0 }
          });
        } else {
          logEvent({
            event_id: `evt_sim_${Date.now()}_${i}_aban`,
            user_id: simUser,
            variant,
            event_name: 'session_abandoned',
            metadata: { elapsed_seconds: Math.floor(Math.random() * 600) }
          });
        }
      }
    }

    const updated = getExperimentStats();
    return NextResponse.json({ success: true, message: `Simulated ${count} users`, ...updated });
  } catch (error: any) {
    console.error('Error handling stats action:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Production Health & Telemetry Verification Suite
 * Can be run manually or as part of GitHub Actions CI/CD.
 */

const BASE_URL = process.env.TARGET_URL || 'https://focuspulse-toggle-wars.onrender.com';

async function runHealthCheck() {
  console.log(`\n========================================`);
  console.log(` FocusPulse Live Production Verification `);
  console.log(` Target: ${BASE_URL}`);
  console.log(` Time: ${new Date().toISOString()}`);
  console.log(`========================================\n`);

  let failures = 0;

  async function check(name, fn) {
    const start = performance.now();
    try {
      await fn();
      const duration = Math.round(performance.now() - start);
      console.log(` PASS [${duration}ms] - ${name}`);
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      console.error(` FAIL [${duration}ms] - ${name}`);
      console.error(`       Error: ${err.message}`);
      failures++;
    }
  }

  // 1. Landing Page Health
  await check('GET / (Landing Page & Flagsmith Loader)', async () => {
    const res = await fetch(`${BASE_URL}/`, { cache: 'no-store' });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('FocusPulse')) throw new Error('Missing title in HTML');
  });

  // 2. Results Dashboard
  await check('GET /results (Analytics Dashboard)', async () => {
    const res = await fetch(`${BASE_URL}/results`, { cache: 'no-store' });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('FocusPulse')) throw new Error('Missing FocusPulse in HTML');
  });

  // 3. Live Stats API
  await check('GET /api/stats (Live SQLite Metric Rollup)', async () => {
    const res = await fetch(`${BASE_URL}/api/stats`, { cache: 'no-store' });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.summary) throw new Error('Malformed stats payload');
  });

  // 4. CSV Telemetry Export
  await check('GET /api/stats?format=csv (Raw Audit Log Export)', async () => {
    const res = await fetch(`${BASE_URL}/api/stats?format=csv`, { cache: 'no-store' });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('csv')) throw new Error(`Unexpected Content-Type: ${ct}`);
  });

  // 5. Ingestion & Deduplication Check
  await check('POST /api/events (Telemetry Ingestion & Idempotency)', async () => {
    const testId = `ci_ping_${Date.now()}`;
    const payload = {
      event_id: testId,
      user_id: `ci_user_${Math.random().toString(36).substring(2, 7)}`,
      variant: 'gamified',
      event_name: 'experiment_exposed',
      metadata: { source: 'ci_health_check', is_demo_mode: true }
    };

    const res1 = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res1.status !== 200) throw new Error(`Initial event returned ${res1.status}`);

    const res2 = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d2 = await res2.json();
    if (d2.deduplicated !== true) throw new Error('Idempotent event was not deduplicated');
  });

  console.log(`\n========================================`);
  if (failures === 0) {
    console.log(` ALL CHECKS PASSED: Service is Healthy!`);
    console.log(`========================================\n`);
    process.exit(0);
  } else {
    console.error(` ${failures} CHECK(S) FAILED!`);
    console.log(`========================================\n`);
    process.exit(1);
  }
}

runHealthCheck();

import { NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

const FLAGSMITH_API_BASE = 'https://api.flagsmith.com/api/v1';

function getExperimentConfig() {
  const envId =
    process.env.FLAGSMITH_ENV_ID?.trim() ||
    process.env.NEXT_PUBLIC_FLAGSMITH_ENV_KEY?.trim() ||
    'esMZQYfcANsHcmozTaXb6F';
  const expId = process.env.FLAGSMITH_EXPERIMENT_ID?.trim() || '451';
  const token = process.env.FLAGSMITH_API_TOKEN?.trim() || '';
  const dashboardUrl = `https://app.flagsmith.com/project/55855/environment/${envId}/experiments/${expId}`;
  return { envId, expId, token, dashboardUrl };
}

async function fetchFlagsmithAdmin(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const buildInit = (scheme: 'Api-Key' | 'Token'): RequestInit => ({
    ...options,
    headers: {
      Authorization: `${scheme} ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });

  const res = await fetch(url, buildInit('Api-Key'));
  if (res.status === 401) {
    return fetch(url, buildInit('Token'));
  }
  return res;
}

async function fetchExperimentSnapshot(envId: string, expId: string, token: string, dashboardUrl: string) {
  const expBase = `${FLAGSMITH_API_BASE}/environments/${encodeURIComponent(envId)}/experiments/${encodeURIComponent(expId)}`;
  const [metaRes, resultsRes] = await Promise.all([
    fetchFlagsmithAdmin(`${expBase}/`, token),
    fetchFlagsmithAdmin(`${expBase}/results/`, token),
  ]);

  if (!metaRes.ok || !resultsRes.ok) {
    return {
      configured: true,
      error: `Flagsmith API returned ${!metaRes.ok ? metaRes.status : resultsRes.status}`,
      experimentId: expId,
      envId,
      dashboardUrl,
      status: null,
      chance_to_win: null,
      relative_lift: null,
      ci_low: null,
      ci_high: null,
      srm_p_value: null,
    };
  }

  const metaData = await metaRes.json();
  const resultsData = await resultsRes.json();

  const payload = resultsData?.results?.payload || null;
  const primaryMetric = payload?.metrics?.[0] || null;
  const inferenceMap = primaryMetric?.inference || {};
  const challengerKey = Object.keys(inferenceMap)[0] || null;
  const inference = challengerKey ? inferenceMap[challengerKey] : null;

  return {
    configured: true,
    experimentId: expId,
    envId,
    dashboardUrl,
    status: metaData?.status || null,
    name: metaData?.name || null,
    as_of: resultsData?.results?.as_of || null,
    challenger: challengerKey,
    variants: primaryMetric?.variants || null,
    chance_to_win: typeof inference?.chance_to_win === 'number' ? inference.chance_to_win : null,
    relative_lift: typeof inference?.lift === 'number' ? inference.lift : null,
    ci_low: typeof inference?.ci_low === 'number' ? inference.ci_low : null,
    ci_high: typeof inference?.ci_high === 'number' ? inference.ci_high : null,
    srm_p_value: payload?.srm_p_value ?? null,
  };
}

export async function GET() {
  const { envId, expId, token, dashboardUrl } = getExperimentConfig();

  if (!token) {
    return NextResponse.json({
      configured: false,
      experimentId: expId,
      envId,
      dashboardUrl,
      status: null,
      chance_to_win: null,
      relative_lift: null,
      ci_low: null,
      ci_high: null,
      srm_p_value: null,
    });
  }

  try {
    const snapshot = await fetchExperimentSnapshot(envId, expId, token, dashboardUrl);
    return NextResponse.json(snapshot);
  } catch (error: any) {
    console.warn('[Flagsmith] Failed to fetch experiment results:', error?.message || error);
    return NextResponse.json({
      configured: true,
      error: error?.message || 'Failed to fetch Flagsmith experiment results',
      experimentId: expId,
      envId,
      dashboardUrl,
      status: null,
      chance_to_win: null,
      relative_lift: null,
      ci_low: null,
      ci_high: null,
      srm_p_value: null,
    });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (!isAuthorizedAdmin(req, body)) {
    return NextResponse.json({ error: 'Unauthorized admin action' }, { status: 401 });
  }

  const { envId, expId, token, dashboardUrl } = getExperimentConfig();
  if (!token) {
    return NextResponse.json(
      { configured: false, error: 'FLAGSMITH_API_TOKEN is not configured on the server.' },
      { status: 400 }
    );
  }

  try {
    const refreshUrl = `${FLAGSMITH_API_BASE}/environments/${encodeURIComponent(envId)}/experiments/${encodeURIComponent(expId)}/results/refresh/`;
    const refreshRes = await fetchFlagsmithAdmin(refreshUrl, token, { method: 'POST' });

    if (refreshRes.status === 429) {
      return NextResponse.json(
        {
          rateLimited: true,
          error: 'Flagsmith allows refreshing Bayesian results once every 5 minutes. Please wait before trying again.',
        },
        { status: 429 }
      );
    }

    if (!refreshRes.ok) {
      const errText = await refreshRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Flagsmith refresh returned ${refreshRes.status}${errText ? `: ${errText}` : ''}` },
        { status: refreshRes.status }
      );
    }

    const snapshot = await fetchExperimentSnapshot(envId, expId, token, dashboardUrl);
    return NextResponse.json({ ...snapshot, refreshed: true });
  } catch (error: any) {
    console.warn('[Flagsmith] Failed to refresh experiment results:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to refresh Flagsmith Bayesian results' },
      { status: 500 }
    );
  }
}

import flagsmith from '@flagsmith/flagsmith';

export type FocusVariant = 'minimal' | 'gamified';

const FLAG_NAME = 'focus_experience_variant';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Retrieves or initializes a persistent anonymous user identifier
 */
export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'server_user';

  let id = localStorage.getItem('fp_user_id') || getCookie('fp_user_id');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 10);
  }

  localStorage.setItem('fp_user_id', id);
  document.cookie = `fp_user_id=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
  return id;
}

/**
 * Resets the user identifier to simulate a new test visitor
 */
export function resetUserId(): string {
  if (typeof window === 'undefined') return 'new_user';
  const newId = 'user_' + Math.random().toString(36).substring(2, 10);
  localStorage.setItem('fp_user_id', newId);
  document.cookie = `fp_user_id=${encodeURIComponent(newId)}; path=/; max-age=31536000; SameSite=Lax`;
  return newId;
}

let isInitialized = false;
let initPromise: Promise<void> | null = null;
let lastResolvedSource: 'flagsmith' | 'fallback' = 'fallback';
const variantListeners = new Set<(variant: FocusVariant) => void>();

export function getFlagSource(): 'flagsmith' | 'fallback' {
  return lastResolvedSource;
}

/**
 * Subscribes to live Flagsmith SSE variant updates (e.g. when rolling out an experiment winner).
 */
export function subscribeVariantChange(listener: (variant: FocusVariant) => void): () => void {
  variantListeners.add(listener);
  return () => {
    variantListeners.delete(listener);
  };
}

function getViewportTraits(): Record<string, string | number | boolean> {
  if (typeof window === 'undefined') return {};
  return {
    viewport: window.innerWidth < 768 ? 'mobile' : 'desktop',
  };
}

/**
 * Initializes the Flagsmith client with real-time SSE updates, viewport traits, and events enabled.
 * Immediately flushes exposure events and falls back gracefully to 'minimal' on errors.
 */
export async function initFlagsmithClient(userId: string): Promise<FocusVariant> {
  const envKey = process.env.NEXT_PUBLIC_FLAGSMITH_ENV_KEY?.trim();

  if (!envKey) {
    console.warn('[Flagsmith] NEXT_PUBLIC_FLAGSMITH_ENV_KEY is not set. Falling back to default variant "minimal".');
    lastResolvedSource = 'fallback';
    return 'minimal';
  }

  const traits = getViewportTraits();

  try {
    if (!isInitialized) {
      if (!initPromise) {
        initPromise = flagsmith.init({
          environmentID: envKey,
          enableEvents: true,
          realtime: true,
          identity: userId,
          traits,
          defaultFlags: {
            [FLAG_NAME]: {
              enabled: true,
              value: 'minimal',
            },
          },
          onChange: (_oldFlags, params) => {
            if (!isInitialized || !params?.isFromServer) return;
            const liveValue = String(flagsmith.getValue(FLAG_NAME) || '');
            if (liveValue === 'gamified' || liveValue === 'minimal') {
              lastResolvedSource = 'flagsmith';
              variantListeners.forEach((cb) => cb(liveValue));
            }
          },
          onError: (err) => {
            console.warn('[Flagsmith] SDK error:', err?.message || err);
          },
        });
      }
      await initPromise;
      isInitialized = true;
    }

    if (flagsmith.identity !== userId) {
      await flagsmith.identify(userId, traits);
    }

    // Read experiment flag (automatically records $flag_exposure if enrolled) and flush immediately
    const expFlag = flagsmith.getExperimentFlag(FLAG_NAME);
    await flagsmith.flushEvents();

    const val = expFlag && expFlag.value ? String(expFlag.value) : String(flagsmith.getValue(FLAG_NAME) || '');

    if (val === 'gamified' || val === 'minimal') {
      lastResolvedSource = 'flagsmith';
      return val;
    }

    console.warn(`[Flagsmith] Unexpected flag value "${val}" for ${FLAG_NAME}. Falling back to "minimal".`);
    lastResolvedSource = 'fallback';
    return 'minimal';
  } catch (err) {
    console.warn('[Flagsmith] Failed to initialize or fetch flags. Gracefully falling back to "minimal":', err);
    isInitialized = false;
    initPromise = null;
    lastResolvedSource = 'fallback';
    return 'minimal';
  }
}

/**
 * Updates identity traits in Flagsmith for segment targeting
 */
export async function updateUserTraits(traits: Record<string, string | number | boolean>) {
  try {
    if (!isInitialized || !flagsmith.identity) return;
    await flagsmith.setTraits(traits);
  } catch (err) {
    console.warn('[Flagsmith] Failed to update traits:', err);
  }
}

/**
 * Dispatches a funnel or conversion event to Flagsmith Experimentation and flushes immediately
 */
export async function trackFlagsmithEvent(
  eventName: string,
  value?: number,
  metadata?: Record<string, unknown>
) {
  try {
    if (!isInitialized || !flagsmith.eventsEnabled) return;
    flagsmith.trackEvent(eventName, {
      ...(value !== undefined ? { value } : {}),
      ...(metadata ? { metadata } : {}),
    });
    await flagsmith.flushEvents();
  } catch (err) {
    console.warn('[Flagsmith] Error flushing event:', err);
  }
}

export const trackFlagsmithConversion = trackFlagsmithEvent;

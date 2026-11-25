import flagsmith from '@flagsmith/flagsmith';

export type FocusVariant = 'minimal' | 'gamified';

const FLAG_NAME = 'focus_experience_variant';

/**
 * Retrieves or initializes a persistent anonymous user identifier
 */
export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'server_user';
  
  let id = localStorage.getItem('fp_user_id');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('fp_user_id', id);
  }
  
  // Also sync to a cookie for SSR/header persistence
  document.cookie = `fp_user_id=${id}; path=/; max-age=31536000; SameSite=Lax`;
  return id;
}

/**
 * Resets the user identifier to simulate a new test visitor
 */
export function resetUserId(): string {
  if (typeof window === 'undefined') return 'new_user';
  const newId = 'user_' + Math.random().toString(36).substring(2, 10);
  localStorage.setItem('fp_user_id', newId);
  document.cookie = `fp_user_id=${newId}; path=/; max-age=31536000; SameSite=Lax`;
  return newId;
}

let isInitialized = false;

/**
 * Initializes the Flagsmith client with the given identity and enables experimentation events
 */
export async function initFlagsmithClient(userId: string): Promise<FocusVariant> {
  const envKey = process.env.NEXT_PUBLIC_FLAGSMITH_ENV_KEY || 'esMZQYfcANsHcmozTaXb6F';

  try {
    if (!isInitialized) {
      await flagsmith.init({
        environmentID: envKey,
        enableEvents: true,
        identity: userId,
        defaultFlags: {
          [FLAG_NAME]: {
            enabled: true,
            value: 'minimal'
          }
        }
      });
      isInitialized = true;
    } else {
      await flagsmith.identify(userId);
    }

    // Retrieve flag value and record exposure
    let val: string | null = null;
    try {
      const expFlag = await flagsmith.getExperimentFlag(FLAG_NAME);
      val = expFlag && expFlag.value ? String(expFlag.value) : null;
    } catch (e) {
      val = flagsmith.getValue(FLAG_NAME) as string;
    }

    // Deterministic fallback based on user_id hash if flag value is undefined
    if (val !== 'gamified' && val !== 'minimal') {
      const charCodeSum = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      val = charCodeSum % 2 === 0 ? 'gamified' : 'minimal';
    }

    return val as FocusVariant;
  } catch (err) {
    console.warn('[Flagsmith] Failed to initialize client, using deterministic fallback:', err);
    const charCodeSum = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return charCodeSum % 2 === 0 ? 'gamified' : 'minimal';
  }
}

/**
 * Dispatches an event to Flagsmith Experimentation
 */
export async function trackFlagsmithConversion(eventName: string) {
  try {
    flagsmith.trackEvent(eventName);
    await flagsmith.flushEvents();
  } catch (err) {
    console.warn('[Flagsmith] Error flushing event:', err);
  }
}

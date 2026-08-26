import { supportedScenarios, type AppScenario } from '../generated/scenarios';

/**
 * Astro exposes only `PUBLIC_`-prefixed variables to code that can reach the
 * browser, so the scenario switch is named for this renderer rather than
 * borrowing the application renderer's `VITE_` prefix and silently reading
 * nothing.
 */
export function getAppScenario(): AppScenario {
  const requested = import.meta.env.PUBLIC_APP_SCENARIO?.trim();
  if (!requested) return 'default';
  return supportedScenarios.includes(requested as AppScenario) ? requested as AppScenario : 'default';
}

export const currentScenario = getAppScenario();

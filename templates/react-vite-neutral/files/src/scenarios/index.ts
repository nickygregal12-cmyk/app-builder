import { supportedScenarios, type AppScenario } from '../generated/scenarios';

export function getAppScenario(): AppScenario {
  const requested = import.meta.env.VITE_APP_SCENARIO?.trim();
  if (!requested) return 'default';
  return supportedScenarios.includes(requested as AppScenario) ? requested as AppScenario : 'default';
}

export const currentScenario = getAppScenario();

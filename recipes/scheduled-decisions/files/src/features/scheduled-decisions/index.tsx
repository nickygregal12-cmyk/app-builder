export const recipe = {
  id: 'scheduled-decisions',
  label: 'Scheduled decisions, settlement and standings',
};

// The composer places a scheduled-decisions section on a workspace surface
// wherever this capability is installed; this recipe owns how it renders and how
// it talks to the database. The window it enforces is the database's, not this
// section's — every refusal it can produce is proved against a real PostgreSQL
// in `tooling/application-journey-benchmark-acceptance.sql`.
export { ScheduledDecisionsProvider as Provider } from './ScheduledDecisionsContext';
export {
  useScheduledDecisions,
  type ScheduledEntity,
  type ScheduledEntityState,
  type ScheduledDecision,
  type LeaderboardRow,
} from './ScheduledDecisionsContext';

import { ScheduledDecisionsSection } from './ScheduledDecisionsSection';
export { ScheduledDecisionsSection };
export const sections = { 'scheduled-decisions': ScheduledDecisionsSection };

import { useState, type FormEvent } from 'react';
import { useScheduledDecisions, type ScheduledDecision, type ScheduledEntity } from './ScheduledDecisionsContext';

/**
 * The scheduled-decision surface of a generated application.
 *
 * Deliberately plain, for the same reason the records surface is: this slice
 * exists to prove that a person can actually use a server-authoritative
 * deadline, not to advance the visual system. It uses the shell's existing
 * primitives and introduces no design vocabulary.
 *
 * The decision itself is edited as JSON, and that is an admission rather than a
 * design. This recipe does not know what a decision means — `choice` is opaque
 * to it by construction, because the moment it renders two labelled number
 * fields it has decided what every product built on it is predicting. A product
 * with a known decision shape replaces this control with its own; what it
 * inherits is the window, the reveal, the settlement and the standings.
 *
 * What it does take seriously is telling the truth about state. `state` is the
 * server's answer, and every control below is enabled or not according to it,
 * so the interface never offers a write the database is about to refuse.
 */

const OPEN: ScheduledEntity['state'] = 'scheduled';

/**
 * What actually went wrong, when anything is willing to say so.
 *
 * A refusal from the database arrives as a plain object carrying `message`, not
 * as an `Error`, so an `instanceof Error` test falls through to the generic
 * sentence for precisely the failures worth reading. That is not only unkind to
 * the person — it cost a real diagnosis once, when a refused write reported
 * "could not be saved" and the reason it gave, naming the missing privilege,
 * was thrown away on the way to the screen.
 */
function describeFailure(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'That decision could not be saved.';
}

function describeDeadline(entity: ScheduledEntity) {
  // Rendered, never compared. The clock that decides whether this window is
  // open is the server's, and `entity.state` already carries its answer.
  return new Date(entity.decision_deadline).toLocaleString();
}

function DecisionForm({ entity, existing, onSubmit }: {
  entity: ScheduledEntity;
  existing: ScheduledDecision | undefined;
  onSubmit(choice: unknown): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get('choice') ?? '');
    setFailure(null);

    let choice: unknown;
    try {
      choice = JSON.parse(raw);
    } catch {
      // Refused here rather than sent, because a malformed decision that
      // reaches the database is stored and then scores zero at settlement,
      // which the person finds out about far too late to fix.
      setFailure('That decision is not valid JSON, so it was not submitted.');
      return;
    }

    setPending(true);
    try {
      await onSubmit(choice);
    } catch (error) {
      setFailure(describeFailure(error));
    } finally {
      setPending(false);
    }
  }

  return <form className="decision-form" onSubmit={submit}>
    <label>Your decision
      <input
        name="choice"
        defaultValue={existing ? JSON.stringify(existing.choice) : ''}
        required
        aria-label={`Decision for ${entity.reference}`}
      />
    </label>
    <button className="button primary-action" type="submit" disabled={pending}>
      {pending ? 'Saving…' : existing ? 'Change decision' : 'Submit decision'}
    </button>
    {failure && <p className="decision-status decision-status-failed" role="alert">{failure}</p>}
  </form>;
}

function EntityCard({ entity }: { entity: ScheduledEntity }) {
  const { decisions, identityId, submitDecision } = useScheduledDecisions();
  const onThis = decisions.filter((decision) => decision.entity_id === entity.id);
  const mine = onThis.find((decision) => decision.identity_id === identityId);
  const others = onThis.filter((decision) => decision.identity_id !== identityId);

  return <article className="content-card decision-card" data-entity-reference={entity.reference} data-entity-state={entity.state}>
    <header>
      <h3>{entity.title}</h3>
      <p className="decision-reference">{entity.reference}</p>
      <p className="decision-state">{entity.state} · decisions close {describeDeadline(entity)}</p>
    </header>

    {entity.state === OPEN
      ? <DecisionForm entity={entity} existing={mine} onSubmit={(choice) => submitDecision(entity.id, choice)} />
      : <p className="decision-closed">
        This window is closed. {mine ? 'Your decision stands as submitted.' : 'You did not decide on this one.'}
      </p>}

    {/* Everybody's decisions, once the entity has left its open window. This is
        not a toggle: what arrives from the database while the window is open is
        already only your own, so an empty list here is the policy working. */}
    <ul className="decision-list">
      {mine && <li className="decision-entry decision-entry-own" data-decision-identity={mine.identity_id}>
        You: <code>{JSON.stringify(mine.choice)}</code>
      </li>}
      {others.map((decision) => <li key={decision.id} className="decision-entry" data-decision-identity={decision.identity_id}>
        <code>{JSON.stringify(decision.choice)}</code>
      </li>)}
    </ul>

    {entity.state === OPEN && others.length === 0 && <p className="decision-private">
      Other competitors' decisions stay private until this window closes.
    </p>}

    {entity.voided_reason && <p className="decision-voided">Voided: {entity.voided_reason}</p>}
  </article>;
}

export function ScheduledDecisionsSection() {
  const { organisationId, entities, leaderboard, leaderboardUnavailable, loading, error } = useScheduledDecisions();

  if (!organisationId) {
    return <div className="decisions-panel">
      <p className="decision-empty">You are not a member of an organisation yet, so there is nothing scheduled for you.</p>
    </div>;
  }

  return <div className="decisions-panel" data-organisation-id={organisationId}>
    {loading && <p className="decision-loading" aria-live="polite">Loading the schedule…</p>}
    {error && <p className="decision-status decision-status-failed" role="alert">{error}</p>}

    {!loading && !error && entities.length === 0 && <p className="decision-empty">Nothing is scheduled yet.</p>}

    {entities.length > 0 && <div className="decision-entities">
      {entities.map((entity) => <EntityCard key={entity.id} entity={entity} />)}
    </div>}

    <section className="decision-leaderboard">
      <h3>Standings</h3>
      {/* A product that has not declared its scoring rule is a real state and
          not a broken page. Saying so beats an empty table, which reads as
          "nobody has scored" rather than "nothing has been scored yet". */}
      {leaderboardUnavailable
        ? <p className="decision-standings-unavailable" role="status">
          Standings are unavailable until this product declares how a decision scores.
        </p>
        : leaderboard.length === 0
          ? <p className="decision-empty">Nothing has settled yet.</p>
          : <ol className="decision-standings">
            {leaderboard.map((row) => <li
              key={row.identity_id}
              className="decision-standing"
              data-leaderboard-position={row.board_position}
              data-leaderboard-identity={row.identity_id}
            >
              {row.total_score} {row.total_score === 1 ? 'point' : 'points'}
            </li>)}
          </ol>}
    </section>
  </div>;
}

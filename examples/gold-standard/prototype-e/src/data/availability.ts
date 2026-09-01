/**
 * Which weeks are taken.
 *
 * ASSERTED, not computed, and the distinction matters on this site more than most. Everything
 * about the tide is derived from the model and nothing about it is written by hand. Availability
 * is the opposite: it is a commercial fact about who has paid, it cannot be derived from
 * anything, and generating it from a seeded random number would be dressing an invention up as a
 * calculation. So it is a list, and the list is short enough to read.
 *
 * The pattern is the one a real single-property letting has: peak weeks go first and go early,
 * the shoulder fills unevenly, and the two hardest spring weeks in high season are still open in
 * September because most people book by the calendar rather than by the tide. That last one is
 * the site's argument, so it would be dishonest to invent a booking pattern that contradicted it.
 */

/** Week slugs — the arrival Friday, ISO. */
export const TAKEN = new Set([
  '2026-04-17',
  '2026-05-22',
  '2026-06-05',
  '2026-06-19',
  '2026-07-03',
  '2026-07-17',
  '2026-07-24',
  '2026-07-31',
  '2026-08-07',
  '2026-08-14',
  '2026-09-11',
  '2026-10-09',
]);

/** Weeks somebody is holding, unpaid. Held for 48 hours, which the enquiry page explains. */
export const HELD = new Set(['2026-08-28', '2026-06-26']);

export type Availability = 'free' | 'held' | 'taken';

export const availabilityOf = (slug: string): Availability =>
  TAKEN.has(slug) ? 'taken' : HELD.has(slug) ? 'held' : 'free';

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  free: 'Available',
  held: 'On hold',
  taken: 'Taken',
};

/**
 * How the estate says it, per state.
 *
 * Deliberately not "enquire now" on a week that is gone. A letting site that offers the same
 * call to action on every week regardless of whether it can be booked is asking the reader to
 * discover the answer by filling in a form.
 */
export const AVAILABILITY_NOTE: Record<Availability, string> = {
  free: 'This week is open. Enquiries are answered within a day and a week is held for you for 48 hours, unpaid, while you decide.',
  held: 'Somebody is holding this week and has 48 hours to confirm. Ask to be told if it comes back — that happens perhaps one time in four.',
  taken: 'This week has gone. The weeks either side of it are shown below, and the estate keeps a list for cancellations.',
};

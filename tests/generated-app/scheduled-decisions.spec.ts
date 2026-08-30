import { expect, test } from './journey';

/**
 * The scheduled-decision journey, driven through the generated application's own
 * interface against a real Supabase stack.
 *
 * This is the half `tooling/application-journey-benchmark-acceptance.sql` cannot
 * do. The pgTAP suite proves the deadline, the reveal, the settlement and the
 * standings hold against a database. This proves a person can use the product
 * sitting on them — and, specifically, that the reveal rule survives the trip to
 * the screen.
 *
 * That last point is why this test exists at all rather than being redundant
 * with the SQL. A decision hidden by a policy and then rendered by a component
 * that fetched it some other way is a leak that no database test can see, and a
 * decision hidden by a component over a policy that returned it is a leak
 * waiting for anyone with the publishable key. The question here is the honest
 * one: signed in as Member A, is Viewer A's open decision anywhere on the page?
 */

const MEMBER_A = { id: '10000000-0000-0000-0000-000000000004', email: 'member-a@test.local', password: 'records-journey-member-a' };
const VIEWER_A = { id: '10000000-0000-0000-0000-000000000005' };

async function signIn(page: import('@playwright/test').Page, credentials: { email: string; password: string }) {
  await page.goto('/workspace');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.locator('.decisions-panel')).toBeVisible({ timeout: 20_000 });
}

test.describe('scheduled decisions', () => {
  test('a competitor decides before the deadline and sees nobody else until it passes', async ({ page, browserSignals }) => {
    // The amendment at step 6 is *expected* to be refused once, and the refusal
    // is the mechanism rather than a fault. The recipe grants `update (choice)`
    // and nothing else, so PostgREST's `.upsert()` — which asks for update on
    // every column in the payload — cannot be used; the client inserts instead
    // and reads the unique violation as "this person has already decided". The
    // 409 is that violation. It is declared here rather than centrally because
    // it belongs to this journey's design and should stop being excused the day
    // that design changes.
    browserSignals.declare({
      id: 'decision-amendment-conflict',
      kinds: ['http-error'],
      match: { url: '/rest/v1/scheduled_decisions', status: [409] },
      because:
        'The client inserts a decision and treats the unique-constraint violation as an amendment, because the narrow '
        + '`update (choice)` grant refuses the upsert that would otherwise express it. The 409 is how the amendment path '
        + 'detects it is amending, so a run of this journey without one would mean the amendment was never exercised.',
    });

    await signIn(page, MEMBER_A);

    const open = page.locator('[data-entity-reference="SCH-OPEN"]');
    await expect(open).toBeVisible();

    // 1. The state on the screen is the server's answer, not a comparison this
    //    page made against the browser clock.
    await expect(open).toHaveAttribute('data-entity-state', 'scheduled');

    // 2. Viewer A HAS decided on this entity — the seed put the decision there
    //    precisely so that its absence means something. If this ever appears,
    //    every competitor can read every other competitor's answer before the
    //    deadline, which is the failure this whole slice exists to prevent.
    await expect(open.locator(`[data-decision-identity="${VIEWER_A.id}"]`)).toHaveCount(0);
    await expect(open.getByText('Other competitors', { exact: false })).toBeVisible();

    // 3. Decide, through the interface, before the deadline.
    await page.getByLabel('Decision for SCH-OPEN').fill('{"a":3,"b":2}');
    await open.getByRole('button', { name: /submit decision/i }).click();

    // 4. It is stored and attributed to this identity, and it is still the only
    //    one visible.
    await expect(open.locator(`[data-decision-identity="${MEMBER_A.id}"]`)).toBeVisible({ timeout: 15_000 });
    await expect(open.locator(`[data-decision-identity="${MEMBER_A.id}"]`)).toContainText('{"a":3,"b":2}');
    await expect(open.locator(`[data-decision-identity="${VIEWER_A.id}"]`)).toHaveCount(0);

    // 5. It survives a reload, which is the difference between a write and a
    //    component that optimistically rendered one.
    await page.reload();
    await expect(open.locator(`[data-decision-identity="${MEMBER_A.id}"]`)).toContainText('{"a":3,"b":2}');

    // 6. Change it, while the window is still open. This is a different write
    //    from the one above — an amendment to an existing row rather than a new
    //    one — and it is the path the narrow `update (choice)` grant governs. A
    //    first decision that works while every amendment is refused looks fine
    //    until somebody changes their mind, so both paths are exercised here.
    await page.getByLabel('Decision for SCH-OPEN').fill('{"a":4,"b":0}');
    await open.getByRole('button', { name: /change decision/i }).click();
    await expect(open.locator(`[data-decision-identity="${MEMBER_A.id}"]`)).toContainText('{"a":4,"b":0}', { timeout: 15_000 });

    // 7. Amended, not duplicated. One person holds one decision per entity, and
    //    the constraint that says so is the same one the amendment path relies
    //    on to know it was an amendment.
    await page.reload();
    await expect(open.locator(`[data-decision-identity="${MEMBER_A.id}"]`)).toHaveCount(1);
    await expect(open.locator(`[data-decision-identity="${MEMBER_A.id}"]`)).toContainText('{"a":4,"b":0}');

    // 8. And no refusal was reported anywhere on the way through.
    await expect(open.locator('.decision-status-failed')).toHaveCount(0);
  });

  test('a settled entity reveals every decision and ranks them', async ({ page }) => {
    await signIn(page, MEMBER_A);

    const settled = page.locator('[data-entity-reference="SCH-SETTLED"]');
    await expect(settled).toBeVisible();
    await expect(settled).toHaveAttribute('data-entity-state', 'settled');

    // 1. The reveal. The same query that returned one decision on the open
    //    entity returns both here, and this is the assertion that says the rule
    //    was "not yet" rather than "never".
    await expect(settled.locator(`[data-decision-identity="${MEMBER_A.id}"]`)).toBeVisible();
    await expect(settled.locator(`[data-decision-identity="${VIEWER_A.id}"]`)).toBeVisible();

    // 2. A closed window offers no control to write through. The interface does
    //    not present an action the database is going to refuse.
    await expect(settled.getByRole('button', { name: /decision/i })).toHaveCount(0);
    await expect(settled.getByText(/window is closed/i)).toBeVisible();

    // 3. The standings, in the order the view fixed. Member A decided exactly
    //    and Viewer A got only the direction right, so this order is a
    //    consequence of the scoring rule rather than of insertion order.
    const standings = page.locator('.decision-standing');
    await expect(standings).toHaveCount(2);
    await expect(standings.nth(0)).toHaveAttribute('data-leaderboard-identity', MEMBER_A.id);
    await expect(standings.nth(0)).toContainText('3 points');
    await expect(standings.nth(1)).toHaveAttribute('data-leaderboard-identity', VIEWER_A.id);
    await expect(standings.nth(1)).toContainText('1 point');
  });
});

/**
 * Plumbline — a fictional database change-management company.
 *
 * Invented for this corpus under the same fiction-safety rules as the other two prototypes:
 * the `.invalid` TLD can never resolve, and no customer, person, metric or certification
 * named here is real.
 *
 * The design problem this prototype exists to test is the opposite of the first two. An
 * architecture practice and a planting studio both sell judgement, and photographs and
 * botanical plates do a lot of the persuading. Nobody buys developer infrastructure from a
 * photograph. The only thing that persuades a staff engineer is the product's own output,
 * shown in full, including the parts that are inconvenient — so the site's visual language
 * has to be built out of that output rather than decorated around it.
 *
 * Consequently there is no photography on this site at all. Every figure is drawn from the
 * data below.
 */

export const company = {
  name: 'Plumbline',
  legalName: 'Plumbline Systems Ltd',
  founded: 2021,
  people: 19,
  positioning:
    'Plumbline reads every database migration before it runs and refuses the ones that would take the site down. It is the review step in front of whatever migration tool you already use.',
  principle: 'The migration that causes the outage always looked fine in review.',
  contact: {
    email: 'hello@plumbline.invalid',
    security: 'security@plumbline.invalid',
    address: 'Unit 4, Sharp Street, Manchester, M4 5DA',
  },
  trial: { days: 14, scope: 'one database', card: false },
} as const;

/**
 * The checks. This is the product, so it is stated as a list of specific refusals rather
 * than a list of benefits — "catches risky migrations" is what every tool in the category
 * says, and it is the reason none of them are believed.
 */
export interface Check {
  id: string;
  title: string;
  /** What Plumbline does when it fires. A check that only warns is a check nobody reads. */
  severity: 'block' | 'warn';
  /** The failure in one sentence, in the words the engineer would use afterwards. */
  failure: string;
  /** How it is detected. Vague detection is indistinguishable from a regex. */
  method: string;
  engines: string[];
}

export const checks: Check[] = [
  {
    id: 'PL001',
    title: 'Table lock held past the deploy window',
    severity: 'block',
    failure: 'An ALTER holds an ACCESS EXCLUSIVE lock while requests queue behind it, and the queue is the outage.',
    method: 'Estimates lock duration from live table statistics on the target, not from the table on your laptop.',
    engines: ['PostgreSQL', 'MySQL'],
  },
  {
    id: 'PL002',
    title: 'Column dropped while old code still reads it',
    severity: 'block',
    failure: 'A rolling deploy leaves one version of the application still selecting a column the migration has already removed.',
    method: 'Reads the column out of your application\'s query logs for the retention window, and blocks if anything touched it.',
    engines: ['PostgreSQL', 'MySQL', 'SQL Server'],
  },
  {
    id: 'PL003',
    title: 'NOT NULL added without a default on a populated table',
    severity: 'block',
    failure: 'A full table rewrite that took nine seconds in staging takes forty minutes against production row counts.',
    method: 'Compares row counts between the plan target and the environment the migration was tested in.',
    engines: ['PostgreSQL', 'MySQL'],
  },
  {
    id: 'PL004',
    title: 'Index created without CONCURRENTLY',
    severity: 'block',
    failure: 'Writes to the table stop for the duration of the build. On a large table that is not a duration anyone budgeted for.',
    method: 'Static analysis of the statement, with the estimated build time from table size attached to the refusal.',
    engines: ['PostgreSQL'],
  },
  {
    id: 'PL005',
    title: 'Foreign key added without a prior NOT VALID step',
    severity: 'warn',
    failure: 'Validating the constraint scans the whole table under a lock that a two-step migration would have avoided.',
    method: 'Recognises the single-statement form and offers the two-statement rewrite.',
    engines: ['PostgreSQL'],
  },
  {
    id: 'PL006',
    title: 'Migration not reversible, and not marked as such',
    severity: 'warn',
    failure: 'The rollback everyone assumed existed does not, and it is discovered at the worst possible time.',
    method: 'Attempts the down migration against a snapshot and reports what it could not restore.',
    engines: ['PostgreSQL', 'MySQL', 'SQL Server'],
  },
  {
    id: 'PL007',
    title: 'Type change that silently truncates',
    severity: 'block',
    failure: 'A widening that is actually a narrowing on some rows, discovered as missing characters weeks later.',
    method: 'Checks the existing value distribution against the target type before the statement runs.',
    engines: ['PostgreSQL', 'MySQL'],
  },
  {
    id: 'PL008',
    title: 'Two migrations in one deploy that conflict',
    severity: 'warn',
    failure: 'Independently safe migrations that are not safe in the order the deploy will apply them.',
    method: 'Plans the whole set together and reports the first ordering that fails.',
    engines: ['PostgreSQL', 'MySQL'],
  },
];

/**
 * The sample plan. This is the hero, the argument and the signature moment, so it is real
 * data rather than a screenshot: it renders as HTML, it reflows, it is selectable, and a
 * reader can check the arithmetic.
 */
export interface PlanRow {
  statement: string;
  verdict: 'blocked' | 'warned' | 'clear';
  check?: string;
  lockMs: number;
  note: string;
}

export const plan = {
  repo: 'checkout-service',
  branch: 'add-refund-ledger',
  target: 'orders-eu-primary',
  rows: 12_400_000,
  budgetMs: 200,
  statements: [
    { statement: 'CREATE TABLE refund_ledger (…)', verdict: 'clear', lockMs: 2, note: 'New table. Nothing reads it yet.' },
    { statement: 'ALTER TABLE orders ADD COLUMN refund_state text', verdict: 'clear', lockMs: 4, note: 'Nullable add. Metadata-only on this version.' },
    { statement: 'CREATE INDEX ix_orders_refund_state ON orders (refund_state)', verdict: 'blocked', check: 'PL004', lockMs: 92_000, note: 'Blocks writes for an estimated 1m 32s against 12.4M rows. Use CONCURRENTLY.' },
    { statement: 'ALTER TABLE orders ALTER COLUMN refund_state SET NOT NULL', verdict: 'blocked', check: 'PL003', lockMs: 148_000, note: 'Full rewrite. The column has 12.4M nulls and no default.' },
    { statement: 'ALTER TABLE orders DROP COLUMN legacy_refund_flag', verdict: 'blocked', check: 'PL002', lockMs: 3, note: 'Read 41,208 times in the last 7 days by checkout-service v418, still serving.' },
    { statement: 'ALTER TABLE refund_ledger ADD CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders (id)', verdict: 'warned', check: 'PL005', lockMs: 11_400, note: 'Add NOT VALID, then VALIDATE separately.' },
  ] as PlanRow[],
} as const;

export const proof = [
  {
    quote: 'We adopted it after an ALTER took the checkout down for eleven minutes on a Friday. Plumbline would have refused that statement, and I would rather be told no by a machine at four in the afternoon than by a customer at six.',
    who: 'Staff engineer',
    org: 'A payments company, 400 engineers',
  },
  {
    quote: 'The part that changed behaviour was not the blocking. It was that the plan is readable, so migration review stopped being one person\'s job.',
    who: 'Platform lead',
    org: 'A logistics marketplace',
  },
];

export const numbers = [
  { figure: '1,204', caption: 'Migrations refused across all customers last quarter' },
  { figure: '31s', caption: 'Median plan time against a production-sized database' },
  { figure: '0', caption: 'Statements Plumbline runs. It reviews; your tool executes' },
];

export const plans = [
  {
    name: 'Team',
    price: '£40',
    unit: 'per database, per month',
    line: 'For one team shipping to a handful of databases.',
    includes: ['All eight checks', 'GitHub and GitLab CI', 'Plan history for 90 days', 'Email support'],
    cta: 'Start a 14-day trial',
    href: '/start',
  },
  {
    name: 'Organisation',
    price: '£32',
    unit: 'per database, per month, from 20',
    line: 'For a platform team standardising review across many services.',
    includes: ['Everything in Team', 'Custom checks', 'SSO and SCIM', 'Plan history for 3 years', 'Shared policy across repositories'],
    cta: 'Start a 14-day trial',
    href: '/start',
    featured: true,
  },
  {
    name: 'Self-hosted',
    price: 'From £26k',
    unit: 'per year',
    line: 'For databases that may not be reached from outside your network.',
    includes: ['Everything in Organisation', 'Runs entirely inside your VPC', 'No connection to Plumbline at run time', 'Annual invoicing'],
    cta: 'Talk to us',
    href: '/enterprise',
  },
];

export const changelog = [
  { date: '2026-08-19', title: 'SQL Server support for PL002 and PL006', body: 'Query-log reading and reversibility testing now work against SQL Server 2019 and later.' },
  { date: '2026-07-30', title: 'Lock estimates use live statistics', body: 'PL001 and PL004 previously estimated from the schema alone. They now read table statistics from the target, which made estimates materially less wrong on partitioned tables.' },
  { date: '2026-07-02', title: 'Plans are addressable', body: 'Every plan has a permanent URL, so a refusal can be linked in the pull request that caused it.' },
  { date: '2026-06-11', title: 'PL008 — conflicting migrations in one deploy', body: 'The whole set is now planned together rather than statement by statement.' },
];

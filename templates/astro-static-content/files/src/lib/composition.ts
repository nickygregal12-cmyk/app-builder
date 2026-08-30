/**
 * Reading a composition, without a framework.
 *
 * Everything here is the same interpretation of PageSpec/SectionSpec that the
 * application renderer performs — which binding is the title, when a set of
 * items is a list rather than a grid of tall empty cards, which fields read as
 * their own sentence and which need their name in front of them. It is plain
 * TypeScript because none of it is a rendering decision: it is what the
 * composition *says*, and two renderers disagreeing about that would be two
 * products.
 */

export type Action = { label: string; href: string };

export type Binding = {
  key: string;
  value: unknown;
  origin: string;
  sourceIds: readonly string[];
  factIds: readonly string[];
  entityIds: readonly string[];
  generated: boolean;
};

export type SectionSpec = {
  id: string;
  type: string;
  purpose: string;
  bindings: readonly Binding[];
  actions: readonly Action[];
  assetIds: readonly string[];
  variant: string;
};

export type PageSpec = {
  id: string;
  path: string;
  title: string;
  purpose: string;
  navigation: { label: string; order: number; visible: boolean };
  primaryAction: Action | null;
  sectionIds: readonly string[];
};

export type ProjectComposition = {
  pages: readonly PageSpec[];
  sections: readonly SectionSpec[];
  warnings: readonly string[];
};

export type AssetVariant = { role: string; format: string; width: number | null; height: number | null; uri: string };

export type GeneratedAsset = {
  id: string;
  kind: string;
  provenance: string;
  assetStatus: string;
  rightsStatus: string;
  alt: string | null;
  variants: readonly AssetVariant[];
};

/**
 * The visual direction this build presents by.
 *
 * The factory compiles it; nothing is decided here. Reading it through a
 * widened type is deliberate, exactly as in the application renderer: the
 * generated design module is `as const`, so every field is a literal and
 * comparing one against another string would be a type error rather than a
 * check. A build generated before Phase 4D carries none of this and falls back
 * to what it rendered before.
 */
export type VisualDirection = {
  label?: string;
  shellClass?: string;
  shellClasses?: string;
  artDirection?: {
    dimensions?: { actionTreatment?: string; ctaComposition?: string; heroComposition?: string; navigationFamily?: string; typographyStrategy?: string; heroStrategy?: string; gridFamily?: string; headingTreatment?: string; ctaPlacement?: string; distinctiveMoment?: string };
    responsive?: { mobileHero?: string; mobileSectionOrder?: string; mobileDensity?: string; mobileMotion?: string };
  };
};

export function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

export function binding(section: SectionSpec, key: string): Binding | undefined {
  return section.bindings.find((item) => item.key === key);
}

/**
 * Where an in-site address resolves.
 *
 * An ordinary deployment serves the site at the domain root and this is the
 * identity function. It only does anything when the site is served under a
 * sub-path — a staging mount, a preview, a docs section of a larger site —
 * where every address the composition declares is relative to that base rather
 * than to the host root. Astro exposes the base as `import.meta.env.BASE_URL`,
 * so a generated repository stays an ordinary portable project and the base is
 * a build argument rather than something baked into the composition.
 */
const SITE_BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

export function siteHref(href: string): string {
  return SITE_BASE && href.startsWith('/') ? `${SITE_BASE}${href}` : href;
}

export function primitiveEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item) && String(item).trim());
}

export function itemTitle(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Item';
  const record = value as Record<string, unknown>;
  return text(record.name ?? record.title ?? record.quote ?? record.value ?? record.label) || 'Item';
}

// Fields that hold the item's own sentence read as that sentence. Everything
// else is an attribute and is clearer with its name in front of it: "Price:
// 250" is helpful, "description: Chartered quantity surveying across the
// project lifecycle." is a field name leaking onto a client's website.
const PROSE_FIELDS = ['description', 'summary', 'detail', 'details', 'body', 'excerpt'];

export function itemDetail(value: unknown): string[] {
  const entries = primitiveEntries(value).filter(([key]) => !['name', 'title', 'quote', 'value', 'label'].includes(key));
  return entries.map(([key, item]) => (PROSE_FIELDS.includes(key.toLowerCase())
    ? String(item)
    : `${key.replaceAll(/([A-Z])/g, ' $1')}: ${String(item)}`));
}

export type SocialProfile = { platform: string; url: string };

export function socialProfiles(value: unknown): SocialProfile[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({ platform: text(item.platform) || 'profile', url: text(item.url ?? item.value) }))
    .filter((item) => Boolean(item.url));
}

/**
 * How a set of items is presented.
 *
 * The section's variant decides, because a person can choose it. Where it names
 * none of these, the fallback is the same rule the application renderer uses:
 * items with nothing but a name are a list, not a grid of tall empty cards.
 */
export function itemShape(values: readonly unknown[], variant?: string): 'cards' | 'list' | 'features' {
  if (variant === 'cards' || variant === 'list' || variant === 'features') return variant;
  return values.some((item) => itemDetail(item).length > 0) ? 'cards' : 'list';
}

/**
 * What a set of items is made of.
 *
 * The variant above decides how much of each item is shown. This decides the
 * structure the set is presented in, and it is the direction's decision rather
 * than the content's: contained panels in a grid, editorial entries at reading
 * measure, an indexed register, or a showcase with one dominant entry.
 *
 * Until now this axis reached the stylesheet only, so every grammar re-laid out
 * the same DOM and two directions that had chosen different grammars kept
 * arriving as the same ruled rows in different typefaces. Each grammar now
 * emits its own structure.
 */
export const PANEL_GRAMMARS = ['symmetric', 'asymmetric', 'editorial-rows', 'schedule-rows'] as const;
export type PanelGrammar = (typeof PANEL_GRAMMARS)[number];

/**
 * The grammar this set can actually carry.
 *
 * A grammar is not selectable blindly. A showcase needs something to be
 * dominant *with* and something to be dominant *over*: one item, or a set of
 * bare names, produces a lead panel with nothing beside it and a page that
 * looks broken rather than art-directed. Where the content cannot carry the
 * declared grammar the set falls back to the one that always can, rather than
 * rendering the bad composition the direction asked for.
 *
 * The other three carry both a detailed and a names-only form themselves, so
 * they are never refused.
 */
export function panelGrammar(declared: string | undefined, values: readonly unknown[]): PanelGrammar {
  const grammar: PanelGrammar = (PANEL_GRAMMARS as readonly string[]).includes(declared ?? '')
    ? (declared as PanelGrammar)
    : 'symmetric';
  if (grammar !== 'asymmetric') return grammar;
  const detailed = values.some((item) => itemDetail(item).length > 0);
  return values.length >= 3 && detailed ? 'asymmetric' : 'symmetric';
}

/**
 * Editing identity, carried by the published document.
 *
 * An element carries only the coordinates the Builder needs to name it — its
 * section and its element key. The Console resolves those against the durable
 * element-identity index the build recorded, so component ids, source
 * locations, design tokens, fact ids and source ids never reach published HTML.
 *
 * These attributes are inert in a deployed site. Static rendering changes
 * nothing about that: they are data attributes in a document, not a runtime.
 */
export function editable(section: SectionSpec, entry: Binding | undefined): Record<string, string> {
  if (!entry) return {};
  return {
    'data-section-id': section.id,
    'data-element-key': `binding:${entry.key}`,
    'data-binding-key': entry.key,
    'data-binding-origin': entry.origin,
    'data-generated': String(entry.generated),
  };
}

/** Bindings a generic section renders as items rather than as its heading. */
export const HEADING_BINDING_KEYS = ['title', 'body', 'eyebrow', 'email', 'phone', 'address', 'website', 'profiles'];

export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

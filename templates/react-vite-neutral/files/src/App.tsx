import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { project } from './generated/project';
import { design } from './generated/design';
import { composition } from './generated/composition';
import { assets } from './generated/assets';
import { initializeRecipes, installedRecipes, recipeSections } from './generated/recipes';
import { currentScenario } from './scenarios';

type Action = { label: string; href: string };
type Binding = {
  key: string;
  value: unknown;
  origin: string;
  sourceIds: readonly string[];
  factIds: readonly string[];
  entityIds: readonly string[];
  generated: boolean;
};
type SectionSpec = {
  id: string;
  type: string;
  purpose: string;
  bindings: readonly Binding[];
  actions: readonly Action[];
  assetIds: readonly string[];
  variant: string;
};
type PageSpec = {
  id: string;
  path: string;
  title: string;
  purpose: string;
  navigation: { label: string; order: number; visible: boolean };
  primaryAction: Action | null;
  sectionIds: readonly string[];
};
type ProjectComposition = {
  pages: readonly PageSpec[];
  sections: readonly SectionSpec[];
  warnings: readonly string[];
};

type AssetVariant = { role: string; format: string; width: number | null; height: number | null; uri: string };
type GeneratedAsset = { id: string; kind: string; provenance: string; assetStatus: string; rightsStatus: string; alt: string | null; variants: readonly AssetVariant[] };

const composed = composition as unknown as ProjectComposition;
const assetMap = assets as unknown as Record<string, GeneratedAsset>;

/**
 * The visual direction this build presents by.
 *
 * The factory compiles it; nothing is decided here. Reading it through a widened
 * type is deliberate: the generated design module is `as const`, so every field
 * is a literal, and comparing a literal against another string is a type error
 * rather than a check. A build generated before Phase 4D carries none of this
 * and falls back to exactly what it rendered before.
 */
type VisualDirection = {
  shellClasses?: string;
  artDirection?: {
    dimensions?: { actionTreatment?: string; ctaComposition?: string; heroComposition?: string; navigationFamily?: string; typographyStrategy?: string; heroStrategy?: string; gridFamily?: string; headingTreatment?: string; ctaPlacement?: string; distinctiveMoment?: string };
    responsive?: { mobileHero?: string; mobileSectionOrder?: string; mobileDensity?: string; mobileMotion?: string };
  };
};
const directed = design as unknown as VisualDirection;
const HERO_STRATEGY = directed.artDirection?.dimensions?.heroStrategy ?? 'split';
/**
 * What the header is made of.
 *
 * The last shared element and the first one a visitor sees. It replaced
 * `responsive.navigation`, which decided whether the row collapsed on a phone
 * while nothing decided what the row was — one element cannot have two
 * authorities, so the family owns both.
 */
const NAVIGATION_FAMILIES = ['utility', 'editorial', 'register', 'centred'] as const;
type NavigationFamily = (typeof NAVIGATION_FAMILIES)[number];
const declaredNav = directed.artDirection?.dimensions?.navigationFamily;
const NAVIGATION_FAMILY: NavigationFamily = (NAVIGATION_FAMILIES as readonly string[]).includes(declaredNav ?? '')
  ? (declaredNav as NavigationFamily)
  : 'utility';
const MOBILE_HERO = directed.artDirection?.responsive?.mobileHero ?? 'copy-first';
const SHELL_CLASSES = directed.shellClasses ?? design.shellClass;

function assetsFor(section: SectionSpec) {
  return section.assetIds.map((id) => assetMap[id]).filter(Boolean);
}

// Prefers the crop the layout asked for, falls back to the widest responsive
// variant, and never invents alt text: an unlabelled decorative image is
// better than a confident guess about what it shows.
function Picture({ asset, role, className, sizes }: { asset: GeneratedAsset; role: string; className?: string; sizes: string }) {
  const crop = asset.variants.find((variant) => variant.role === role);
  const responsive = asset.variants.filter((variant) => variant.role === 'responsive');
  const webp = responsive.filter((variant) => variant.format === 'webp').sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const avif = responsive.filter((variant) => variant.format === 'avif').sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const fallback = crop ?? webp.at(-1) ?? asset.variants[0];
  if (!fallback) return null;
  const srcSet = (list: readonly AssetVariant[]) => list.map((variant) => `${variant.uri} ${variant.width}w`).join(', ');
  return <picture className={className} data-element-key={`asset:${asset.id}`}>
    {!crop && avif.length > 0 && <source type="image/avif" srcSet={srcSet(avif)} sizes={sizes} />}
    {!crop && webp.length > 0 && <source type="image/webp" srcSet={srcSet(webp)} sizes={sizes} />}
    <img
      src={fallback.uri}
      width={fallback.width ?? undefined}
      height={fallback.height ?? undefined}
      alt={asset.alt ?? ''}
      loading="lazy"
      decoding="async"
      data-asset-provenance={asset.provenance}
      data-asset-status={asset.assetStatus}
    />
  </picture>;
}

function text(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

function binding(section: SectionSpec, key: string) {
  return section.bindings.find((item) => item.key === key);
}

// Editing identity. An element carries only the coordinates the Builder needs
// to name it — its section and its element key. The Console resolves those
// against the durable element-identity index the build recorded, so component
// ids, source locations, design tokens, fact ids and source ids never reach
// published HTML. The attributes are inert in a deployed site; only the
// postMessage bridge below is gated on edit mode, and that is off unless the
// page is opened with ?__builder=1.
function editable(section: SectionSpec, entry: Binding | undefined) {
  if (!entry) return {};
  return {
    'data-section-id': section.id,
    'data-element-key': `binding:${entry.key}`,
    'data-binding-key': entry.key,
    'data-binding-origin': entry.origin,
    'data-generated': String(entry.generated),
  };
}

const BUILDER_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('__builder');

// An ordinary deployment serves this site at the domain root, and Vite reports
// BASE_URL as '/', so both helpers are the identity function. They only do
// anything when the site is served under a sub-path — a staging mount, a docs
// section of a larger site, a preview — where every in-site address the
// composition declares is relative to that base rather than to the host root.
const SITE_BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
function siteHref(href: string) {
  return SITE_BASE && href.startsWith('/') ? `${SITE_BASE}${href}` : href;
}
function siteRoute(pathname: string) {
  if (!SITE_BASE || !pathname.startsWith(SITE_BASE)) return pathname || '/';
  const route = pathname.slice(SITE_BASE.length);
  return route.startsWith('/') ? route : `/${route}`;
}

function primitiveEntries(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item) && String(item).trim());
}

function itemTitle(value: unknown) {
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

function itemDetail(value: unknown) {
  const entries = primitiveEntries(value).filter(([key]) => !['name', 'title', 'quote', 'value', 'label'].includes(key));
  return entries.map(([key, item]) => (PROSE_FIELDS.includes(key.toLowerCase())
    ? String(item)
    : `${key.replaceAll(/([A-Z])/g, ' $1')}: ${String(item)}`));
}

type SocialProfile = { platform?: string; url?: string; value?: string };

function socialProfiles(value: unknown): SocialProfile[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SocialProfile => Boolean(item) && typeof item === 'object');
}

function SocialLinks({ profiles }: { profiles: unknown }) {
  const entries = socialProfiles(profiles).map((item) => ({ platform: text(item.platform) || 'profile', url: text(item.url ?? item.value) })).filter((item) => item.url);
  if (!entries.length) return null;
  return <ul className="social-links">{entries.map((item) => <li key={item.url}>
    <a href={item.url} rel="noopener noreferrer" target="_blank">{item.platform}</a>
  </li>)}</ul>;
}

/**
 * What a set of items is made of.
 *
 * Two decisions compose here and they are not the same decision. The *variant*
 * is how much of each item is shown, and a person can choose it. The *grammar*
 * is the structure the set is presented in, and it is the direction's.
 *
 * Until now the grammar reached the stylesheet only, so every grammar re-laid
 * out the same DOM: the editorial direction and the register direction both
 * compiled to a three-column ruled row and differed by typeface alone, which is
 * why independent reviews kept describing candidates in the same words. Each
 * grammar now emits its own structure. `content-card` survives all of them
 * because it is the item's component identity — element identity, the
 * distinctive-moment contract and DesignLint address it — but what is inside it
 * changes.
 */
const PANEL_GRAMMARS = ['symmetric', 'asymmetric', 'editorial-rows', 'schedule-rows'] as const;
type PanelGrammar = (typeof PANEL_GRAMMARS)[number];

/**
 * The grammar this set can actually carry.
 *
 * A showcase needs something to be dominant *with* and something to be dominant
 * *over*. One item, or a set of bare names, produces a lead panel with nothing
 * beside it: a page that reads as broken rather than art-directed. Where the
 * content cannot carry the declared grammar the set falls back to the one that
 * always can, instead of rendering the bad composition faithfully.
 */
function panelGrammarFor(declared: string | undefined, values: readonly unknown[]): PanelGrammar {
  const grammar: PanelGrammar = (PANEL_GRAMMARS as readonly string[]).includes(declared ?? '')
    ? (declared as PanelGrammar)
    : 'symmetric';
  if (grammar !== 'asymmetric') return grammar;
  // The lead form still needs detail, and is guarded where it renders. A set of
  // bare names keeps the declared grammar and takes the stagger instead, which
  // is why this no longer discards it here.
  return values.length >= 3 ? 'asymmetric' : 'symmetric';
}

const GRID_FAMILY = directed.artDirection?.dimensions?.gridFamily;
// The contact panel carries no items, so it has no content to be compatible
// with — but it is a set of rows in the middle of the page like any other, and
// leaving it outside the grammar is why two directions that differed everywhere
// else still closed on the same four white boxes.
const DECLARED_GRAMMAR: PanelGrammar = (PANEL_GRAMMARS as readonly string[]).includes(GRID_FAMILY ?? '')
  ? (GRID_FAMILY as PanelGrammar)
  : 'symmetric';

function Items({ values, variant }: { values: unknown; variant?: string }) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const detailed = values.some((item) => itemDetail(item).length > 0);
  const shape = variant === 'cards' || variant === 'list' || variant === 'features' ? variant : (detailed ? 'cards' : 'list');
  const grammar = panelGrammarFor(GRID_FAMILY, values);

  // A set of bare names, and the hole every grammar used to fall into. It
  // rendered one list and had the chosen grammar written onto its class and its
  // data attribute anyway, so the evidence said `asymmetric` while the DOM was
  // the symmetric one. A name cannot carry the editorial or the lead form --
  // both need a sentence to set apart -- so those stay a list honestly. The
  // stagger and the register are the two forms a bare name can carry.
  if (shape === 'list' && grammar === 'asymmetric') {
    return <ul className="plain-list panel-asymmetric panel-staggered" data-panel-grammar="asymmetric" data-panel-shape="named">
      {values.map((item, index) => <li key={`${itemTitle(item)}-${index}`}>{itemTitle(item)}</li>)}
    </ul>;
  }
  if (shape === 'list' && grammar === 'schedule-rows') {
    return <ol className="plain-list panel-schedule-rows panel-named-register" data-panel-grammar="schedule-rows" data-panel-shape="named">
      {values.map((item, index) => <li key={`${itemTitle(item)}-${index}`}>
        <span className="panel-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{itemTitle(item)}
      </li>)}
    </ol>;
  }
  if (shape === 'list') {
    return <ul className={`plain-list panel-${grammar}`} data-panel-grammar={grammar} data-panel-shape="named">
      {values.map((item, index) => <li key={`${itemTitle(item)}-${index}`}>{itemTitle(item)}</li>)}
    </ul>;
  }

  // No boxes and no index: the title is the entry, its own sentence sits under
  // it at reading measure, and a hairline separates one from the next.
  if (grammar === 'editorial-rows') {
    return <div className="item-grid panel-editorial-rows" data-panel-grammar="editorial-rows" data-panel-shape="detailed">
      {values.map((item, index) => <article className="content-card" key={`${itemTitle(item)}-${index}`}>
        <div className="panel-lede"><h3>{itemTitle(item)}</h3></div>
        <div className="panel-detail">{itemDetail(item).map((detail) => <p key={detail}>{detail}</p>)}</div>
      </article>)}
    </div>;
  }

  // An ordered list, because it is one: an entry's position is part of what it
  // says. The index is an element rather than a counter in the stylesheet, so
  // it survives being read without CSS.
  if (grammar === 'schedule-rows') {
    return <ol className="item-grid panel-schedule-rows" data-panel-grammar="schedule-rows" data-panel-shape="detailed">
      {values.map((item, index) => <li className="content-card" key={`${itemTitle(item)}-${index}`}>
        <span className="panel-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <h3>{itemTitle(item)}</h3>
        <div className="panel-detail">{itemDetail(item).map((detail) => <p key={detail}>{detail}</p>)}</div>
      </li>)}
    </ol>;
  }

  // The first entry is the one the page is arguing with, so it is a sibling of
  // the group rather than the first cell of it — which is also what makes the
  // phone order obvious: lead, then the rest.
  // The lead form, and the guarantee that it is only reached by a set that can
  // carry it: `shape === 'list'` above has already taken every set with no
  // detail, so a lead panel always has something to be dominant over.
  if (grammar === 'asymmetric' && detailed) {
    const [lead, ...supporting] = values;
    return <div className="item-grid panel-asymmetric" data-panel-grammar="asymmetric" data-panel-shape="detailed">
      <article className="content-card panel-lead">
        <h3>{itemTitle(lead)}</h3>
        {itemDetail(lead).map((detail) => <p key={detail}>{detail}</p>)}
      </article>
      <div className="panel-support">
        {supporting.map((item, index) => <article className="content-card" key={`${itemTitle(item)}-${index}`}>
          <h3>{itemTitle(item)}</h3>
          {itemDetail(item).map((detail) => <p key={detail}>{detail}</p>)}
        </article>)}
      </div>
    </div>;
  }

  if (shape === 'features') {
    return <ul className="feature-list panel-symmetric" data-panel-grammar="symmetric" data-panel-shape="detailed">{values.map((item, index) => <li key={`${itemTitle(item)}-${index}`}>
      <strong>{itemTitle(item)}</strong>
      {itemDetail(item).map((detail) => <span key={detail}>{detail}</span>)}
    </li>)}</ul>;
  }
  return <div className="item-grid panel-symmetric" data-panel-grammar="symmetric" data-panel-shape="detailed">{values.map((item, index) => <article className="content-card" key={`${itemTitle(item)}-${index}`}>
    <h3>{itemTitle(item)}</h3>
    {itemDetail(item).map((detail) => <p key={detail}>{detail}</p>)}
  </article>)}</div>;
}

/**
 * The action family.
 *
 * The one primitive four independent reviews all named — "pill buttons" — and
 * the one that had no axis. These are different implementations rather than
 * different styles: `underline` and `arrow` are not boxes, and `block` is a
 * full-width band. A treatment reachable by changing `--layout-radius` would be
 * a token, and would belong nowhere near here.
 *
 * What every treatment keeps is the part a visitor and a test depend on: the
 * same anchor, the same href, the same element key so Builder element identity
 * still addresses it, and an accessible name that is the label and nothing
 * else. The arrow is decoration and is hidden from assistive technology, which
 * is why it is a span and not part of the label.
 */
const ACTION_TREATMENTS = ['solid', 'outlined', 'underline', 'arrow', 'block'] as const;
type ActionTreatment = (typeof ACTION_TREATMENTS)[number];

const declaredTreatment = directed.artDirection?.dimensions?.actionTreatment;
const ACTION_TREATMENT: ActionTreatment = (ACTION_TREATMENTS as readonly string[]).includes(declaredTreatment ?? '')
  ? (declaredTreatment as ActionTreatment)
  : 'solid';

/** Whether this treatment presents as a control or as running text. */
const BOXED: Record<ActionTreatment, boolean> = {
  solid: true, outlined: true, block: true, underline: false, arrow: false,
};

function actionClass(treatment: ActionTreatment, index: number) {
  const rank = index === 0 ? 'primary-action' : 'secondary-action';
  // `button` is kept only where the treatment really is a button. A text link
  // carrying a class called `button` is what made every direction's closing ask
  // look like the same control no matter what it had been told to be.
  return [BOXED[treatment] ? 'button' : 'action-link', `action-${treatment}`, rank].join(' ');
}

function Actions({ actions, navigate }: { actions: readonly Action[]; navigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  if (!actions.length) return null;
  return <div className={`section-actions actions-${ACTION_TREATMENT}`} data-action-treatment={ACTION_TREATMENT}>{actions.map((action, index) => {
    const external = /^https?:\/\//.test(action.href);
    return <a
      className={actionClass(ACTION_TREATMENT, index)}
      data-element-key={`action:${index}`}
      href={siteHref(action.href)}
      onClick={(event) => navigate(event, action.href)}
      key={`${action.label}-${action.href}`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <span className="action-label">{action.label}</span>
      {ACTION_TREATMENT === 'arrow' && <span className="action-arrow" aria-hidden="true">&#8594;</span>}
    </a>;
  })}</div>;
}

function GenericSection({ section, navigate }: { section: SectionSpec; navigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  const title = binding(section, 'title');
  const body = binding(section, 'body');
  const itemBindings = section.bindings.filter((item) => !['title', 'body', 'eyebrow', 'email', 'phone', 'address', 'website', 'profiles'].includes(item.key));
  return <section className={`page-section section-${section.type} variant-${section.variant}`} id={section.id} data-section-id={section.id} data-element-key="section" data-section-type={section.type}>
    <div className="section-heading">
      {title && <h2 {...editable(section, title)}>{text(title.value)}</h2>}
      {body && <p className="section-copy" {...editable(section, body)}>{text(body.value)}</p>}
    </div>
    {itemBindings.map((item) => <Items key={item.key} values={item.value} variant={section.variant} />)}
    <Actions actions={section.actions} navigate={navigate} />
  </section>;
}

function Section({ section, navigate }: { section: SectionSpec; navigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  const title = binding(section, 'title');
  const body = binding(section, 'body');
  const eyebrow = binding(section, 'eyebrow');

  // The opening is where a visual direction is most visible, so it is the one
  // place the strategy changes the DOM rather than only the CSS. A direction
  // that wants no picture in its opening must not render one and hide it: a
  // hidden hero image is bytes a visitor downloads to see nothing.
  if (section.type === 'hero') {
    const [lead] = assetsFor(section);
    const beside = HERO_STRATEGY === 'split' && Boolean(lead);
    const behind = HERO_STRATEGY === 'immersive' && Boolean(lead);
    const below = HERO_STRATEGY === 'editorial' && Boolean(lead);
    const classes = ['page-section', 'hero-section', `variant-${section.variant}`, `hero-${HERO_STRATEGY}`];
    if (beside) classes.push('has-image');
    if (behind) classes.push('has-backdrop');
    if (below) classes.push('has-band');
    return <section className={classes.join(' ')} id={section.id} data-section-id={section.id} data-element-key="section" data-hero-strategy={HERO_STRATEGY}>
      {behind && <Picture asset={lead} role="hero-16x9" className="hero-backdrop" sizes="100vw" />}
      <div className="hero-copy-column">
        {eyebrow && <p className="eyebrow" {...editable(section, eyebrow)}>{text(eyebrow.value)}</p>}
        {title && <h1 {...editable(section, title)}>{text(title.value)}</h1>}
        {body && <p className="hero-copy" {...editable(section, body)}>{text(body.value)}</p>}
        <Actions actions={section.actions} navigate={navigate} />
      </div>
      {beside && <Picture asset={lead} role="hero-16x9" className="hero-image" sizes="(max-width: 880px) 100vw, 50vw" />}
      {below && <Picture asset={lead} role="hero-16x9" className="hero-band" sizes="100vw" />}
    </section>;
  }

  if (section.type === 'contact-panel') {
    const email = binding(section, 'email');
    const phone = binding(section, 'phone');
    const address = binding(section, 'address');
    const website = binding(section, 'website');
    return <section className={`page-section contact-section panel-${DECLARED_GRAMMAR}`} data-panel-grammar={DECLARED_GRAMMAR} id={section.id} data-section-id={section.id} data-element-key="section">
      {title && <h2 {...editable(section, title)}>{text(title.value)}</h2>}
      <div className="contact-grid">
        {email && <a href={`mailto:${text(email.value)}`} data-binding-origin={email.origin}><span>Email</span><strong>{text(email.value)}</strong></a>}
        {phone && <a href={`tel:${text(phone.value).replace(/\s+/g, '')}`} data-binding-origin={phone.origin}><span>Phone</span><strong>{text(phone.value)}</strong></a>}
        {address && <div data-binding-origin={address.origin}><span>Address</span><strong>{text(address.value)}</strong></div>}
        {website && <a href={text(website.value)} data-binding-origin={website.origin}><span>Website</span><strong>{text(website.value)}</strong></a>}
      </div>
      <SocialLinks profiles={binding(section, 'profiles')?.value} />
    </section>;
  }

  if (section.type === 'gallery') {
    const items = assetsFor(section);
    if (!items.length && !section.actions.length) return null;
    return <section className="page-section gallery-section" id={section.id} data-section-id={section.id} data-element-key="section">
      {title && <h2 {...editable(section, title)}>{text(title.value)}</h2>}
      {body && <p className="section-copy" {...editable(section, body)}>{text(body.value)}</p>}
      {items.length > 0 && <div className="gallery-grid">{items.map((asset) => <Picture key={asset.id} asset={asset} role="card-4x3" className="gallery-item" sizes="(max-width: 880px) 100vw, 33vw" />)}</div>}
      <Actions actions={section.actions} navigate={navigate} />
    </section>;
  }

  // A capability recipe owns how its own section renders. The composer decided
  // the section belongs here; it does not know what an enquiry form looks like.
  const RecipeSection = recipeSections[section.type];
  if (RecipeSection) return <section className={`page-section recipe-section section-${section.type}`} id={section.id} data-section-id={section.id} data-element-key="section" data-section-type={section.type}>
    {title && <h2 {...editable(section, title)}>{text(title.value)}</h2>}
    {body && <p className="section-copy" {...editable(section, body)}>{text(body.value)}</p>}
    <RecipeSection sectionId={section.id} />
  </section>;

  if (section.type === 'cta') return <section className="page-section cta-section" id={section.id} data-section-id={section.id} data-element-key="section">
    <div>{title && <h2 {...editable(section, title)}>{text(title.value)}</h2>}{body && <p {...editable(section, body)}>{text(body.value)}</p>}</div>
    <Actions actions={section.actions} navigate={navigate} />
  </section>;

  return <GenericSection section={section} navigate={navigate} />;
}

function LegacyFoundation() {
  return <main className={`app-shell ${design.shellClass}`} data-scenario={currentScenario}>
    <section className="legacy-hero"><p className="eyebrow">{project.type.replaceAll('-', ' ')}</p><h1>{project.name}</h1><p className="hero-copy">{project.primaryGoal}</p></section>
    <section className="legacy-status"><strong>Composition has not been generated for this low-level factory call.</strong><span>{installedRecipes.length} recipe{installedRecipes.length === 1 ? '' : 's'} installed.</span></section>
  </main>;
}

// Everything here is business information. Factory diagnostics — design label,
// recipe count, composition warnings — are development-only: publishing them
// put build metadata in front of customers.
function SiteFooter({ navigation, navigate }: { navigation: readonly PageSpec[]; navigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  const contact = composed.sections.find((item) => item.type === 'contact-panel');
  const email = contact && binding(contact, 'email');
  const phone = contact && binding(contact, 'phone');
  const areas = composed.sections.find((item) => item.type === 'location-list');
  const areaNames = Array.isArray(areas && binding(areas, 'items')?.value)
    ? (binding(areas!, 'items')!.value as unknown[]).map(itemTitle).filter(Boolean)
    : [];

  return <footer className="site-footer">
    <div className="footer-identity">
      <strong>{project.name}</strong>
      {areaNames.length > 0 && <span>{areaNames.join(' · ')}</span>}
      <small>© {new Date().getFullYear()} {project.name}</small>
    </div>
    <div className="footer-contact">
      {email && <a href={`mailto:${text(email.value)}`}>{text(email.value)}</a>}
      {phone && <a href={`tel:${text(phone.value).replace(/\s+/g, '')}`}>{text(phone.value)}</a>}
      {contact && <SocialLinks profiles={binding(contact, 'profiles')?.value} />}
    </div>
    <nav className="footer-nav" aria-label="Footer navigation">
      {navigation.map((page) => <a href={siteHref(page.path)} onClick={(event) => navigate(event, page.path)} key={page.id}>{page.navigation.label}</a>)}
    </nav>
  </footer>;
}

/**
 * Builder edit mode.
 *
 * Off unless the page is opened with `?__builder=1`, so a deployed site never
 * carries selection behaviour. When on, a click on any element carrying an
 * element key is reported to the parent frame instead of following its default
 * action. The frame reports coordinates only — page, section, element key — and
 * the Console resolves them to a full identity through the service. An element
 * carrying no key is not selectable: the Builder refuses rather than guessing
 * what a click landed on.
 */
function useBuilderBridge(pathname: string, pageId: string) {
  useEffect(() => {
    if (!BUILDER_MODE) return;
    function onClick(event: globalThis.MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest('[data-element-key]');
      if (!(target instanceof HTMLElement)) return;
      event.preventDefault();
      event.stopPropagation();
      for (const marked of document.querySelectorAll('.builder-selected')) marked.classList.remove('builder-selected');
      target.classList.add('builder-selected');
      const section = target.closest('[data-section-id]');
      window.parent.postMessage({
        source: 'app-builder-preview',
        type: 'element-selected',
        pageId,
        sectionId: target.dataset.sectionId ?? (section instanceof HTMLElement ? section.dataset.sectionId : undefined),
        elementKey: target.dataset.elementKey,
        bindingKey: target.dataset.bindingKey ?? null,
        origin: target.dataset.bindingOrigin,
        generated: target.dataset.generated === 'true',
        value: target.dataset.bindingKey ? target.textContent ?? '' : '',
        path: siteRoute(window.location.pathname),
      }, '*');
    }
    document.addEventListener('click', onClick, true);
    document.documentElement.classList.add('builder-mode');
    window.parent.postMessage({ source: 'app-builder-preview', type: 'ready', path: pathname }, '*');
    return () => {
      document.removeEventListener('click', onClick, true);
      document.documentElement.classList.remove('builder-mode');
    };
  }, [pageId, pathname]);
}

export default function App() {
  const [pathname, setPathname] = useState(() => siteRoute(window.location.pathname));
  // An address that matches no page lands on the not-found surface. Falling
  // through to the home page showed the homepage under the wrong URL and told
  // neither the visitor nor a crawler that the page did not exist.
  const activePage = composed.pages.find((page) => page.path === pathname)
    ?? composed.pages.find((page) => /(^|\/)(404|not-found)$/.test(page.path))
    ?? composed.pages[0];
  useBuilderBridge(pathname, activePage?.id ?? '');
  useEffect(() => { initializeRecipes(project); }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onPopState = () => setPathname(siteRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const sectionMap = useMemo(() => new Map(composed.sections.map((section) => [section.id, section])), []);
  if (!composed.pages.length) return <LegacyFoundation />;

  const currentPage = activePage;
  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('/')) return;
    event.preventDefault();
    window.history.pushState({}, '', siteHref(href));
    setPathname(href);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigation = [...composed.pages].filter((page) => page.navigation.visible).sort((a, b) => a.navigation.order - b.navigation.order);
  const followLink = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    setMenuOpen(false);
    navigate(event, href);
  };
  // The conversion action a working header carries. It belongs in a working
  // header and nowhere else, and it is the *site's* action — taken from the
  // entry page rather than from whichever page is open. Reading it per page put
  // the not-found page's "Back to home" recovery link in the header, so a
  // visitor who mistyped an address was offered the same link twice. A page
  // outside the navigation carries none at all.
  const headerAction = (NAVIGATION_FAMILY === 'utility' || NAVIGATION_FAMILY === 'centred') && currentPage.navigation.visible
    ? navigation[0]?.primaryAction ?? null
    : null;
  return <div className={`site-frame ${SHELL_CLASSES}`} data-scenario={currentScenario}>
    {/* The families differ in structure, not paint. `centred` puts the brand on
        its own row above the destinations, so it needs a wrapper the others do
        not have; `register` numbers each destination with a real element;
        `editorial` carries no boxed control at all. Every family keeps the same
        destinations, the same hrefs and the same current-page marking, because
        a header may change what it looks like and never where it goes. */}
    <header className={`site-header nav-${NAVIGATION_FAMILY}`} data-navigation-family={NAVIGATION_FAMILY}>
      <div className="site-header-brand">
        <a className="site-brand" href={siteHref('/')} onClick={(event) => followLink(event, '/')}>{project.name}</a>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >{menuOpen ? 'Close' : 'Menu'}</button>
      </div>
      <nav
        id="primary-navigation"
        aria-label="Primary navigation"
        data-open={menuOpen ? 'true' : 'false'}
        onKeyDown={(event) => { if (event.key === 'Escape') setMenuOpen(false); }}
      >{navigation.map((page, index) => <a className={page.id === currentPage.id ? 'active' : ''} href={siteHref(page.path)} aria-current={page.id === currentPage.id ? 'page' : undefined} onClick={(event) => followLink(event, page.path)} key={page.id}>
        {NAVIGATION_FAMILY === 'register' && <span className="nav-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}
        <span className="nav-label">{page.navigation.label}</span>
      </a>)}</nav>
      {headerAction && <a className="nav-action" href={siteHref(headerAction.href)} onClick={(event) => followLink(event, headerAction.href)}>{headerAction.label}</a>}
    </header>
    <main className="app-shell" data-page-id={currentPage.id} data-mobile-hero={MOBILE_HERO}>
      {currentPage.sectionIds.map((sectionId) => sectionMap.get(sectionId)).filter((section): section is SectionSpec => Boolean(section)).map((section) => <Section key={section.id} section={section} navigate={navigate} />)}
    </main>
    <SiteFooter navigation={navigation} navigate={navigate} />
  </div>;
}

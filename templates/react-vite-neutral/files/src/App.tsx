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
 * How a set of items is presented.
 *
 * The section's variant decides, because a person can choose it. Where it names
 * none of these, the fallback is the old rule: items with nothing but a name
 * are a list, not a grid of tall empty cards.
 */
function Items({ values, variant }: { values: unknown; variant?: string }) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const detailed = values.some((item) => itemDetail(item).length > 0);
  const shape = variant === 'cards' || variant === 'list' || variant === 'features' ? variant : (detailed ? 'cards' : 'list');

  if (shape === 'list') {
    return <ul className="plain-list">{values.map((item, index) => <li key={`${itemTitle(item)}-${index}`}>{itemTitle(item)}</li>)}</ul>;
  }
  if (shape === 'features') {
    return <ul className="feature-list">{values.map((item, index) => <li key={`${itemTitle(item)}-${index}`}>
      <strong>{itemTitle(item)}</strong>
      {itemDetail(item).map((detail) => <span key={detail}>{detail}</span>)}
    </li>)}</ul>;
  }
  return <div className="item-grid">{values.map((item, index) => <article className="content-card" key={`${itemTitle(item)}-${index}`}>
    <h3>{itemTitle(item)}</h3>
    {itemDetail(item).map((detail) => <p key={detail}>{detail}</p>)}
  </article>)}</div>;
}

function Actions({ actions, navigate }: { actions: readonly Action[]; navigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  if (!actions.length) return null;
  return <div className="section-actions">{actions.map((action, index) => {
    const external = /^https?:\/\//.test(action.href);
    return <a
      className={index === 0 ? 'button primary-action' : 'button secondary-action'}
      data-element-key={`action:${index}`}
      href={action.href}
      onClick={(event) => navigate(event, action.href)}
      key={`${action.label}-${action.href}`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >{action.label}</a>;
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

  if (section.type === 'hero') {
    const [lead] = assetsFor(section);
    return <section className={`page-section hero-section variant-${section.variant}${lead ? ' has-image' : ''}`} id={section.id} data-section-id={section.id} data-element-key="section">
      <div className="hero-copy-column">
        {eyebrow && <p className="eyebrow" {...editable(section, eyebrow)}>{text(eyebrow.value)}</p>}
        {title && <h1 {...editable(section, title)}>{text(title.value)}</h1>}
        {body && <p className="hero-copy" {...editable(section, body)}>{text(body.value)}</p>}
        <Actions actions={section.actions} navigate={navigate} />
      </div>
      {lead && <Picture asset={lead} role="hero-16x9" className="hero-image" sizes="(max-width: 880px) 100vw, 50vw" />}
    </section>;
  }

  if (section.type === 'contact-panel') {
    const email = binding(section, 'email');
    const phone = binding(section, 'phone');
    const address = binding(section, 'address');
    const website = binding(section, 'website');
    return <section className="page-section contact-section" id={section.id} data-section-id={section.id} data-element-key="section">
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
      {navigation.map((page) => <a href={page.path} onClick={(event) => navigate(event, page.path)} key={page.id}>{page.navigation.label}</a>)}
    </nav>
    {import.meta.env.DEV && <div className="factory-meta" data-development-only="true">
      <span>{design.label}</span>
      <span>{installedRecipes.length} deterministic capabilities</span>
      <span>{composed.warnings.length ? `${composed.warnings.length} composition warnings` : 'Composition complete'}</span>
    </div>}
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
        path: window.location.pathname,
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
  const [pathname, setPathname] = useState(() => window.location.pathname || '/');
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
    const onPopState = () => setPathname(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const sectionMap = useMemo(() => new Map(composed.sections.map((section) => [section.id, section])), []);
  if (!composed.pages.length) return <LegacyFoundation />;

  const currentPage = activePage;
  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('/')) return;
    event.preventDefault();
    window.history.pushState({}, '', href);
    setPathname(href);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigation = [...composed.pages].filter((page) => page.navigation.visible).sort((a, b) => a.navigation.order - b.navigation.order);
  const followLink = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    setMenuOpen(false);
    navigate(event, href);
  };
  return <div className={`site-frame ${design.shellClass}`} data-scenario={currentScenario}>
    <header className="site-header">
      <a className="site-brand" href="/" onClick={(event) => followLink(event, '/')}>{project.name}</a>
      {/* A site with more than a handful of surfaces wraps its navigation over
          three or four rows on a phone, which is collapsed rather than
          designed. The toggle is CSS-hidden above the breakpoint, so wide
          screens keep the single row they already had. */}
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={menuOpen}
        aria-controls="primary-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >{menuOpen ? 'Close' : 'Menu'}</button>
      <nav id="primary-navigation" aria-label="Primary navigation" data-open={menuOpen ? 'true' : 'false'}>{navigation.map((page) => <a className={page.id === currentPage.id ? 'active' : ''} href={page.path} onClick={(event) => followLink(event, page.path)} key={page.id}>{page.navigation.label}</a>)}</nav>
    </header>
    <main className="app-shell" data-page-id={currentPage.id}>
      {currentPage.sectionIds.map((sectionId) => sectionMap.get(sectionId)).filter((section): section is SectionSpec => Boolean(section)).map((section) => <Section key={section.id} section={section} navigate={navigate} />)}
    </main>
    <SiteFooter navigation={navigation} navigate={navigate} />
  </div>;
}

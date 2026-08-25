import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { project } from './generated/project';
import { design } from './generated/design';
import { composition } from './generated/composition';
import { initializeRecipes, installedRecipes } from './generated/recipes';
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

const composed = composition as unknown as ProjectComposition;

function text(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

function binding(section: SectionSpec, key: string) {
  return section.bindings.find((item) => item.key === key);
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

function itemDetail(value: unknown) {
  const entries = primitiveEntries(value).filter(([key]) => !['name', 'title', 'quote', 'value', 'label'].includes(key));
  return entries.map(([key, item]) => `${key.replaceAll(/([A-Z])/g, ' $1')}: ${String(item)}`);
}

function Items({ values, className = 'item-grid' }: { values: unknown; className?: string }) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return <div className={className}>{values.map((item, index) => <article className="content-card" key={`${itemTitle(item)}-${index}`}>
    <h3>{itemTitle(item)}</h3>
    {itemDetail(item).map((detail) => <p key={detail}>{detail}</p>)}
  </article>)}</div>;
}

function Actions({ actions, navigate }: { actions: readonly Action[]; navigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  if (!actions.length) return null;
  return <div className="section-actions">{actions.map((action, index) => <a className={index === 0 ? 'button primary-action' : 'button secondary-action'} href={action.href} onClick={(event) => navigate(event, action.href)} key={`${action.label}-${action.href}`}>{action.label}</a>)}</div>;
}

function GenericSection({ section, navigate }: { section: SectionSpec; navigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  const title = binding(section, 'title');
  const body = binding(section, 'body');
  const itemBindings = section.bindings.filter((item) => !['title', 'body', 'eyebrow', 'email', 'phone', 'address'].includes(item.key));
  return <section className={`page-section section-${section.type} variant-${section.variant}`} id={section.id} data-section-id={section.id} data-section-type={section.type}>
    <div className="section-heading">
      {title && <h2 data-binding-origin={title.origin} data-generated={String(title.generated)}>{text(title.value)}</h2>}
      {body && <p className="section-copy" data-binding-origin={body.origin} data-generated={String(body.generated)}>{text(body.value)}</p>}
    </div>
    {itemBindings.map((item) => <Items key={item.key} values={item.value} />)}
    <Actions actions={section.actions} navigate={navigate} />
  </section>;
}

function Section({ section, navigate }: { section: SectionSpec; navigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  const title = binding(section, 'title');
  const body = binding(section, 'body');
  const eyebrow = binding(section, 'eyebrow');

  if (section.type === 'hero') return <section className={`page-section hero-section variant-${section.variant}`} id={section.id} data-section-id={section.id}>
    {eyebrow && <p className="eyebrow" data-binding-origin={eyebrow.origin}>{text(eyebrow.value)}</p>}
    {title && <h1 data-binding-origin={title.origin} data-generated={String(title.generated)}>{text(title.value)}</h1>}
    {body && <p className="hero-copy" data-binding-origin={body.origin} data-generated={String(body.generated)}>{text(body.value)}</p>}
    <Actions actions={section.actions} navigate={navigate} />
  </section>;

  if (section.type === 'contact-panel') {
    const email = binding(section, 'email');
    const phone = binding(section, 'phone');
    const address = binding(section, 'address');
    return <section className="page-section contact-section" id={section.id} data-section-id={section.id}>
      {title && <h2>{text(title.value)}</h2>}
      <div className="contact-grid">
        {email && <a href={`mailto:${text(email.value)}`} data-binding-origin={email.origin}><span>Email</span><strong>{text(email.value)}</strong></a>}
        {phone && <a href={`tel:${text(phone.value).replace(/\s+/g, '')}`} data-binding-origin={phone.origin}><span>Phone</span><strong>{text(phone.value)}</strong></a>}
        {address && <div data-binding-origin={address.origin}><span>Address</span><strong>{text(address.value)}</strong></div>}
      </div>
    </section>;
  }

  if (section.type === 'cta') return <section className="page-section cta-section" id={section.id} data-section-id={section.id}>
    <div>{title && <h2>{text(title.value)}</h2>}{body && <p>{text(body.value)}</p>}</div>
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

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname || '/');
  useEffect(() => { initializeRecipes(project); }, []);
  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const sectionMap = useMemo(() => new Map(composed.sections.map((section) => [section.id, section])), []);
  if (!composed.pages.length) return <LegacyFoundation />;

  const currentPage = composed.pages.find((page) => page.path === pathname) ?? composed.pages[0];
  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('/')) return;
    event.preventDefault();
    window.history.pushState({}, '', href);
    setPathname(href);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigation = [...composed.pages].filter((page) => page.navigation.visible).sort((a, b) => a.navigation.order - b.navigation.order);
  return <div className={`site-frame ${design.shellClass}`} data-scenario={currentScenario}>
    <header className="site-header">
      <a className="site-brand" href="/" onClick={(event) => navigate(event, '/')}>{project.name}</a>
      <nav aria-label="Primary navigation">{navigation.map((page) => <a className={page.id === currentPage.id ? 'active' : ''} href={page.path} onClick={(event) => navigate(event, page.path)} key={page.id}>{page.navigation.label}</a>)}</nav>
    </header>
    <main className="app-shell" data-page-id={currentPage.id}>
      {currentPage.sectionIds.map((sectionId) => sectionMap.get(sectionId)).filter((section): section is SectionSpec => Boolean(section)).map((section) => <Section key={section.id} section={section} navigate={navigate} />)}
    </main>
    <footer className="site-footer"><div><strong>{project.name}</strong><span>{project.primaryGoal}</span></div><div className="factory-meta"><span>{design.label}</span><span>{installedRecipes.length} deterministic capabilities</span><span>{composed.warnings.length ? `${composed.warnings.length} composition warnings` : 'Composition complete'}</span></div></footer>
  </div>;
}

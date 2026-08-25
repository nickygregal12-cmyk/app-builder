type ProjectContext = {
  name: string;
  primaryGoal: string;
};

function ensureDescription() {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.append(meta);
  }
  return meta;
}

export const recipe = {
  id: 'seo',
  label: 'SEO defaults',
};

export function setup(project: ProjectContext) {
  document.title = project.name;
  ensureDescription().content = project.primaryGoal;
}

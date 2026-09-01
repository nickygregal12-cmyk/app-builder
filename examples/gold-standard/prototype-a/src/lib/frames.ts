/**
 * Reconcile the authored project data with the frames that actually exist on disk.
 *
 * Sourcing is rate-limited and partial runs are normal, so the site has to be buildable from
 * whatever imagery has arrived. The rule is the one this whole programme is about: it may
 * render less than the data declares, but it may not do so **silently**. Anything dropped is
 * printed at build time and counted, because a page that quietly shows three of six is how
 * the factory's composer already behaves and is the defect this corpus exists to name.
 */
import images from '../assets/images.json';
import { projects, type Project } from '../data/bureau';

const available = new Set((images as Array<{ slug: string }>).map((image) => image.slug));

export const has = (slug: string) => available.has(slug);

/** A project with its unavailable frames removed. */
export type ResolvedProject = Project & { missing: number };

const resolve = (project: Project): ResolvedProject => {
  const frames = project.frames.filter((frame) => available.has(frame.slug));
  return { ...project, frames, missing: project.frames.length - frames.length };
};

const resolved = projects.map(resolve);

/** Projects that can be shown at all. A project with no photograph is not a project here. */
export const shownProjects = resolved.filter((project) => project.frames.length > 0);

/**
 * The number the site is entitled to quote. It is what will actually render, not what the
 * data declares — a page that announces six buildings and shows five reads as an incomplete
 * portfolio, which an independent reviewer scored as a credibility defect and was right to.
 * The discrepancy is still reported at build time; it is just never spoken to the visitor.
 */
export const declaredCount = projects.filter((project) =>
  project.frames.some((frame) => available.has(frame.slug))).length;

const droppedProjects = resolved.filter((project) => project.frames.length === 0);
const droppedFrames = resolved.reduce((total, project) => total + project.missing, 0);

if (droppedProjects.length || droppedFrames) {
  console.warn(
    `[frames] rendering ${shownProjects.length} of ${projects.length} projects; ` +
    `${droppedFrames} frame(s) missing` +
    (droppedProjects.length ? `; dropped entirely: ${droppedProjects.map((p) => p.slug).join(', ')}` : ''),
  );
}

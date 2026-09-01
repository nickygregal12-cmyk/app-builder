/**
 * The sample box.
 *
 * Four pots for £22, and the box is the only transactional object on the site — there is no
 * basket for paint, because the argument the whole site makes is that you cannot choose paint
 * from a screen. Letting somebody buy twenty litres of Oxblood on the strength of a rendering
 * would contradict the page it is rendered on.
 *
 * State lives in `localStorage` and is broadcast as an event, so the header count, the add
 * buttons and the box page stay in step without any of them holding a reference to the others.
 * A prototype has no server; what it does have is a mechanic that behaves correctly, which is
 * the part a reviewer can actually see.
 */

export const BOX_KEY = 'marlpit.box';
export const BOX_EVENT = 'marlpit:box';
/** Four is the product, not a limit chosen for the interface. */
export const BOX_SIZE = 4;
export const BOX_PRICE = 22;

export function readBox(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(BOX_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((entry) => typeof entry === 'string').slice(0, BOX_SIZE) : [];
  } catch {
    // A corrupt value is not worth a broken page. Start again rather than throw on load.
    return [];
  }
}

function write(slugs: string[]) {
  localStorage.setItem(BOX_KEY, JSON.stringify(slugs));
  window.dispatchEvent(new CustomEvent(BOX_EVENT, { detail: slugs }));
}

/**
 * Add or remove, and say which happened.
 *
 * The same control does both, because a swatch you have chosen and a swatch you have not are
 * the same object in two states — and a separate "remove" affordance on every one of thirty-six
 * tiles would be an interface built around the implementation.
 */
export function toggle(slug: string): { slugs: string[]; added: boolean; full: boolean } {
  const slugs = readBox();
  const index = slugs.indexOf(slug);
  if (index !== -1) {
    slugs.splice(index, 1);
    write(slugs);
    return { slugs, added: false, full: false };
  }
  if (slugs.length >= BOX_SIZE) return { slugs, added: false, full: true };
  slugs.push(slug);
  write(slugs);
  return { slugs, added: true, full: slugs.length >= BOX_SIZE };
}

export function remove(slug: string) {
  write(readBox().filter((entry) => entry !== slug));
}

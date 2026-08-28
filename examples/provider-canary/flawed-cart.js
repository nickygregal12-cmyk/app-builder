/**
 * SYNTHETIC CANARY FIXTURE — not App Builder code, not used by anything.
 *
 * A deliberately flawed shopping-cart helper, invented for this file. It exists
 * so a provider can be asked to review something whose defects are already
 * known, and it contains no App Builder source, no customer material and no
 * private business fact — which is what makes it safe to send to a provider
 * approved only for `synthetic` material.
 *
 * The defects are ordinary correctness bugs, not exploits. A fixture that
 * carried a real attack would be a fixture nobody could safely store, and
 * "spot the vulnerability" is not the capability the first canary is testing.
 *
 * Expected findings are declared in `expected-findings.json` beside this file.
 * Do not fix these bugs. Repairing the fixture destroys the measurement.
 */

/** DEFECT 1: no input validation — `items` may be undefined, and `.reduce` throws. */
export function cartTotal(items, taxRate) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return subtotal * (1 + taxRate);
}

/**
 * DEFECT 2: the `await` is missing, so this returns a promise rather than a
 * price, and every caller silently gets `NaN` downstream.
 */
export async function priceWithDiscount(items, fetchDiscount) {
  const discount = fetchDiscount();
  return cartTotal(items, 0.2) - discount;
}

/**
 * DEFECT 3: the catch swallows the error and returns a successful-looking
 * value, so a failed write is indistinguishable from a saved cart.
 */
export async function saveCart(store, cart) {
  try {
    await store.write(cart);
    return { saved: true };
  } catch {
    return { saved: true };
  }
}

/**
 * DEFECT 4: unbounded loop over an untrusted count. A caller passing a large
 * `repeat` allocates without limit.
 */
export function expandBundle(item, repeat) {
  const out = [];
  for (let index = 0; index < repeat; index += 1) out.push({ ...item });
  return out;
}

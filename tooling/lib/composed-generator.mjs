import fs from 'node:fs';
import path from 'node:path';
import { assertContract } from '@app-builder/contracts';
import { applyContentOverrides, applySectionVariants, composeProject, deriveElementIdentities, stripContentOverrides, stripSectionVariants } from '../../packages/composition/src/index.js';
import { generateProject } from './generator.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function renderModule(name, value) {
  return `export const ${name} = ${JSON.stringify(value, null, 2)} as const;\n`;
}

function safeAssetFile(sourceDir, uri) {
  // Variant URIs come from the knowledge pack, which is data rather than
  // authority, so a traversing path must never resolve outside the ingested
  // asset directory.
  const base = path.resolve(sourceDir);
  const target = path.resolve(base, uri.replace(/^assets\//, ''));
  return target.startsWith(`${base}${path.sep}`) && fs.existsSync(target) ? target : null;
}

/**
 * Copy the variants of every placed asset into the generated repository and
 * describe them for the template. Assets the composition did not place are not
 * copied: an unplaced asset is not part of the product.
 *
 * A variant marked `reviewBeforePublish` is withheld until someone has approved
 * it. Those are the smart crops, chosen by an attention heuristic that is right
 * often enough to be trusted and wrong often enough to cut off a head. The full
 * image still publishes: the template falls back to the widest responsive
 * variant and the layout sets its own aspect ratio, so an unreviewed crop costs
 * a considered framing rather than the picture.
 */
function materializeAssets(composition, knowledgePack, { assetSourceDir, outputDir, assetDecisions = [] }) {
  const placed = new Set(composition.sections.flatMap((section) => section.assetIds));
  const assets = (knowledgePack?.assets ?? []).filter((asset) => placed.has(asset.id));
  if (!assets.length || !assetSourceDir) return {};

  const cropReviews = new Map(assetDecisions.filter((entry) => entry?.assetId).map((entry) => [entry.assetId, entry.cropReview ?? 'pending']));
  const publicDir = path.join(outputDir, 'public/assets');
  const manifest = {};
  for (const asset of assets) {
    const cropReview = cropReviews.get(asset.id) ?? 'pending';
    const variants = [];
    for (const variant of asset.variants ?? []) {
      if (variant.reviewBeforePublish && cropReview !== 'approved') continue;
      const source = safeAssetFile(assetSourceDir, variant.uri);
      if (!source) continue;
      const filename = path.basename(source);
      fs.mkdirSync(publicDir, { recursive: true });
      fs.copyFileSync(source, path.join(publicDir, filename));
      variants.push({ role: variant.role, format: variant.format, width: variant.width ?? null, height: variant.height ?? null, uri: `/assets/${filename}` });
    }
    if (!variants.length) continue;
    manifest[asset.id] = {
      id: asset.id,
      kind: asset.kind,
      provenance: asset.provenance,
      assetStatus: asset.assetStatus,
      rightsStatus: asset.rightsStatus,
      alt: asset.metadata?.alt ?? null,
      variants,
    };
  }
  return manifest;
}

/**
 * Derive and record Builder Element Identity for a build.
 *
 * The index is builder metadata beside the composition rather than a module the
 * app imports, so direct manipulation never becomes a runtime requirement of
 * the repository someone deploys.
 *
 * It is derived from the deterministic baseline rather than from the edited
 * composition. Identity is a property of what the factory built; a human
 * sentence replaces a value without moving the element it lives in, so writing
 * a paragraph must not invalidate every address in the build.
 */
function writeElementIdentityIndex(outputDir, { composition, template, projectId, assets = {} }) {
  if (!template?.presentation) return null;
  const index = assertContract('element-identity', deriveElementIdentities({
    // Identity describes what the factory built. Neither a rewritten sentence
    // nor a chosen presentation moves the element it applies to.
    composition: stripSectionVariants(stripContentOverrides(composition)),
    presentation: template.presentation,
    projectId,
    templateId: template.id,
    templateVersion: template.version,
    assets,
  }));
  writeJson(path.join(path.resolve(outputDir), '.app-builder/element-identity.json'), index);
  return index;
}

export function generateComposedProject(manifest, outputDir, { knowledgePack = null, assetSourceDir = null, contentOverrides = [], assetDecisions = [], sectionVariants = [], designChoices = {}, projectId = null, factoryRoot = process.cwd(), catalog } = {}) {
  const plan = generateProject(manifest, outputDir, { factoryRoot, designChoices, ...(catalog ? { catalog } : {}) });
  // The composition becomes a durable artifact here, so this is where its
  // contract is enforced. Declaring the family was not enough on its own: two
  // new section types reached generated projects without ever being added to
  // the schema, because nothing validated the output.
  // Human edits are replayed over freshly composed output, so a rebuild picks
  // up new source material without discarding what someone wrote by hand.
  const composition = assertContract('composition', applySectionVariants(applyContentOverrides(composeProject({ manifest, knowledgePack, assetDecisions }), contentOverrides), sectionVariants));
  const out = path.resolve(outputDir);
  const assets = materializeAssets(composition, knowledgePack, { assetSourceDir, outputDir: out, assetDecisions });
  writeJson(path.join(out, '.app-builder/composition.json'), composition);
  fs.mkdirSync(path.join(out, 'src/generated'), { recursive: true });
  fs.writeFileSync(path.join(out, 'src/generated/composition.ts'), renderModule('composition', composition));
  fs.writeFileSync(path.join(out, 'src/generated/assets.ts'), renderModule('assets', assets));
  // Identity is derived from what was actually composed for this build, so a
  // rendered element either appears here or cannot be edited at all.
  const elementIdentity = projectId
    ? writeElementIdentityIndex(out, { composition, template: plan.template, projectId, assets })
    : null;
  return { plan, composition, assets, elementIdentity };
}

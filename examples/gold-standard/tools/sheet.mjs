#!/usr/bin/env node
/**
 * Contact sheets, because a filename is not a photograph.
 *
 * Curating architectural imagery from titles alone is how a corpus ends up with a shed in a
 * muddy field as its lead frame. Every candidate gets looked at, at a size where the subject
 * is legible, with its index printed on it so a choice can be recorded as a number.
 *
 *   node sheet.mjs candidates.json out-prefix [perSheet] [from] [to]
 */
import fs from 'node:fs';
import sharp from 'sharp';

const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const prefix = process.argv[3] ?? 'sheet';
const perSheet = Number(process.argv[4] ?? 24);
const from = Number(process.argv[5] ?? 0);
const to = Number(process.argv[6] ?? rows.length);
const slice = rows.slice(from, to);

const COLS = 6;
const CELL = 300;
const LABEL = 26;

for (let start = 0; start < slice.length; start += perSheet) {
  const batch = slice.slice(start, start + perSheet);
  const sheetRows = Math.ceil(batch.length / COLS);
  const canvas = sharp({
    create: { width: COLS * CELL, height: sheetRows * (CELL + LABEL), channels: 3, background: '#111' },
  });

  const tiles = [];
  for (const [i, row] of batch.entries()) {
    const index = from + start + i;
    try {
      const bytes = Buffer.from(await (await fetch(row.thumb, {
        headers: { 'User-Agent': 'app-builder-gold-standard/1.0' },
      })).arrayBuffer());
      const img = await sharp(bytes).resize(CELL, CELL, { fit: 'cover' }).toBuffer();
      tiles.push({ input: img, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * (CELL + LABEL) });
      const label = await sharp({
        create: { width: CELL, height: LABEL, channels: 3, background: '#111' },
      }).composite([{
        input: Buffer.from(
          `<svg width="${CELL}" height="${LABEL}"><text x="4" y="18" font-family="monospace" font-size="15" fill="#fff">${index}  ${row.ratio}  ${String(row.title).slice(0, 22).replace(/[<&]/g, '')}</text></svg>`,
        ),
        top: 0, left: 0,
      }]).png().toBuffer();
      tiles.push({ input: label, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * (CELL + LABEL) + CELL });
    } catch {
      // A frame that will not fetch is simply not a candidate; the gap in the sheet says so.
    }
  }

  const name = `${prefix}-${String(start / perSheet + 1).padStart(2, '0')}.jpg`;
  await canvas.composite(tiles).jpeg({ quality: 74 }).toFile(name);
  console.log(name, `${batch.length} frames, indices ${from + start}–${from + start + batch.length - 1}`);
}

/**
 * Turn raw captures into evidence a reviewer can actually read.
 *
 * Two jobs. Wide captures come down to 1000px so the set is a few megabytes rather than a
 * few hundred. Tall ones get cut into panels — and that second job is the important one.
 *
 * A 390×8076 phone capture is a 1:20 ribbon. Fitted into any viewing pane it renders body
 * copy at a couple of pixels, and an independent reviewer marked the same submission down
 * for "extremely small" metadata and "tiny" navigation three revisions running, on pages
 * whose type had been getting *larger* each time. That is the harness scoring itself. The
 * page is unchanged; it is presented at a shape that can be read.
 *
 * The full ribbon is kept alongside the panels, so nothing is cropped out of the record and
 * the segmentation can be checked against it.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = process.argv[2];
const MAX_WIDTH = 1000;
/** Beyond about four widths tall, a full-page capture stops being legible when fitted. */
const MAX_ASPECT = 4;

for (const file of fs.readdirSync(dir).filter((n) => n.endsWith('.png'))) {
  const source = path.join(dir, file);
  const stem = file.replace(/\.png$/, '');
  const resized = await sharp(source)
    .resize(MAX_WIDTH, null, { withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const write = (buffer, name) => sharp(buffer).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(dir, name));

  if (height <= width * MAX_ASPECT) {
    await write(resized.data, `${stem}.jpg`);
  } else {
    const panels = Math.ceil(height / (width * MAX_ASPECT));
    const panelHeight = Math.ceil(height / panels);
    // JPEG tops out at 65535px per side. A page tall enough to exceed that has no readable
    // ribbon anyway, so the panels are the whole record and the omission is reported rather
    // than crashing the run half way through a directory.
    if (height <= 65535) await write(resized.data, `${stem}--full.jpg`);
    else console.log(`${stem}: ${height}px is beyond JPEG's limit; panels only, no full ribbon`);
    for (let i = 0; i < panels; i += 1) {
      const top = i * panelHeight;
      const buffer = await sharp(resized.data)
        .extract({ left: 0, top, width, height: Math.min(panelHeight, height - top) })
        .toBuffer();
      await write(buffer, `${stem}--${i + 1}of${panels}.jpg`);
    }
    console.log(`${stem}: ${width}×${height} → ${panels} panels`);
  }
  fs.rmSync(source);
}

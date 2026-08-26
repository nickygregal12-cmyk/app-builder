import fs from 'node:fs';
import ExcelJS from 'exceljs';

const wb = new ExcelJS.Workbook();
wb.creator = 'NBM acceptance operator';
wb.created = new Date('2026-08-26T00:00:00.000Z');

// GROUP A — VERIFIED PUBLIC FACTS
const facts = wb.addWorksheet('A. Verified public facts');
facts.addRow(['Field', 'Value', 'Source', 'Verification']);
for (const row of [
  ['Business name', 'nbm Construction Cost Consultants', 'Public website www.nbm.bz', 'search-corroborated'],
  ['Legal name', 'NBM CONSTRUCTION COST CONSULTANTS LIMITED', 'Companies House register SC228801', 'owner-supplied'],
  ['Company number', 'SC228801', 'Companies House register SC228801', 'owner-supplied'],
  ['Company status', 'Active', 'Companies House register SC228801', 'owner-supplied'],
  ['Incorporated on', '6 March 2002', 'Companies House register SC228801', 'owner-supplied'],
  ['Registered office', '9 Woodside Crescent, Glasgow, G3 7UL', 'Companies House register SC228801', 'owner-supplied'],
  ['Principal activity', 'Quantity surveying activities', 'Companies House register SC228801', 'owner-supplied'],
  ['Website', 'https://www.nbm.bz/', 'Public website www.nbm.bz', 'search-corroborated'],
  ['Telephone', '0141 333 1836', 'Public website www.nbm.bz', 'search-corroborated'],
]) facts.addRow(row);

const services = wb.addWorksheet('A. Services');
services.addRow(['Service', 'Description', 'Source', 'Verification']);
for (const row of [
  ['Cost Consultancy and Quantity Surveying', 'Chartered quantity surveying and construction cost management across the project lifecycle.', 'Public website www.nbm.bz', 'search-corroborated'],
  ["Employer's Agent", "Employer's Agent duties on design-and-build contracts.", 'Public website www.nbm.bz', 'search-corroborated'],
  ['Project Management', 'Construction project management for client-side delivery.', 'Public website www.nbm.bz', 'search-corroborated'],
  ['Building Surveying and Defect Analysis', 'Building surveying services including defect analysis and condition reporting.', 'Public website www.nbm.bz', 'search-corroborated'],
]) services.addRow(row);

const offices = wb.addWorksheet('A. Offices');
offices.addRow(['Location', 'Address', 'Phone', 'Source', 'Verification']);
offices.addRow(['Glasgow', '9 Woodside Crescent, Glasgow, G3 7UL', '0141 333 1836', 'Companies House register SC228801; public website', 'owner-supplied']);
offices.addRow(['Edinburgh', '', '', 'Public website www.nbm.bz', 'search-corroborated']);

// GROUP B — USER ACCEPTANCE INTENT
const intent = wb.addWorksheet('B. Acceptance intent');
intent.addRow(['Item', 'Intent']);
for (const row of [
  ['Target impression', 'Credible, premium, established professional consultancy.'],
  ['Avoid', 'Generic SaaS/startup styling, novelty for novelty’s sake, excessive animation.'],
  ['Prioritise', 'Services, evidence of experience and projects, trust, clear contact conversion, careers where appropriate.'],
  ['Devices', 'Desktop and mobile both matter; mobile must feel designed rather than collapsed.'],
  ['Sector character', 'Construction/property-sector character should be visible without becoming clichéd.'],
  ['Design preference', 'Restrained modern design preferred over generic corporate template output.'],
  ['Imagery', 'Imagery must be genuinely relevant and rights-safe.'],
  ['Prohibited claims', 'No unsupported performance, client, award, accreditation or experience claims.'],
]) intent.addRow(row);

const rights = wb.addWorksheet('B. Rights declaration');
rights.addRow(['Statement']);
for (const row of [
  ['The business owner approves this operator-authored spreadsheet as source material for the App Builder acceptance exercise.'],
  ['That approval covers the factual and operator-authored content in this workbook only.'],
  ['It is NOT approval to republish nbm website photographs, logo files, staff photographs, client or project photography, or any third-party mark.'],
  ['The public nbm website remains reference-only. Public visibility does not grant republication rights.'],
  ['Project and case-study names are deliberately omitted because they could not be re-verified through source ingestion in this run.'],
]) rights.addRow(row);

for (const sheet of wb.worksheets) {
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 46; });
}

const out = process.argv[2] ?? 'examples/genuine-business/nbm-genuine-business-acceptance.xlsx';
fs.writeFileSync(out, Buffer.from(await wb.xlsx.writeBuffer()));
console.log('wrote', out, fs.statSync(out).size, 'bytes');

#!/usr/bin/env node
/**
 * populate-seed-data.js
 *
 * Reads a JSON column from an XLSX file and overwrites seed-data.json.
 * Edit the CONFIG block below, then run:
 *
 *   node src/database/seed/populate-seed-data.js
 *
 * The script:
 *   1. Clears seed-data.json
 *   2. Reads non-empty cells in the configured column within the row range
 *   3. Parses each cell value as JSON
 *   4. Writes the resulting array to seed-data.json
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// ---------------------------------------------------------------------------
// CONFIG — edit these values before running
// ---------------------------------------------------------------------------
const XLSX_FILE_PATH = '/Users/Subhram/Downloads/media_tags_json_per_row.xlsx';
const JSON_COLUMN    = 'C';    // column letter that contains the JSON
const START_ROW      = 2;      // first data row (1-based; row 1 is the header)
const END_ROW        = 1922;   // last data row  (1-based); set to null to read until the last row in the sheet
// ---------------------------------------------------------------------------

const xlsxFilePath = path.resolve(XLSX_FILE_PATH);
const columnLetter = JSON_COLUMN.toUpperCase();
const startRowArg  = START_ROW;
const endRowArg    = END_ROW;

// Destination: seed-data.json lives in the same folder as this script
const seedDataPath = path.join(__dirname, 'seed-data.json');

// ---------------------------------------------------------------------------
// Validate input file
// ---------------------------------------------------------------------------
if (!fs.existsSync(xlsxFilePath)) {
  console.error(`Error: File not found: ${xlsxFilePath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Read the XLSX file
// ---------------------------------------------------------------------------
console.log(`Reading   : ${xlsxFilePath}`);
console.log(`Column    : ${columnLetter}`);

let workbook;
try {
  workbook = XLSX.readFile(xlsxFilePath, { cellText: true, cellDates: false });
} catch (err) {
  console.error(`Error reading XLSX file: ${err.message}`);
  process.exit(1);
}

// Use the first sheet
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
console.log(`Sheet     : "${sheetName}"`);

// Get the range of the sheet
const ref = worksheet['!ref'];
if (!ref) {
  console.error('Error: Sheet appears to be empty.');
  process.exit(1);
}

const range = XLSX.utils.decode_range(ref);
const targetColIndex = XLSX.utils.decode_col(columnLetter);

if (targetColIndex > range.e.c) {
  console.error(
    `Error: Column ${columnLetter} is outside the sheet range (max column: ${XLSX.utils.encode_col(range.e.c)}).`
  );
  process.exit(1);
}

// Convert 1-based config values to 0-based row indices used by SheetJS
const startRowIdx = startRowArg - 1;                                        // e.g. row 2 → index 1
const endRowIdx   = endRowArg !== null ? endRowArg - 1 : range.e.r;        // null → last row in sheet

if (isNaN(startRowIdx) || startRowIdx < 1) {
  console.error('Error: START_ROW must be >= 2 (row 1 is the header).');
  process.exit(1);
}
if (isNaN(endRowIdx) || endRowIdx < startRowIdx) {
  console.error('Error: END_ROW must be >= START_ROW.');
  process.exit(1);
}

const startRow1 = startRowIdx + 1; // back to 1-based for display
const endRow1   = endRowIdx   + 1;
console.log(`Start row : ${startRow1}`);
console.log(`End row   : ${endRow1}`);

// ---------------------------------------------------------------------------
// Extract and parse JSON from each cell within the configured row range
// ---------------------------------------------------------------------------
const results = [];
let skipped = 0;
let errors = 0;

for (let rowIdx = startRowIdx; rowIdx <= endRowIdx; rowIdx++) {
  const cellAddress = XLSX.utils.encode_cell({ r: rowIdx, c: targetColIndex });
  const cell = worksheet[cellAddress];

  if (!cell || cell.v === undefined || cell.v === null || cell.v === '') {
    skipped++;
    continue;
  }

  const rawValue = String(cell.v).trim();
  if (!rawValue) {
    skipped++;
    continue;
  }

  try {
    const parsed = JSON.parse(rawValue);
    results.push(parsed);
  } catch (parseErr) {
    errors++;
    console.warn(
      `Warning: Row ${rowIdx + 1} — could not parse JSON (skipping). ` +
        `Preview: ${rawValue.slice(0, 80)}...`
    );
  }
}

console.log(`\nRows processed : ${results.length}`);
console.log(`Rows skipped   : ${skipped}`);
console.log(`Parse errors   : ${errors}`);

if (results.length === 0) {
  console.error('\nError: No valid JSON records found. seed-data.json was NOT modified.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write to seed-data.json
// ---------------------------------------------------------------------------
try {
  fs.writeFileSync(seedDataPath, JSON.stringify(results, null, 2) + '\n', 'utf8');
  console.log(`\nDone. seed-data.json updated with ${results.length} records.`);
  console.log(`Location: ${seedDataPath}`);
} catch (writeErr) {
  console.error(`Error writing seed-data.json: ${writeErr.message}`);
  process.exit(1);
}

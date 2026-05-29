// Cross-platform consistency tests driven by:
//   internal-docs/percentage-bucketing-test-vectors.csv
//
// To port to a new SDK: copy the CSV and write equivalent test logic.
// Canonical spec: internal-docs/SDK-PERCENTAGE-BUCKETING.md

import * as fs from 'fs';
import * as path from 'path';
import { isInPercentageBucket } from './percentageBucketing';

const djb2Hash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
};
const unsignedHash = (input: string, salt: string) => djb2Hash(input + ':' + salt) >>> 0;

type Row = { mode: string; input: string; salt: string; unsignedHash: number; minPct: number };

// Resolve CSV relative to the repo root.
const csvPath = path.resolve(process.cwd(), '../internal-docs/percentage-bucketing-test-vectors.csv');

// If the CSV is missing we skip the entire suite – useful for CI environments where the file is not version‑controlled.
let rows: Row[] = [];
let suiteEnabled = true;
if (fs.existsSync(csvPath)) {
    rows = fs.readFileSync(csvPath, 'utf8')
        .trim()
        .split('\n')
        .slice(1) // skip header
        .map(line => {
            const [mode, input, salt, hash, minPct] = line.split(',');
            return { mode, input, salt, unsignedHash: Number(hash), minPct: Number(minPct) };
        });
} else {
    suiteEnabled = false;
    console.warn('Skipping cross‑platform bucketing tests: CSV file not found at', csvPath);
}

const describeOrSkip = suiteEnabled ? describe : describe.skip;

describeOrSkip('cross-platform consistency — 1000 samples (500 VISITOR + 500 ASSIGNMENT)', () => {
    test.each(rows)('$mode $input → hash=$unsignedHash minPct=$minPct%', (r) => {
        // Use the top-level unsignedHash helper (same algorithm as the SDK).
        expect(unsignedHash(r.input, r.salt)).toBe(r.unsignedHash);
        expect(isInPercentageBucket(r.input, r.minPct - 0.0001, r.salt)).toBe(false);
        expect(isInPercentageBucket(r.input, r.minPct, r.salt)).toBe(true);
        expect(isInPercentageBucket(r.input, 100, r.salt)).toBe(true);
        expect(isInPercentageBucket(r.input, 0, r.salt)).toBe(false);
    });
});

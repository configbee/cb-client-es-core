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

const csvPath = path.resolve(process.cwd(), '../internal-docs/percentage-bucketing-test-vectors.csv');
const rows: Row[] = fs.readFileSync(csvPath, 'utf8')
    .trim().split('\n').slice(1) // skip header
    .map(line => {
        const [mode, input, salt, hash, minPct] = line.split(',');
        return { mode, input, salt, unsignedHash: Number(hash), minPct: Number(minPct) };
    });

describe('cross-platform consistency — 1000 samples (500 VISITOR + 500 ASSIGNMENT)', () => {
    test.each(rows)('$mode $input → hash=$unsignedHash minPct=$minPct%', (r) => {
        expect(unsignedHash(r.input, r.salt)).toBe(r.unsignedHash);
        expect(isInPercentageBucket(r.input, r.minPct - 0.0001, r.salt)).toBe(false);
        expect(isInPercentageBucket(r.input, r.minPct, r.salt)).toBe(true);
        expect(isInPercentageBucket(r.input, 100, r.salt)).toBe(true);
        expect(isInPercentageBucket(r.input, 0, r.salt)).toBe(false);
    });
});

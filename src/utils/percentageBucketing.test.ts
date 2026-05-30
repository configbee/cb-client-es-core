// Test vectors from internal-docs/SDK-PERCENTAGE-BUCKETING.md
// These must pass identically in all SDK implementations.

import { isInPercentageBucket } from "./percentageBucketing";

describe('isInPercentageBucket', () => {
    test('0% always excludes everyone', () => {
        expect(isInPercentageBucket('user-1', 0)).toBe(false);
        expect(isInPercentageBucket('bob', 0, 'salt1')).toBe(false);
    });

    test('100% always includes everyone', () => {
        expect(isInPercentageBucket('user-1', 100)).toBe(true);
        expect(isInPercentageBucket('bob', 100, 'salt1')).toBe(true);
    });

    // Salt variation — same input, different salts must produce different buckets
    test('different salts produce different bucket assignments', () => {
        const input = 'mayluyo0-X874Dwbu1ojyLQHCtANc9WZYHkXOxafA';
        const salts = ['', 'rollout-a1b2', 'rollout-c3d4', 'rollout-e5f6', 'rollout-g7h8'];
        const buckets = salts.map(s => isInPercentageBucket(input, 50, s));
        // Not all results should be identical — salts must diversify assignments
        expect(new Set(buckets).size).toBeGreaterThan(1);
    });

    // No-salt and empty-salt must be identical
    test('omitting salt equals passing empty string salt', () => {
        const input = 'mayluyo0-X874Dwbu1ojyLQHCtANc9WZYHkXOxafA';
        expect(isInPercentageBucket(input, 50)).toBe(isInPercentageBucket(input, 50, ''));
    });
    test.each([
        ['user-1',    '',          97, true],
        ['user-1',    '',          96, false],
        ['user-1',    'abc',       11, true],
        ['user-1',    'abc',       10, false],
        ['bob',       'salt1',     47, true],
        ['bob',       'salt1',     46, false],
        ['test-user', 'feature-x', 95, true],
        ['test-user', 'feature-x', 94, false],
    ] as [string, string, number, boolean][])(
        'isInPercentageBucket("%s", %d, "%s") === %s',
        (input, salt, pct, expected) => {
            expect(isInPercentageBucket(input, pct, salt)).toBe(expected);
        }
    );
});

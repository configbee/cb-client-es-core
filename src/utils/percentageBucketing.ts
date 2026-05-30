// Percentage bucketing for PERCENTAGE_HASH modifier evaluation.
// Canonical spec: internal-docs/SDK-PERCENTAGE-BUCKETING.md

const djb2Hash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // truncate to signed int32
    }
    return hash;
};

const SALT_DELIMITER = ":";

// Returns true if (input + salt) hashes into the given percentage bucket.
// percentage=0 always returns false; percentage=100 always returns true.
export const isInPercentageBucket = (input: string, percentage: number, salt = ""): boolean => {
    const unsigned = djb2Hash(input + SALT_DELIMITER + salt) >>> 0;
    return (unsigned / 0x100000000) < (percentage / 100);
};

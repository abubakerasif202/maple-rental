import { describe, expect, it } from 'vitest';

import { buildHealthSchemaIssueDetails } from './healthResponse.js';

describe('health response disclosure boundary', () => {
  it('does not expose schema identifiers in production health output', () => {
    const details = buildHealthSchemaIssueDetails(
      ['missing rentals.stripe_subscription_id'],
      true,
    );

    expect(details).toEqual({ directDatabaseSchemaIssueCount: 1 });
    expect(JSON.stringify(details)).not.toContain('rentals');
  });

  it('retains actionable schema details outside production', () => {
    expect(buildHealthSchemaIssueDetails(['missing column'], false)).toEqual({
      directDatabaseSchemaIssues: ['missing column'],
    });
  });
});

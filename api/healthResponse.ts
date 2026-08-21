export const buildHealthSchemaIssueDetails = (
  issues: readonly string[],
  production: boolean,
) =>
  production
    ? { directDatabaseSchemaIssueCount: issues.length }
    : { directDatabaseSchemaIssues: [...issues] };

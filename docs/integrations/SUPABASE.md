# Supabase connection

## Configuration

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` for browser-safe access where required
- `SUPABASE_SERVICE_ROLE_KEY` only in the server/worker secret store
- optionally `SUPABASE_PROJECT_REF` for precise dashboard links

Never expose the service-role key to client code. Apply repository migrations and row-level-security policies before enabling user-facing connected mode.

## Verification

The server adapter calls `GET {project-url}/rest/v1/` to read the REST schema. Upserts use PostgREST `resolution=merge-duplicates,return=representation`; reads support equality filters with validated table and column names. `appendLineage()` validates the edge with `@dailycart/schemas` before writing `lineage_edges`.

Use a dedicated service role or server-side function with only the tables needed by the control tower in production.

Reference: https://supabase.com/docs/guides/api

-- DailyCart Control Tower V1 schema. Apply with the Supabase CLI in connected mode.
create extension if not exists pgcrypto;

create type public.source_mode as enum ('synthetic', 'simulated', 'mocked', 'live');
create type public.workflow_status as enum ('queued', 'running', 'waiting_approval', 'blocked', 'failed', 'succeeded');

create table public.entities (
  id text primary key check (id ~ '^[A-Z]+-[0-9]{4,}$'),
  entity_type text not null,
  title text not null,
  source_mode public.source_mode not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflow_runs (
  id text primary key check (id ~ '^RUN-[0-9]{4,}$'),
  workflow_type text not null,
  status public.workflow_status not null,
  feature_id text references public.entities(id),
  state jsonb not null default '{}'::jsonb,
  trace_id text,
  source_mode public.source_mode not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.approvals (
  id text primary key check (id ~ '^APR-[0-9]{4,}$'),
  run_id text not null references public.workflow_runs(id) on delete cascade,
  stage text not null check (stage in ('feature', 'preview', 'release')),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  reviewer text,
  rationale text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.lineage_edges (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  relationship text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, relationship, target_id)
);

create index lineage_edges_source_idx on public.lineage_edges(source_id);
create index lineage_edges_target_idx on public.lineage_edges(target_id);
create index entities_type_idx on public.entities(entity_type);

create table public.external_references (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  provider text not null,
  workspace text,
  external_id text not null,
  url text,
  sync_status text not null default 'pending',
  normalized_error jsonb,
  last_synced_at timestamptz,
  unique (provider, external_id)
);

create table public.eval_results (
  campaign_id text not null,
  case_id text not null,
  grader text not null,
  score numeric not null check (score between 0 and 100),
  passed boolean not null,
  critical boolean not null default false,
  rationale text not null,
  measured_at timestamptz not null default now(),
  duration_ms integer not null check (duration_ms >= 0),
  payload jsonb not null default '{}'::jsonb,
  primary key (campaign_id, case_id, grader)
);

alter table public.entities enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.approvals enable row level security;
alter table public.lineage_edges enable row level security;
alter table public.external_references enable row level security;
alter table public.eval_results enable row level security;

-- Live deployments should replace this authenticated read policy with role-specific policies.
create policy "authenticated read entities" on public.entities for select to authenticated using (true);
create policy "authenticated read workflow runs" on public.workflow_runs for select to authenticated using (true);
create policy "authenticated read approvals" on public.approvals for select to authenticated using (true);
create policy "authenticated read lineage" on public.lineage_edges for select to authenticated using (true);
create policy "authenticated read external references" on public.external_references for select to authenticated using (true);
create policy "authenticated read eval results" on public.eval_results for select to authenticated using (true);

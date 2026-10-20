-- akash sells nyc — Property Lab — Stage 9: consultation_requests table
-- Run this once in the Supabase SQL Editor (project dashboard → SQL → New query).

create table if not exists consultation_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Lead details
  name text not null,
  email text not null,
  phone text,
  interest text not null check (interest in ('buying', 'selling', 'both', 'exploring')),
  message text,

  -- Permission-based consent record
  consent_given boolean not null default false,
  consent_at timestamptz,
  consent_text text, -- exact wording the user agreed to (audit trail)

  -- Context
  source_page text, -- e.g. "/buying-power" (which tool page the CTA came from)
  user_agent text,

  -- Follow-up workflow
  status text not null default 'new' check (status in ('new', 'contacted', 'closed'))
);

-- Public form can INSERT, but never read (leads are private to Akash).
alter table consultation_requests enable row level security;

drop policy if exists "Public can submit consultation requests" on consultation_requests;
create policy "Public can submit consultation requests"
  on consultation_requests for insert
  to anon
  with check (true);

-- Table privileges: an RLS policy alone is not enough — the anon role also
-- needs the table-level INSERT privilege, or PostgREST rejects every
-- insert with "new row violates row-level security policy" (42501).
grant insert on consultation_requests to anon;

-- No SELECT policy for anon: reads stay blocked unless via service role key.

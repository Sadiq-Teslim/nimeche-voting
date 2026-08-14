begin;

create table if not exists eligible_voters (
    id uuid primary key default gen_random_uuid(),
    organization_id text not null references organizations(id) on delete cascade,
    election_id uuid not null references elections(id) on delete cascade,
    matric_number text not null,
    surname text not null,
    surname_key text not null,
    full_name text not null,
    level text,
    source_label text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (election_id, matric_number)
);

alter table votes
    add column if not exists eligible_voter_id uuid references eligible_voters(id) on delete restrict;

alter table votes
    drop constraint if exists votes_election_id_voter_fingerprint_position_id_key;

create index if not exists eligible_voters_lookup_idx
    on eligible_voters(organization_id, election_id, matric_number, surname_key)
    where is_active = true;

create unique index if not exists votes_verified_voter_position_idx
    on votes(election_id, eligible_voter_id, position_id)
    where eligible_voter_id is not null;

commit;

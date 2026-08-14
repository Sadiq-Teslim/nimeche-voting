begin;

alter table eligible_voters
    add column if not exists name_keys text[] not null default '{}';

commit;

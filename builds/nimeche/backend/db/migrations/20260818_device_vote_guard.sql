begin;

create unique index if not exists votes_device_position_idx
    on votes(election_id, voter_fingerprint, position_id);

commit;

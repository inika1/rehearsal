-- Post-call insights: communication styles + Gottman-style blocks (jsonb)
alter table conversations
  add column if not exists passive integer,
  add column if not exists aggressive integer,
  add column if not exists passive_aggressive integer,
  add column if not exists assertive integer,
  add column if not exists insights jsonb;

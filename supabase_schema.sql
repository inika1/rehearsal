-- Run this once in the Supabase SQL editor.

create table if not exists people (
  id           bigint generated always as identity primary key,
  name         text not null,
  relationship text,
  created_at   timestamptz default now()
);

create table if not exists conversations (
  id           bigint generated always as identity primary key,
  person_id    bigint not null references people(id) on delete cascade,
  title        text not null,
  situation    text,
  duration     text,
  tension      integer,
  emotion      integer,
  insight_tend text,
  insight_try  text,
  insight_used text,
  passive      integer,
  aggressive   integer,
  passive_aggressive integer,
  assertive    integer,
  insights     jsonb,
  created_at   timestamptz default now()
);

create table if not exists messages (
  id              bigint generated always as identity primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  role            text not null,
  content         text not null,
  created_at      timestamptz default now()
);

-- Seed the three demo people (matches the old SQLite seed).
insert into people (name, relationship) values
  ('Mike',   'Flatmate · friend'),
  ('Amelia', 'Project teammate'),
  ('James',  'Friend')
on conflict do nothing;

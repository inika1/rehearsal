-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- 1. App-managed users table (email + bcrypt password hash)
create table if not exists users (
  id           bigint generated always as identity primary key,
  email        text unique not null,
  password_hash text not null,
  created_at   timestamptz default now()
);

-- 2. Tie people to a user account (nullable so existing rows aren't broken)
alter table people
  add column if not exists user_id bigint references users(id) on delete cascade;

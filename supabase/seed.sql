insert into people (name, relationship) values
  ('Mike',   'Flatmate · friend'),
  ('Amelia', 'Project teammate'),
  ('James',  'Friend')
on conflict do nothing;

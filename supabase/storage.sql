insert into storage.buckets (id, name, public, file_size_limit)
values ('connect-za-media', 'connect-za-media', true, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('connect-za-private', 'connect-za-private', false, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

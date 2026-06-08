create extension if not exists vector;

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  symbol text,
  chunk_index integer not null default 0,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null,
  model_version text not null default 'openai/text-embedding-3-small',
  source_created_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_table, source_id, chunk_index)
);

grant select on public.knowledge_chunks to authenticated;
grant all on public.knowledge_chunks to service_role;

alter table public.knowledge_chunks enable row level security;

create policy "read knowledge chunks"
  on public.knowledge_chunks for select to authenticated
  using (
    user_id is null
    or user_id = auth.uid()
    or public.is_admin(auth.uid())
  );

create policy "service role manages knowledge chunks"
  on public.knowledge_chunks for all to service_role
  using (true) with check (true);

create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index knowledge_chunks_source_idx
  on public.knowledge_chunks (source_table, source_created_at desc nulls last);
create index knowledge_chunks_symbol_idx
  on public.knowledge_chunks (symbol) where symbol is not null;
create index knowledge_chunks_user_idx
  on public.knowledge_chunks (user_id) where user_id is not null;

create table public.knowledge_embed_cursors (
  source_table text primary key,
  last_processed_at timestamptz not null default 'epoch',
  last_run_at timestamptz,
  last_inserted integer default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
grant select on public.knowledge_embed_cursors to authenticated;
grant all on public.knowledge_embed_cursors to service_role;
alter table public.knowledge_embed_cursors enable row level security;
create policy "read embed cursors"
  on public.knowledge_embed_cursors for select to authenticated using (true);
create policy "service role manages embed cursors"
  on public.knowledge_embed_cursors for all to service_role using (true) with check (true);

create or replace function public.match_knowledge(
  query_embedding vector(1536),
  match_count integer default 8,
  filter_symbol text default null,
  filter_user uuid default null,
  filter_tables text[] default null,
  min_similarity float default 0.0
)
returns table (
  id uuid,
  source_table text,
  source_id text,
  symbol text,
  content text,
  metadata jsonb,
  source_created_at timestamptz,
  similarity float
)
language sql stable security definer set search_path = public as $$
  select k.id, k.source_table, k.source_id, k.symbol, k.content, k.metadata,
         k.source_created_at,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks k
  where (filter_symbol is null or k.symbol = filter_symbol)
    and (
      k.user_id is null
      or (filter_user is not null and k.user_id = filter_user)
    )
    and (filter_tables is null or k.source_table = any(filter_tables))
    and (1 - (k.embedding <=> query_embedding)) >= min_similarity
  order by k.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_knowledge(vector, integer, text, uuid, text[], float)
  to authenticated, service_role;
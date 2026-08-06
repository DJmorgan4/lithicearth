-- ============================================================
-- LithicEarth · historical map catalog
-- Run in Supabase SQL editor. Requires postgis (already enabled
-- in your shared schema).
-- ============================================================

create extension if not exists postgis;

create table if not exists public.historical_maps (
  id             uuid primary key default gen_random_uuid(),
  title          text        not null,
  year           int,
  publisher      text,
  -- provenance: rumsey | usgs_htmc | loc | allmaps | local | manual
  source         text        not null default 'manual',
  -- delivery mechanism
  kind           text        not null default 'xyz'
                             check (kind in ('xyz', 'wms', 'allmaps')),
  tile_url       text,        -- {z}/{x}/{y} template
  wms_url        text,
  wms_layer      text,
  annotation_url text,        -- IIIF Georeference Annotation (Allmaps)
  min_zoom       int         default 0,
  max_zoom       int         default 19,
  attribution    text        not null,
  -- public-domain | cc0 | licensed | cc-by-nc-sa | unknown
  -- Only the first three are cleared for commercial deliverables.
  license        text        not null default 'unknown',
  proxy          boolean     not null default true,
  footprint      geometry(Polygon, 4326) not null,
  created_by     uuid        references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint historical_maps_has_endpoint check (
    (kind = 'xyz'     and tile_url is not null) or
    (kind = 'wms'     and wms_url  is not null) or
    (kind = 'allmaps' and annotation_url is not null)
  )
);

create index if not exists historical_maps_footprint_idx
  on public.historical_maps using gist (footprint);
create index if not exists historical_maps_year_idx
  on public.historical_maps (year);

-- ── Row level security ──────────────────────────────────────
alter table public.historical_maps enable row level security;

drop policy if exists historical_maps_read on public.historical_maps;
create policy historical_maps_read
  on public.historical_maps for select
  using (true);

drop policy if exists historical_maps_insert on public.historical_maps;
create policy historical_maps_insert
  on public.historical_maps for insert
  to authenticated
  with check (true);

drop policy if exists historical_maps_update_own on public.historical_maps;
create policy historical_maps_update_own
  on public.historical_maps for update
  to authenticated
  using (created_by = auth.uid());

-- ── Viewport query ──────────────────────────────────────────
-- The viewer calls this on every moveend. Returns bbox as a plain
-- float array so the client can build Leaflet bounds without PostGIS
-- geometry parsing.
create or replace function public.historical_maps_in_bbox(
  w double precision,
  s double precision,
  e double precision,
  n double precision,
  year_from int default null,
  year_to   int default null
)
returns table (
  id             uuid,
  title          text,
  year           int,
  publisher      text,
  source         text,
  kind           text,
  tile_url       text,
  wms_url        text,
  wms_layer      text,
  annotation_url text,
  min_zoom       int,
  max_zoom       int,
  attribution    text,
  license        text,
  proxy          boolean,
  bbox           double precision[]
)
language sql
stable
security invoker
as $$
  select
    m.id, m.title, m.year, m.publisher, m.source, m.kind,
    m.tile_url, m.wms_url, m.wms_layer, m.annotation_url,
    m.min_zoom, m.max_zoom, m.attribution, m.license, m.proxy,
    array[
      st_xmin(m.footprint), st_ymin(m.footprint),
      st_xmax(m.footprint), st_ymax(m.footprint)
    ]::double precision[]
  from public.historical_maps m
  where st_intersects(m.footprint, st_makeenvelope(w, s, e, n, 4326))
    and (year_from is null or m.year is null or m.year >= year_from)
    and (year_to   is null or m.year is null or m.year <= year_to)
  order by m.year desc nulls last
  limit 60;
$$;

-- ── Register from the viewer ────────────────────────────────
-- PostgREST can't call st_makeenvelope inline on an insert, so the
-- "Register map to this view" form goes through this.
create or replace function public.register_historical_map(
  p_title          text,
  p_year           int,
  p_publisher      text,
  p_source         text,
  p_kind           text,
  p_tile_url       text,
  p_annotation_url text,
  p_wms_url        text,
  p_wms_layer      text,
  p_attribution    text,
  p_license        text,
  p_proxy          boolean,
  p_w              double precision,
  p_s              double precision,
  p_e              double precision,
  p_n              double precision
)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_id uuid;
begin
  insert into public.historical_maps (
    title, year, publisher, source, kind,
    tile_url, annotation_url, wms_url, wms_layer,
    attribution, license, proxy, footprint, created_by
  ) values (
    p_title, p_year, p_publisher, coalesce(p_source, 'manual'), p_kind,
    p_tile_url, p_annotation_url, p_wms_url, p_wms_layer,
    p_attribution, p_license, coalesce(p_proxy, true),
    st_makeenvelope(p_w, p_s, p_e, p_n, 4326),
    auth.uid()
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.historical_maps_in_bbox(
  double precision, double precision, double precision, double precision, int, int
) to anon, authenticated;

grant execute on function public.register_historical_map(
  text, int, text, text, text, text, text, text, text, text, text, boolean,
  double precision, double precision, double precision, double precision
) to authenticated;

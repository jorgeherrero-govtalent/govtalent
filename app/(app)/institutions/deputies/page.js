'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import UpgradeModal from '@/components/UpgradeModal';

const PAGE_SIZE = 10;

function initials(fullName) {
  const [last, first] = fullName.split(',').map((s) => s.trim());
  return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
}

function DeputiesDirectoryInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [deputies, setDeputies] = useState(null);
  const [groups, setGroups] = useState([]);
  const [rolesByDeputy, setRolesByDeputy] = useState({});
  const [userId, setUserId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [groupFilter, setGroupFilter] = useState(new Set());
  const [constituencyFilter, setConstituencyFilter] = useState(new Set());
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(0);
  const [upgradeModal, setUpgradeModal] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (uid) {
      setUserId(uid);
      supabase
        .from('saved_deputies')
        .select('deputy_id')
        .eq('user_id', uid)
        .then(({ data }) => data && setSavedIds(new Set(data.map((r) => r.deputy_id))));
    }

    const [{ data: deputiesData }, { data: groupsData }, { data: rolesData }] = await Promise.all([
      supabase
        .from('deputies')
        .select('id, full_name, first_name, last_name, slug, constituency, photo_url, parliamentary_group_id')
        .eq('active', true)
        .order('last_name', { ascending: true }),
      supabase.from('parliamentary_groups').select('id, name, short_name').eq('active', true).order('member_count', { ascending: false }),
      supabase.from('deputy_roles').select('deputy_id, role, parliamentary_body_id, parliamentary_bodies(name)').eq('active', true),
    ]);

    setDeputies(deputiesData || []);
    setGroups(groupsData || []);

    // Un diputado puede tener varios cargos — nos quedamos con uno para la
    // columna "Cargo principal" y listamos las comisiones aparte.
    const byDeputy = {};
    for (const r of rolesData || []) {
      if (!byDeputy[r.deputy_id]) byDeputy[r.deputy_id] = { mainRole: r.role, bodies: [] };
      if (r.parliamentary_bodies?.name) byDeputy[r.deputy_id].bodies.push(r.parliamentary_bodies.name);
    }
    setRolesByDeputy(byDeputy);
  }

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  const constituencyOptions = useMemo(() => {
    if (!deputies) return [];
    const unique = [...new Set(deputies.map((d) => d.constituency).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return unique.map((c) => ({ value: c, label: c }));
  }, [deputies]);

  const filtered = useMemo(() => {
    if (!deputies) return [];
    let list = deputies;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.full_name.toLowerCase().includes(q) ||
          d.constituency?.toLowerCase().includes(q) ||
          groupById[d.parliamentary_group_id]?.name.toLowerCase().includes(q)
      );
    }
    if (groupFilter.size > 0) list = list.filter((d) => groupFilter.has(d.parliamentary_group_id));
    if (constituencyFilter.size > 0) list = list.filter((d) => constituencyFilter.has(d.constituency));
    return list;
  }, [deputies, search, groupFilter, constituencyFilter, groupById]);

  useEffect(() => {
    setPage(0);
  }, [search, groupFilter, constituencyFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function toggleSave(deputyId) {
    if (!userId) return;
    if (savedIds.has(deputyId)) {
      await supabase.from('saved_deputies').delete().eq('user_id', userId).eq('deputy_id', deputyId);
      setSavedIds((prev) => {
        const n = new Set(prev);
        n.delete(deputyId);
        return n;
      });
    } else {
      await supabase.from('saved_deputies').insert({ user_id: userId, deputy_id: deputyId });
      setSavedIds((prev) => new Set(prev).add(deputyId));
    }
  }

  function clearFilters() {
    setSearch('');
    setGroupFilter(new Set());
    setConstituencyFilter(new Set());
  }

  const activeFiltersCount = groupFilter.size + constituencyFilter.size;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Diputados</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>
          {deputies ? deputies.length : '—'} diputados · {groups.length} grupos · XV Legislatura
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1d6f5c', borderBottom: '2px solid #1d6f5c', paddingBottom: 8 }}>
          Diputados
        </span>
        <Link href="/institutions/groups" style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}>
          Grupos parlamentarios
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '7px 14px',
            flex: '1 1 240px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, grupo o circunscripción..."
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter
          label="Grupo parlamentario"
          values={groups.map((g) => ({ value: g.id, label: g.name }))}
          selected={groupFilter}
          onApply={setGroupFilter}
        />
        <MultiSelectFilter
          label="Circunscripción"
          values={constituencyOptions}
          selected={constituencyFilter}
          onApply={setConstituencyFilter}
        />
        <span
          title="Próximamente"
          style={{
            background: '#f4f4f0',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '7px 14px',
            fontSize: 12,
            color: '#bbb',
            cursor: 'default',
          }}
        >
          Comisión ▾
        </span>
        {activeFiltersCount > 0 && (
          <span onClick={clearFilters} style={{ fontSize: 11.5, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}>
            Limpiar filtros
          </span>
        )}
        <button
          onClick={() =>
            setUpgradeModal({
              title: 'Filtros avanzados',
              message:
                'Filtra por cargo, comisiones múltiples, portavocía, Mesa del Congreso, antigüedad y más. Disponible en el plan Pro.',
            })
          }
          style={{
            background: '#eeecfd',
            border: '.5px solid #6d5aef',
            borderRadius: 20,
            padding: '7px 14px',
            fontSize: 12,
            color: '#5a4fd6',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            cursor: 'pointer',
          }}
        >
          <i className="ti ti-adjustments" style={{ fontSize: 13 }}></i> Filtros avanzados
          <span style={{ background: '#6d5aef', color: '#fff', fontSize: 9, padding: '1px 5px', borderRadius: 6 }}>PRO</span>
        </button>
        <div style={{ display: 'flex', background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 8, overflow: 'hidden' }}>
          <button
            onClick={() => setView('grid')}
            style={{ padding: '7px 10px', background: view === 'grid' ? '#f0f8f5' : 'transparent', color: view === 'grid' ? '#1d6f5c' : '#999', border: 'none' }}
          >
            <i className="ti ti-layout-grid"></i>
          </button>
          <button
            onClick={() => setView('list')}
            style={{ padding: '7px 10px', background: view === 'list' ? '#f0f8f5' : 'transparent', color: view === 'list' ? '#1d6f5c' : '#999', border: 'none' }}
          >
            <i className="ti ti-list"></i>
          </button>
        </div>
      </div>

      {deputies === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hay diputados con estos filtros.
            <div style={{ marginTop: 10 }}>
              <button className="btn-o" onClick={clearFilters}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {paginated.map((d) => {
            const group = groupById[d.parliamentary_group_id];
            const role = rolesByDeputy[d.id];
            return (
              <Link
                key={d.id}
                href={`/institutions/deputies/${d.slug}`}
                className="card"
                style={{ padding: 14, textDecoration: 'none', color: 'inherit', position: 'relative', display: 'block' }}
              >
                <i
                  className={`ti ${savedIds.has(d.id) ? 'ti-bookmark-filled' : 'ti-bookmark'}`}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleSave(d.id);
                  }}
                  style={{ position: 'absolute', top: 12, right: 12, color: savedIds.has(d.id) ? '#1d6f5c' : '#ccc', fontSize: 14 }}
                ></i>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: '#e8f4f0',
                    color: '#1d6f5c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 8,
                    overflow: 'hidden',
                  }}
                >
                  {d.photo_url ? (
                    <img src={d.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    initials(d.full_name)
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{fullNameDisplay(d.full_name)}</div>
                <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>{group?.name || '—'}</div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{d.constituency}</div>
                {role?.mainRole && (
                  <div style={{ fontSize: 10.5, color: '#1d6f5c', fontWeight: 600, marginTop: 6 }}>
                    {role.mainRole}
                    {role.bodies[0] ? ` · ${role.bodies[0]}` : ''}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr .5px 1fr .5px 1.1fr .5px 1.3fr .5px 1.5fr .5px 24px',
              padding: '10px 16px',
              borderBottom: '.5px solid #f0f0eb',
              fontSize: 10.5,
              fontWeight: 700,
              color: '#999',
              textTransform: 'uppercase',
            }}
          >
            <div>Diputado</div>
            <div></div>
            <div style={{ textAlign: 'center' }}>Grupo</div>
            <div></div>
            <div style={{ textAlign: 'center' }}>Circunscripción</div>
            <div></div>
            <div style={{ textAlign: 'center' }}>Cargo principal</div>
            <div></div>
            <div style={{ textAlign: 'center' }}>Comisiones</div>
            <div></div>
            <div></div>
          </div>
          {paginated.map((d) => {
            const group = groupById[d.parliamentary_group_id];
            const role = rolesByDeputy[d.id];
            return (
              <Link
                key={d.id}
                href={`/institutions/deputies/${d.slug}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr .5px 1fr .5px 1.1fr .5px 1.3fr .5px 1.5fr .5px 24px',
                  padding: '11px 16px',
                  borderBottom: '.5px solid #f0f0eb',
                  alignItems: 'center',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: '#e8f4f0',
                      color: '#1d6f5c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {d.photo_url ? (
                      <img src={d.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      initials(d.full_name)
                    )}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{fullNameDisplay(d.full_name)}</span>
                </div>
                <div style={{ background: '#f0f0eb' }}></div>
                <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>{group?.short_name || group?.name || '—'}</div>
                <div style={{ background: '#f0f0eb' }}></div>
                <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>{d.constituency}</div>
                <div style={{ background: '#f0f0eb' }}></div>
                <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>{role?.mainRole || '—'}</div>
                <div style={{ background: '#f0f0eb' }}></div>
                <div style={{ fontSize: 11.5, color: '#888', textAlign: 'center' }}>{role?.bodies.join(', ') || '—'}</div>
                <div style={{ background: '#f0f0eb' }}></div>
                <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14 }}></i>
              </Link>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <span style={{ fontSize: 11.5, color: '#999' }}>
            Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn-o" disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={{ fontSize: 12, padding: '5px 10px' }}>
              Anterior
            </button>
            <button
              className="btn-o"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              style={{ fontSize: 12, padding: '5px 10px' }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {upgradeModal && <UpgradeModal title={upgradeModal.title} message={upgradeModal.message} onClose={() => setUpgradeModal(false)} />}
    </div>
  );
}

// "Abades Martínez, Cristina" -> "Cristina Abades Martínez", más natural para leer en tarjetas y listado
function fullNameDisplay(officialName) {
  const [last, first] = officialName.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

export default function DeputiesDirectoryPage() {
  return (
    <Suspense fallback={<div className="spinner"></div>}>
      <DeputiesDirectoryInner />
    </Suspense>
  );
}

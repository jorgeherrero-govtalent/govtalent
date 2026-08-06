'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PublicJobApplyButton({ jobId, label = 'Regístrate', applicationMode, externalApplyUrl }) {
  const supabase = createClient();
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
      setChecking(false);
    });
  }, []);

  // Si la organización gestiona esta oferta en su propia web, no tiene
  // sentido pedir registro en GovTalent antes de dejar pasar al
  // candidato — se le manda directo, esté logueado o no.
  if (applicationMode === 'externa' && externalApplyUrl) {
    return (
      <a
        href={`/api/jobs/${jobId}/go`}
        target="_blank"
        rel="noreferrer"
        className="btn-p"
        style={{ width: '100%', fontSize: 14, padding: '12px 20px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        Aplicar en la web de la organización <i className="ti ti-external-link"></i>
      </a>
    );
  }

  function goApply() {
    const target = `/jobs?job=${jobId}`;
    if (loggedIn) {
      window.location.href = target;
    } else {
      window.location.href = `/login?view=signup&redirect=${encodeURIComponent(target)}`;
    }
  }

  return (
    <button className="btn-p" style={{ width: '100%', fontSize: 14, padding: '12px 20px' }} disabled={checking} onClick={goApply}>
      <i className="ti ti-send"></i> {loggedIn ? 'Aplicar a esta oferta' : label}
    </button>
  );
}

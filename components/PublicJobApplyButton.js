'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PublicJobApplyButton({ jobId }) {
  const supabase = createClient();
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
      setChecking(false);
    });
  }, []);

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
      <i className="ti ti-send"></i> {loggedIn ? 'Aplicar a esta oferta' : 'Regístrate y aplica en 30 segundos'}
    </button>
  );
}

'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function OrganizationFollowButton({ organizationId, organizationName, userId, initialFollowing }) {
  const supabase = createClient();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  async function toggleFollow() {
    if (!userId) {
      toast('Inicia sesión para seguir a esta organización');
      return;
    }
    setBusy(true);
    if (following) {
      await supabase.from('organization_follows').delete().eq('user_id', userId).eq('organization_id', organizationId);
      setFollowing(false);
      toast(`Has dejado de seguir a ${organizationName}`);
    } else {
      await supabase.from('organization_follows').insert({ user_id: userId, organization_id: organizationId });
      setFollowing(true);
      toast(`Ahora sigues a ${organizationName}`);
    }
    setBusy(false);
  }

  return (
    <button className={following ? 'btn-o' : 'btn-p'} onClick={toggleFollow} disabled={busy}>
      <i className={`ti ${following ? 'ti-check' : 'ti-plus'}`}></i> {following ? 'Siguiendo' : 'Seguir'}
    </button>
  );
}

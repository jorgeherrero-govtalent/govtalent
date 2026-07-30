'use client';

import { useState } from 'react';
import ClaimOrganizationModal from '@/components/ClaimOrganizationModal';

export default function OrganizationClaimBanner({ organizationId, organizationName, claimed, userId }) {
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimSubmitted, setClaimSubmitted] = useState(false);

  if (claimed || !userId) return null;

  return (
    <>
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto 16px',
          background: '#f0f8f5',
          border: '1px solid #c0e4d8',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-building-community" style={{ color: '#1d6f5c', fontSize: 20 }}></i>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1a18' }}>¿Eres de {organizationName}?</div>
            <div style={{ fontSize: 12, color: '#666' }}>Reclama esta página para gestionarla y publicar ofertas.</div>
          </div>
        </div>
        {claimSubmitted ? (
          <span style={{ fontSize: 12.5, color: '#1d6f5c', fontWeight: 600 }}>
            <i className="ti ti-clock" style={{ fontSize: 13 }}></i> Solicitud enviada, en revisión
          </span>
        ) : (
          <button className="btn-p" onClick={() => setShowClaimModal(true)}>
            <i className="ti ti-shield-check"></i> Reclamar esta página
          </button>
        )}
      </div>

      {showClaimModal && (
        <ClaimOrganizationModal
          organizationId={organizationId}
          organizationName={organizationName}
          userId={userId}
          onClose={() => setShowClaimModal(false)}
          onSubmitted={() => setClaimSubmitted(true)}
        />
      )}
    </>
  );
}

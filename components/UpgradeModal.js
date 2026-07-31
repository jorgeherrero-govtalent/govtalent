'use client';

import Link from 'next/link';

export default function UpgradeModal({ title, message, onClose }) {
  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <h2>
            <i className="ti ti-bolt" style={{ color: '#6d5aef' }}></i> {title}
          </h2>
          <div className="modal-x" onClick={onClose}>
            <i className="ti ti-x"></i>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#666', margin: '4px 0 22px', lineHeight: 1.6 }}>{message}</p>
        <Link
          href="/precios"
          target="_blank"
          className="btn-p"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <i className="ti ti-arrow-up-right"></i> Ver planes
        </Link>
      </div>
    </div>
  );
}

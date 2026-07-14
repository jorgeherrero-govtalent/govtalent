'use client';

import { useRouter } from 'next/navigation';

export default function BackCloseButton() {
  const router = useRouter();

  function handleClick() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/jobs');
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 13px',
        borderRadius: 8,
        border: '.5px solid #e0dfd8',
        background: '#fff',
        color: '#555',
        fontSize: 12.5,
        fontWeight: 600,
        fontFamily: 'inherit',
      }}
    >
      <i className="ti ti-arrow-left"></i> Volver
    </button>
  );
}

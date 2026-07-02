'use client';

import { useEffect, useRef, useState } from 'react';
import { useToastListener, removeToastListener } from '@/lib/toast';

export default function Toast() {
  const [msg, setMsg] = useState('');
  const [on, setOn] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    function show(m) {
      setMsg(m);
      setOn(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setOn(false), 2500);
    }
    useToastListener(show);
    return () => removeToastListener(show);
  }, []);

  return <div className={`toast${on ? ' on' : ''}`}>{msg}</div>;
}

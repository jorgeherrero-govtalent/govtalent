'use client';

let listeners = [];

export function toast(msg) {
  listeners.forEach((fn) => fn(msg));
}

export function useToastListener(cb) {
  if (typeof window === 'undefined') return;
  listeners.push(cb);
}

export function removeToastListener(cb) {
  listeners = listeners.filter((fn) => fn !== cb);
}

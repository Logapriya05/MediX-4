import { useEffect, useState } from 'react';
import { store } from './store.js';

export function useLive() {
  const [s, setS] = useState(store.get());
  useEffect(() => store.sub(setS), []);
  return s;
}

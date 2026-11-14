import { useEffect, useState } from 'react';
import { getBusinessTerminology, getBusinessType } from '../utils/business-terminology';

export function useBusinessTerminology() {
  const [type, setType] = useState(getBusinessType);
  useEffect(() => {
    const refresh = () => setType(getBusinessType());
    window.addEventListener('dawacore-business-type-changed', refresh);
    window.addEventListener('storage', refresh);
    refresh();
    return () => {
      window.removeEventListener('dawacore-business-type-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return getBusinessTerminology(type);
}

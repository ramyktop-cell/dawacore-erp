import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth.store';
import {
  getBusinessTerminology,
  getBusinessType,
  normalizeFrontendBusinessType,
} from '../utils/business-terminology';

export function useBusinessTerminology() {
  const authBusinessType = useAuthStore((s) => s.user?.businessType);
  const [type, setType] = useState(() =>
    authBusinessType ? normalizeFrontendBusinessType(authBusinessType) : getBusinessType(),
  );

  useEffect(() => {
    setType(authBusinessType ? normalizeFrontendBusinessType(authBusinessType) : getBusinessType());
  }, [authBusinessType]);

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

import { DEFAULT_PLATFORM_BRANDING, getCachedPlatformBranding, PlatformBrandingConfig } from '../api/branding';
import { useAuthStore } from '../stores/auth.store';

export interface ActiveCompanyBrand {
  companyId: string | null;
  displayName: string;
  displayNameAr: string;
  logoUrl: string;
  isCompanyBrand: boolean;
  platformName: string;
  platformNameAr: string;
}

function readStoredAuthUser(): {
  companyId?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
} | null {
  const storeUser = useAuthStore.getState().user;
  if (storeUser) {
    return storeUser;
  }
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('dawacore_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getPlatformBrand(): PlatformBrandingConfig {
  return getCachedPlatformBranding() || DEFAULT_PLATFORM_BRANDING;
}

export function getActiveCompanyBrand(explicitCompanyName?: string | null, explicitLogoUrl?: string | null): ActiveCompanyBrand {
  const platform = getPlatformBrand();
  const user = readStoredAuthUser();

  const resolvedCompanyName = (explicitCompanyName ?? user?.companyName ?? '').trim();
  const resolvedLogoUrl = (explicitLogoUrl ?? user?.companyLogoUrl ?? '').trim();

  return {
    companyId: user?.companyId || null,
    displayName: resolvedCompanyName || platform.platformName,
    displayNameAr: resolvedCompanyName || platform.platformNameAr,
    logoUrl: resolvedLogoUrl || platform.platformLogoUrl,
    isCompanyBrand: Boolean(resolvedCompanyName),
    platformName: platform.platformName,
    platformNameAr: platform.platformNameAr,
  };
}

import { apiFetch } from './http';

export type DeploymentMode = 'CLOUD' | 'OFFLINE';

export interface PlatformBrandingConfig {
  platformName: string;
  platformNameAr: string;
  platformLogoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  deploymentMode: DeploymentMode;
}

export const DEFAULT_PLATFORM_BRANDING: PlatformBrandingConfig = {
  platformName: 'MadarCore',
  platformNameAr: 'مدار كور',
  platformLogoUrl: '/logo.png',
  primaryColor: '#582949',
  secondaryColor: '#00A8A8',
  deploymentMode: 'OFFLINE',
};

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed : fallback;
}

export function sanitizeLogoUrl(
  value: unknown,
  fallback = DEFAULT_PLATFORM_BRANDING.platformLogoUrl,
): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('/') || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

export function getDeploymentBadgeText(mode?: DeploymentMode | string | null): string {
  return mode === 'CLOUD'
    ? 'نسخة سحابية • أونلاين'
    : 'نسخة محلية • تعمل داخل شبكة المنشأة';
}

export function normalizePlatformBranding(
  data?: Partial<PlatformBrandingConfig> | Record<string, unknown> | null,
): PlatformBrandingConfig {
  const rawName = typeof data?.platformName === 'string' ? data.platformName.trim() : '';
  const rawNameAr = typeof data?.platformNameAr === 'string' ? data.platformNameAr.trim() : '';
  return {
    platformName: rawName || DEFAULT_PLATFORM_BRANDING.platformName,
    platformNameAr: rawNameAr || DEFAULT_PLATFORM_BRANDING.platformNameAr,
    platformLogoUrl: sanitizeLogoUrl(
      data?.platformLogoUrl,
      DEFAULT_PLATFORM_BRANDING.platformLogoUrl,
    ),
    primaryColor: sanitizeHexColor(data?.primaryColor, DEFAULT_PLATFORM_BRANDING.primaryColor),
    secondaryColor: sanitizeHexColor(
      data?.secondaryColor,
      DEFAULT_PLATFORM_BRANDING.secondaryColor,
    ),
    deploymentMode: data?.deploymentMode === 'CLOUD' ? 'CLOUD' : 'OFFLINE',
  };
}

let cachedPlatformBranding: PlatformBrandingConfig | null = null;
let pendingPromise: Promise<PlatformBrandingConfig> | null = null;

export function resetPlatformBrandingCache(): void {
  cachedPlatformBranding = null;
  pendingPromise = null;
}

export async function fetchPlatformBranding(): Promise<PlatformBrandingConfig> {
  if (cachedPlatformBranding) return cachedPlatformBranding;
  if (pendingPromise) return pendingPromise;

  pendingPromise = apiFetch('/api/branding')
    .then(async (res) => {
      if (!res.ok) return DEFAULT_PLATFORM_BRANDING;
      const data = await res.json();
      const merged = normalizePlatformBranding(data);
      cachedPlatformBranding = merged;
      return merged;
    })
    .catch(() => DEFAULT_PLATFORM_BRANDING)
    .finally(() => {
      pendingPromise = null;
    });

  return pendingPromise;
}

export function getCachedPlatformBranding(): PlatformBrandingConfig {
  return cachedPlatformBranding || DEFAULT_PLATFORM_BRANDING;
}

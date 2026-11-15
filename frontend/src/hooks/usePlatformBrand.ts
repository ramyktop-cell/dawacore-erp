import React, { useEffect, useState } from 'react';
import {
  DEFAULT_PLATFORM_BRANDING,
  fetchPlatformBranding,
  getCachedPlatformBranding,
  getDeploymentBadgeText,
  normalizePlatformBranding,
  PlatformBrandingConfig,
  sanitizeHexColor,
} from '../api/branding';
import { useAuthStore } from '../stores/auth.store';
import { ActiveCompanyBrand, getActiveCompanyBrand } from '../utils/platform-brand';

export function usePlatformBrand(): {
  platform: PlatformBrandingConfig;
  companyBrand: ActiveCompanyBrand;
  deploymentBadgeText: string;
  brandCssVars: React.CSSProperties;
} {
  const [platform, setPlatform] = useState<PlatformBrandingConfig>(() =>
    normalizePlatformBranding(getCachedPlatformBranding() || DEFAULT_PLATFORM_BRANDING),
  );
  const authUser = useAuthStore((s) => s.user);

  useEffect(() => {
    let active = true;
    fetchPlatformBranding().then((cfg) => {
      if (active) setPlatform(normalizePlatformBranding(cfg));
    });
    return () => {
      active = false;
    };
  }, []);

  const primaryColor = sanitizeHexColor(
    platform.primaryColor,
    DEFAULT_PLATFORM_BRANDING.primaryColor,
  );
  const secondaryColor = sanitizeHexColor(
    platform.secondaryColor,
    DEFAULT_PLATFORM_BRANDING.secondaryColor,
  );
  const deploymentBadgeText = getDeploymentBadgeText(platform.deploymentMode);
  const brandCssVars = {
    '--brand-primary': primaryColor,
    '--brand-secondary': secondaryColor,
  } as React.CSSProperties;

  const companyBrand = getActiveCompanyBrand(authUser?.companyName, authUser?.companyLogoUrl);

  return {
    platform: {
      ...platform,
      primaryColor,
      secondaryColor,
    },
    companyBrand,
    deploymentBadgeText,
    brandCssVars,
  };
}

import { Injectable } from '@nestjs/common';

export type DeploymentMode = 'CLOUD' | 'OFFLINE';

export interface PlatformBrandingConfig {
  platformName: string;
  platformNameAr: string;
  platformLogoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  deploymentMode: DeploymentMode;
}

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

@Injectable()
export class BrandingService {
  getPlatformBranding(env: NodeJS.ProcessEnv = process.env): PlatformBrandingConfig {
    const rawName = (env.PLATFORM_NAME || '').trim();
    const rawNameAr = (env.PLATFORM_NAME_AR || '').trim();
    const rawLogoUrl = (env.PLATFORM_LOGO_URL || '').trim();
    const rawPrimary = (env.PLATFORM_PRIMARY_COLOR || '').trim();
    const rawSecondary = (env.PLATFORM_SECONDARY_COLOR || '').trim();
    const rawMode = (env.DEPLOYMENT_MODE || '').trim().toUpperCase();

    const deploymentMode: DeploymentMode = rawMode === 'CLOUD' ? 'CLOUD' : 'OFFLINE';

    return {
      platformName: rawName || 'MadarCore',
      platformNameAr: rawNameAr || 'مدار كور',
      platformLogoUrl: rawLogoUrl || '/logo.png',
      primaryColor: HEX_COLOR_REGEX.test(rawPrimary) ? rawPrimary : '#582949',
      secondaryColor: HEX_COLOR_REGEX.test(rawSecondary) ? rawSecondary : '#00A8A8',
      deploymentMode,
    };
  }
}

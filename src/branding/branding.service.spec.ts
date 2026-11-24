jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: any) => target,
}));

import { BrandingService } from './branding.service';

describe('BrandingService', () => {
  let service: BrandingService;

  beforeEach(() => {
    service = new BrandingService();
  });

  it('returns MadarCore defaults when environment variables are absent', () => {
    const branding = service.getPlatformBranding({});

    expect(branding).toEqual({
      platformName: 'MadarCore',
      platformNameAr: 'مدار كور',
      platformLogoUrl: '/logo.png',
      primaryColor: '#582949',
      secondaryColor: '#00A8A8',
      deploymentMode: 'OFFLINE',
    });
  });

  it('respects valid environment overrides including CLOUD deployment mode', () => {
    const branding = service.getPlatformBranding({
      PLATFORM_NAME: 'MadarCore Cloud',
      PLATFORM_NAME_AR: 'مدار كور السحابي',
      PLATFORM_LOGO_URL: '/assets/custom-logo.png',
      PLATFORM_PRIMARY_COLOR: '#123456',
      PLATFORM_SECONDARY_COLOR: '#ABCDEF',
      DEPLOYMENT_MODE: 'cloud',
    });

    expect(branding).toEqual({
      platformName: 'MadarCore Cloud',
      platformNameAr: 'مدار كور السحابي',
      platformLogoUrl: '/assets/custom-logo.png',
      primaryColor: '#123456',
      secondaryColor: '#ABCDEF',
      deploymentMode: 'CLOUD',
    });
  });

  it('falls back safely when colors or deploymentMode are invalid', () => {
    const branding = service.getPlatformBranding({
      PLATFORM_NAME: '   ',
      PLATFORM_PRIMARY_COLOR: 'not-a-hex',
      PLATFORM_SECONDARY_COLOR: '#123',
      DEPLOYMENT_MODE: 'INVALID_MODE',
    });

    expect(branding.platformName).toBe('MadarCore');
    expect(branding.primaryColor).toBe('#582949');
    expect(branding.secondaryColor).toBe('#00A8A8');
    expect(branding.deploymentMode).toBe('OFFLINE');
  });
});

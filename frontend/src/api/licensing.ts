import axios from 'axios';

export interface LicenseStatus {
  isActivated: boolean;
  hwid: string;
  clientName?: string;
  licenseType?: 'LIFETIME' | 'ANNUAL' | 'TRIAL';
  expiresAt?: string;
  issuedAt?: string;
  error?: string;
}

export const licensingApi = {
  getStatus: (): Promise<LicenseStatus> =>
    axios.get('/api/licensing/status').then((res) => res.data),

  activate: (licenseKey: string): Promise<LicenseStatus> =>
    axios.post('/api/licensing/activate', { licenseKey }).then((res) => res.data),
};

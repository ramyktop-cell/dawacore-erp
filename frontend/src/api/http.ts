import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';
function apiUrl(input: string): URL {
 const url = new URL(input, window.location.origin);
 if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) throw new Error('Only same-origin API requests are allowed');
 return url;
}
function expired() {
 localStorage.removeItem('dawacore_token');localStorage.removeItem('dawacore_user');
 useAuthStore.getState().logout();
 if (window.location.pathname !== '/login') window.location.assign('/login');
}
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
 const url = apiUrl(input);const headers = new Headers(init.headers);
 const token = localStorage.getItem('dawacore_token');
 if (token) headers.set('Authorization', `Bearer ${token}`);
 const response = await window.fetch(url.href, { ...init, headers, redirect: 'error' });
 if (response.status === 401 && url.pathname !== '/api/auth/login') expired();
 return response;
}
export const apiClient = axios.create();
apiClient.interceptors.request.use(config => {
 apiUrl(config.url || '');const token = localStorage.getItem('dawacore_token');
 if (token) config.headers.set('Authorization', `Bearer ${token}`);
 return config;
});
apiClient.interceptors.response.use(response => response, error => {
 if (error.response?.status === 401 && !String(error.config?.url).endsWith('/auth/login')) expired();
 return Promise.reject(error);
});
export async function downloadReport(url: string): Promise<void> {
 try {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error('تعذر تنزيل التقرير؛ تحقق من الصلاحيات');
  const objectUrl = URL.createObjectURL(await response.blob());const link = document.createElement('a');
  const suggested = /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') || '')?.[1];
  const extension = response.headers.get('content-type')?.includes('pdf') ? 'pdf' : 'xlsx';
  link.download = suggested?.replace(/[\\/]/g, '_') || `report.${extension}`;link.href = objectUrl;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
 } catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر تنزيل التقرير'); }
}

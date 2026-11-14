jest.mock('../frontend/src/stores/auth.store',()=>({useAuthStore:{getState:()=>({logout:jest.fn()})}}));
import {apiFetch,apiClient} from '../frontend/src/api/http';
describe('Frontend authenticated HTTP client',()=>{
 let storage:Map<string,string>,fetchMock:jest.Mock,assign:jest.Mock;
 beforeEach(()=>{
  storage=new Map([['dawacore_token','test-token'],['dawacore_user','{}']]);
  fetchMock=jest.fn().mockResolvedValue({status:200,ok:true});assign=jest.fn();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)||null,removeItem:(k:string)=>storage.delete(k)}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'http://localhost:5174',pathname:'/pos',assign},fetch:fetchMock}});
 });
 afterAll(()=>{delete (globalThis as any).window;delete (globalThis as any).localStorage;});
 it('fetch includes Bearer without dropping JSON headers',async()=>{
  await apiFetch('/api/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const options=fetchMock.mock.calls[0][1];expect(options.headers.get('Authorization')).toBe('Bearer test-token');expect(options.headers.get('Content-Type')).toBe('application/json');
 });
 it('fetch and axios refuse to send credentials to another origin',async()=>{
  await expect(apiFetch('https://untrusted.invalid/api/users')).rejects.toThrow();
  await expect(apiClient.get('https://untrusted.invalid/api/users')).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it('axios adds Bearer to existing API calls',async()=>{
  let headers:any;
  await apiClient.get('/api/users',{adapter:async config=>{headers=config.headers;return {config,status:200,statusText:'OK',headers:{},data:{}}}});
  expect(headers.get('Authorization')).toBe('Bearer test-token');
 });
 it('an expired API session clears credentials and redirects to login',async()=>{
  fetchMock.mockResolvedValue({status:401,ok:false});await apiFetch('/api/users');
  expect(storage.has('dawacore_token')).toBe(false);expect(assign).toHaveBeenCalledWith('/login');
 });
 it('failed login stays on the form instead of redirecting',async()=>{
  fetchMock.mockResolvedValue({status:401,ok:false});await apiFetch('/api/auth/login');expect(assign).not.toHaveBeenCalled();
 });
});

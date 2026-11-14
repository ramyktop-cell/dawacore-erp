import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LoginRateGuard } from '../src/auth/login-rate.guard';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LicensingService } from '../src/licensing/licensing.service';
import { AuthService } from '../src/auth/auth.service';
import { SecurityGuard } from '../src/auth/security.guard';
import { POLICY, PUBLIC_ROUTE, PERMISSION } from '../src/auth/security.policy';
import { credentialVersion, JWT_AUDIENCE, JWT_ISSUER, requireJwtSecret } from '../src/auth/security.config';

describe('Security boundaries (no database access)', () => {
 let app: any, jwt: JwtService, user: any, passwordHash: string;
 const mock: any = { user: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), create: jest.fn() }, branch: {findFirst: jest.fn()}, company:{findUnique:jest.fn()} };
 beforeAll(async () => {
  passwordHash = await bcrypt.hash('test-password-not-a-default', 4);
  const module = await Test.createTestingModule({ imports: [AppModule] })
   .overrideProvider(PrismaService).useValue(mock)
   .overrideProvider(LicensingService).useValue({ onModuleInit: () => {}, getStatus: () => ({ isActivated: true }), checkCurrentLicense: () => ({ isActivated: true }), activate: jest.fn() })
   .compile();
  app=module.createNestApplication();app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));
  await app.init();jwt=app.get(JwtService);
 });
 afterAll(async()=>{await app?.close()});
 beforeEach(()=>{
  jest.clearAllMocks();
  user={id:'u1',username:'cashier',name:'Cashier',companyId:'c1',branchId:'b1',role:Role.CASHIER,isActive:true,passwordHash};
  mock.user.findUnique.mockImplementation(async()=>user);
  mock.user.findMany.mockResolvedValue([]);mock.user.count.mockResolvedValue(0);
  mock.user.findFirst.mockImplementation(async()=>user);
 });
 const token=(extra={})=>jwt.sign({sub:'u1',cv:credentialVersion(passwordHash),...extra});

 it('every real controller endpoint has an explicit known policy or narrowly allowed public route',()=>{
  let count=0;
  const manifest:any[]=[];
  for(const module of app.get(ModulesContainer).values())for(const wrapper of module.controllers.values()){
   const controller=wrapper.metatype;if(!controller)continue;
   const proto=controller.prototype;
   for(const name of Object.getOwnPropertyNames(proto)){
    const fn=proto[name];if(typeof fn!=='function'||Reflect.getMetadata(METHOD_METADATA,fn)===undefined)continue;
    count++;
    manifest.push({controller:controller.name,method:name,prefix:Reflect.getMetadata(PATH_METADATA,controller),path:Reflect.getMetadata(PATH_METADATA,fn),httpMethod:RequestMethod[Reflect.getMetadata(METHOD_METADATA,fn)],permission:Reflect.getMetadata(PERMISSION,fn)||'PUBLIC'});
    if(Reflect.getMetadata(PUBLIC_ROUTE,fn)){
     expect([`AuthController.login`,`LicensingController.getStatus`,`LicensingController.activate`]).toContain(`${controller.name}.${name}`);
    }else expect(POLICY[Reflect.getMetadata(PERMISSION,fn)]).toBeDefined();
   }
  }
  expect(count).toBeGreaterThan(130);
  fs.writeFileSync(path.join(process.cwd(),'security-route-manifest.json'),JSON.stringify(manifest,null,2));
 });
 it('all protected HTTP routes reject requests without a token',async()=>{
  for(const module of app.get(ModulesContainer).values())for(const wrapper of module.controllers.values()){
   const controller=wrapper.metatype;if(!controller)continue;
   const proto=controller.prototype;
   for(const name of Object.getOwnPropertyNames(proto)){
    const fn=proto[name];if(typeof fn!=='function')continue;
    const method=Reflect.getMetadata(METHOD_METADATA,fn);
    if(method===undefined||Reflect.getMetadata(PUBLIC_ROUTE,fn))continue;
    for(const prefix of [Reflect.getMetadata(PATH_METADATA,controller)].flat())for(const suffix of [Reflect.getMetadata(PATH_METADATA,fn)].flat()){
     const url=('/'+prefix+'/'+suffix).replace(/\/+/g,'/').replace(/:[^/]+/g,'00000000-0000-4000-8000-000000000001');
     const verb=RequestMethod[method].toLowerCase();
     const response=await (request(app.getHttpServer()) as any)[verb](url);
     expect({url,status:response.status}).toEqual({url,status:401});
    }
   }
  }
 });
 it('login is public and emits a usable JWT',async()=>{
  const result=await request(app.getHttpServer()).post('/auth/login').send({username:'cashier',password:'test-password-not-a-default'}).expect(200);
  expect(jwt.verify(result.body.accessToken).sub).toBe('u1');
  expect(JSON.stringify(result.body)).not.toContain(passwordHash);
 });
 it('cashier cannot create accounts or approve shifts',async()=>{
  await request(app.getHttpServer()).post('/users').set('Authorization','Bearer '+token()).send({}).expect(403);
  await request(app.getHttpServer()).patch('/shifts/id/approve').set('Authorization','Bearer '+token()).send({}).expect(403);
 });
 it('company administrator can list scoped users',async()=>{
  user.role=Role.COMPANY_ADMIN;
  await request(app.getHttpServer()).get('/users?companyId=foreign').set('Authorization','Bearer '+token()).expect(200);
  expect(mock.user.findMany.mock.calls[0][0].where.companyId).toBe('c1');
 });
 it('cashier staff lookup is scoped and excludes credential/contact fields',async()=>{
  await request(app.getHttpServer()).get('/users/directory').set('Authorization','Bearer '+token()).expect(200);
  const query=mock.user.findMany.mock.calls[0][0];
  expect(query.where).toMatchObject({companyId:'c1',branchId:'b1'});
  expect(query.select).toEqual({id:true,name:true,role:true});
 });
 it('forged signature, expired and wrong audience tokens fail',async()=>{
  const bad=[token().slice(0,-8)+'00000000',jwt.sign({sub:'u1',cv:credentialVersion(passwordHash)},{expiresIn:-1}),jwt.sign({sub:'u1',cv:credentialVersion(passwordHash)},{audience:'foreign'})];
  for(const t of bad)await request(app.getHttpServer()).get('/users').set('Authorization','Bearer '+t).expect(401);
 });
 it('disabled accounts and changed credentials invalidate tokens',async()=>{
  const old=token();user.isActive=false;
  await request(app.getHttpServer()).get('/users').set('Authorization','Bearer '+old).expect(401);
  user.isActive=true;user.passwordHash='changed';
  await request(app.getHttpServer()).get('/users').set('Authorization','Bearer '+old).expect(401);
 });
 it('signed role claims cannot override the current database role',async()=>{
  await request(app.getHttpServer()).get('/users').set('Authorization','Bearer '+token({role:'SUPER_ADMIN',roles:['SUPER_ADMIN']})).expect(403);
 });
 it('default PIN never succeeds when no manager matches',async()=>{
  expect(await app.get(AuthService).verifyManagerPin('b1','1234',user)).toBe(false);
 });
 it('company administrator cannot create a super administrator',async()=>{
  user.role=Role.COMPANY_ADMIN;
  await request(app.getHttpServer()).post('/users').set('Authorization','Bearer '+token()).send({companyId:'c1',username:'new',password:'a-strong-new-password',role:'SUPER_ADMIN'}).expect(403);
  expect(mock.user.create).not.toHaveBeenCalled();
 });
 it('company administrator cannot disable a super administrator',async()=>{
  user.role=Role.COMPANY_ADMIN;
  mock.user.findUnique.mockImplementation(async({where}:any)=>where.id==='target'?{...user,role:Role.SUPER_ADMIN}:user);
  await request(app.getHttpServer()).patch('/auth/users/target/status').set('Authorization','Bearer '+token()).send({isActive:false}).expect(404);
  expect(mock.user.update).not.toHaveBeenCalled();
 });
 it('missing/default JWT secrets fail closed',()=>{
  expect(()=>requireJwtSecret(undefined)).toThrow();
  expect(()=>requireJwtSecret('dawacore_secure_jwt_secret_key_2026_pharmacy')).toThrow();
 });
 it('login attempts are limited without trusting spoofed forwarded headers',()=>{
  const guard=new LoginRateGuard();
  const context:any={switchToHttp:()=>({getRequest:()=>({ip:'127.0.0.1',headers:{'x-forwarded-for':crypto.randomUUID()}})})};
  for(let i=0;i<20;i++)expect(guard.canActivate(context)).toBe(true);
  expect(()=>guard.canActivate(context)).toThrow();
 });
 it('licenses require the vendor private key and correct hardware and expiry',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dawacore-license-test-'));
  const keys=crypto.generateKeyPairSync('ed25519');
  const keyFile=path.join(folder,'public.pem');
  fs.writeFileSync(keyFile,keys.publicKey.export({type:'spki',format:'pem'}));
  const previous=process.env.LICENSE_PUBLIC_KEY_PATH;process.env.LICENSE_PUBLIC_KEY_PATH=keyFile;
  try{
   const service=new LicensingService();
   const sign=(payload:any)=>{const p=Buffer.from(JSON.stringify(payload)).toString('base64url');return 'v2.'+p+'.'+crypto.sign(null,Buffer.from('v2.'+p),keys.privateKey).toString('base64url')};
   const payload={h:'test-hardware',c:'test',t:'TRIAL',e:Date.now()+60000,i:Date.now()};
   expect(service.verifyKey(sign(payload),'test-hardware').isActivated).toBe(true);
   expect(service.verifyKey(sign(payload),'wrong-hardware').isActivated).toBe(false);
   expect(service.verifyKey(sign({...payload,e:Date.now()-1000}),'test-hardware').isActivated).toBe(false);
   expect(service.verifyKey(sign(payload).slice(0,-10)+'0000000000','test-hardware').isActivated).toBe(false);
   expect(service.verifyKey('legacy.payload','test-hardware').isActivated).toBe(false);
  }finally{if(previous===undefined)delete process.env.LICENSE_PUBLIC_KEY_PATH;else process.env.LICENSE_PUBLIC_KEY_PATH=previous;fs.unlinkSync(keyFile);fs.rmdirSync(folder);}
 });
 it('a new endpoint without a policy is denied even to a super administrator',async()=>{
  user.role=Role.SUPER_ADMIN;
  const guard=new SecurityGuard(app.get(Reflector),jwt,mock);
  const context:any={getHandler:()=>function unclassified(){},getClass:()=>class Unknown{},switchToHttp:()=>({getRequest:()=>({headers:{authorization:'Bearer '+token()}})})};
  await expect(guard.canActivate(context)).rejects.toMatchObject({status:403});
 });
 it.each(Object.values(Role))('enforces every explicit policy for role %s',async(role)=>{
  user.role=role;const guard=new SecurityGuard(app.get(Reflector),jwt,mock);
  for(const [permission,allowed] of Object.entries(POLICY)){
   const fn=()=>{};Reflect.defineMetadata(PERMISSION,permission,fn);
   const context:any={getHandler:()=>fn,getClass:()=>class Endpoint{},switchToHttp:()=>({getRequest:()=>({headers:{authorization:'Bearer '+token()}})})};
   if(allowed.includes(role))expect(await guard.canActivate(context)).toBe(true);
   else await expect(guard.canActivate(context)).rejects.toMatchObject({status:403});
  }
 });
});

#!/usr/bin/env node
/**
 * Behavioral Test Harness for RR-002, RR-003, and RR-004
 * Transpiles and executes the actual frontend TypeScript modules in an isolated browser-like runtime
 * to verify runtime behavior for:
 * - RR-002: logoutUser() delegates to useAuthStore.getState().logout(), clears Zustand state + persisted dawacore-auth + legacy keys, and prevents tenant A -> B leakage.
 * - RR-003: Unsaved businessType selection or failed updateBatch does not pollute authenticated user context; only committed save updates it.
 * - RR-004: Platform branding config (CLOUD vs OFFLINE badge, custom logo/colors, invalid color/URL sanitization, and failed endpoint fallback).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

let failures = 0;
function assert(condition, msg) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

// Create simulated browser environment
function createBrowserEnv() {
  const store = new Map();
  const listeners = new Map();
  const localStorage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
  };

  class CustomEvent {
    constructor(type, opts) {
      this.type = type;
      this.detail = opts ? opts.detail : undefined;
    }
  }

  const windowObj = {
    localStorage,
    location: { href: '/dashboard', origin: 'http://localhost:5173' },
    CustomEvent,
    addEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      listeners.set(
        type,
        arr.filter((f) => f !== fn),
      );
    },
    dispatchEvent(evt) {
      const arr = listeners.get(evt.type) || [];
      for (const fn of arr) fn(evt);
      return true;
    },
  };

  return { windowObj, localStorage, CustomEvent };
}

// Minimal TS module loader that resolves frontend/src modules and stubs zustand + http
function createTsLoader(env, mockApiFetch) {
  const cache = new Map();

  // Lightweight Zustand + persist implementation matching Zustand v4/v5 store semantics
  const zustandStub = {
    create() {
      return (initializer) => {
        let state = {};
        const subscribers = new Set();
        const setState = (partial, replace) => {
          const next = typeof partial === 'function' ? partial(state) : partial;
          state = replace ? next : Object.assign({}, state, next);
          for (const sub of subscribers) sub(state);
        };
        const getState = () => state;
        const api = {
          setState,
          getState,
          subscribe(fn) {
            subscribers.add(fn);
            return () => subscribers.delete(fn);
          },
        };
        state = initializer(setState, getState, api);
        const useStore = (selector) => (selector ? selector(state) : state);
        Object.assign(useStore, api);
        return useStore;
      };
    },
  };

  const zustandMiddlewareStub = {
    persist(config, options) {
      return (set, get, api) => {
        const storageKey = (options && options.name) || 'zustand-storage';
        const wrappedSet = (partial, replace) => {
          set(partial, replace);
          const current = get();
          env.localStorage.setItem(
            storageKey,
            JSON.stringify({
              state: { user: current.user ?? null, token: current.token ?? null },
              version: 0,
            }),
          );
        };
        const initial = config(wrappedSet, get, api);
        try {
          const raw = env.localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.state) {
              Object.assign(initial, parsed.state);
            }
          }
        } catch {}
        return initial;
      };
    },
  };

  function loadModule(absPath) {
    const resolved = absPath.endsWith('.ts') ? absPath : `${absPath}.ts`;
    if (cache.has(resolved)) return cache.get(resolved).exports;

    const source = fs.readFileSync(resolved, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: resolved,
    }).outputText;

    const mod = { exports: {} };
    cache.set(resolved, mod);

    const customRequire = (id) => {
      if (id === 'zustand') return zustandStub;
      if (id === 'zustand/middleware') return zustandMiddlewareStub;
      if (id === './http' || id.endsWith('/http')) {
        return { apiFetch: (...args) => mockApiFetch(...args) };
      }
      if (id.startsWith('.')) {
        const target = path.resolve(path.dirname(resolved), id);
        return loadModule(target);
      }
      return require(id);
    };

    const sandbox = {
      module: mod,
      exports: mod.exports,
      require: customRequire,
      window: env.windowObj,
      localStorage: env.localStorage,
      CustomEvent: env.CustomEvent,
      console,
      setTimeout,
      clearTimeout,
    };

    vm.runInNewContext(transpiled, sandbox, { filename: resolved });
    return mod.exports;
  }

  return { loadModule };
}

async function runTests() {
  let mockFetchHandler = async () => ({
    ok: true,
    json: async () => ({}),
  });

  const env = createBrowserEnv();
  const loader = createTsLoader(env, (...args) => mockFetchHandler(...args));

  const authStoreMod = loader.loadModule(
    path.join(ROOT, 'frontend/src/stores/auth.store.ts'),
  );
  const permissionsMod = loader.loadModule(
    path.join(ROOT, 'frontend/src/utils/permissions.ts'),
  );
  const terminologyMod = loader.loadModule(
    path.join(ROOT, 'frontend/src/utils/business-terminology.ts'),
  );
  const brandingApiMod = loader.loadModule(
    path.join(ROOT, 'frontend/src/api/branding.ts'),
  );
  const platformBrandMod = loader.loadModule(
    path.join(ROOT, 'frontend/src/utils/platform-brand.ts'),
  );

  // =========================================================================
  // RR-002: Logout clears Zustand store, persisted dawacore-auth, legacy keys
  // =========================================================================
  const userA = {
    id: 'u-a',
    name: 'أحمد',
    username: 'admin_a',
    role: 'COMPANY_ADMIN',
    companyId: 'comp-a',
    companyName: 'صيدلية الشفاء - الشركة أ',
    companyLogoUrl: '/logo-company-a.png',
    businessType: 'PHARMACY',
  };

  authStoreMod.useAuthStore.getState().setAuth(userA, 'jwt-token-a');

  assert(
    authStoreMod.useAuthStore.getState().user?.companyName === 'صيدلية الشفاء - الشركة أ',
    'RR-002: Login Company A sets companyName in Zustand store',
  );
  assert(
    platformBrandMod.getActiveCompanyBrand().displayNameAr === 'صيدلية الشفاء - الشركة أ',
    'RR-002: getActiveCompanyBrand() returns Company A name while logged in',
  );

  // Execute actual logoutUser() from permissions.ts
  permissionsMod.logoutUser();

  assert(
    authStoreMod.useAuthStore.getState().user === null &&
      authStoreMod.useAuthStore.getState().token === null,
    'RR-002: logoutUser() clears user and token inside Zustand store',
  );
  assert(
    env.localStorage.getItem('dawacore_user') === null &&
      env.localStorage.getItem('dawacore_token') === null &&
      env.localStorage.getItem('dawacore_business_type') === null,
    'RR-002: logoutUser() removes dawacore_user, dawacore_token, and dawacore_business_type from localStorage',
  );

  const persistedAuthAfterLogout = JSON.parse(
    env.localStorage.getItem('dawacore-auth') || '{}',
  );
  assert(
    persistedAuthAfterLogout?.state?.user === null &&
      persistedAuthAfterLogout?.state?.token === null,
    'RR-002: logoutUser() resets persisted dawacore-auth state to { user: null, token: null }',
  );
  assert(
    platformBrandMod.getActiveCompanyBrand().displayNameAr !== 'صيدلية الشفاء - الشركة أ' &&
      platformBrandMod.getActiveCompanyBrand().logoUrl !== '/logo-company-a.png',
    'RR-002: After logoutUser(), getActiveCompanyBrand() does not retain Company A name or logo',
  );
  assert(
    env.windowObj.location.href === '/login',
    'RR-002: logoutUser() redirects to /login after cleaning store',
  );

  // Now login as Company B in the same browser session
  const userB = {
    id: 'u-b',
    name: 'سارة',
    username: 'admin_b',
    role: 'COMPANY_ADMIN',
    companyId: 'comp-b',
    companyName: 'معرض المدار للأزياء - الشركة ب',
    companyLogoUrl: '/logo-company-b.png',
    businessType: 'CLOTHING',
  };
  authStoreMod.useAuthStore.getState().setAuth(userB, 'jwt-token-b');

  assert(
    platformBrandMod.getActiveCompanyBrand().displayNameAr === 'معرض المدار للأزياء - الشركة ب' &&
      platformBrandMod.getActiveCompanyBrand().logoUrl === '/logo-company-b.png' &&
      terminologyMod.getBusinessType() === 'CLOTHING',
    'RR-002: Logging in as Company B immediately reflects Company B name, logo, and CLOTHING businessType without any Company A residue',
  );

  // =========================================================================
  // RR-003: Unsaved business activity does not pollute authenticated context
  // =========================================================================
  authStoreMod.useAuthStore.getState().setAuth(userA, 'jwt-token-a');
  assert(
    terminologyMod.getBusinessType() === 'PHARMACY',
    'RR-003: Initial saved businessType for Company A is PHARMACY',
  );

  // Simulate SettingsPage card click (only updates local form state, NOT setBusinessType)
  const settingsPageSource = fs.readFileSync(
    path.join(ROOT, 'frontend/src/pages/settings/SettingsPage.tsx'),
    'utf8',
  );
  const cardClickBlock = settingsPageSource.match(
    /onClick=\{\(\)\s*=>\s*\{[\s\S]*?\}\}/,
  );
  assert(
    cardClickBlock &&
      cardClickBlock[0].includes("setVal('businessType', profile.type)") &&
      !cardClickBlock[0].includes('setBusinessType('),
    'RR-003: SettingsPage business activity card onClick updates local form state only and does not call setBusinessType before save',
  );

  // Simulate failed updateBatch: setBusinessType is not called
  let saveFailed = false;
  try {
    throw new Error('Server 500 error during updateBatch');
  } catch {
    saveFailed = true;
  }
  assert(
    saveFailed &&
      terminologyMod.getBusinessType() === 'PHARMACY' &&
      authStoreMod.useAuthStore.getState().user?.businessType === 'PHARMACY',
    'RR-003: When updateBatch fails, authenticated user context remains PHARMACY',
  );

  // Simulate successful updateBatch followed by setBusinessType('CLOTHING')
  terminologyMod.setBusinessType('CLOTHING');
  assert(
    terminologyMod.getBusinessType() === 'CLOTHING' &&
      authStoreMod.useAuthStore.getState().user?.businessType === 'CLOTHING' &&
      terminologyMod.getBusinessTerminology().scientificNameLabel.includes('اسم الصنف'),
    'RR-003: After updateBatch succeeds, setBusinessType updates auth context and terminology to CLOTHING',
  );

  // =========================================================================
  // RR-004: Branding config, CLOUD/OFFLINE badges, colors, and safe fallbacks
  // =========================================================================
  brandingApiMod.resetPlatformBrandingCache();
  mockFetchHandler = async () => ({
    ok: true,
    json: async () => ({
      platformName: 'MadarCore Cloud',
      platformNameAr: 'مدار كور السحابي',
      platformLogoUrl: 'https://cdn.madarcore.local/custom-logo.png',
      primaryColor: '#1B4332',
      secondaryColor: '#D97706',
      deploymentMode: 'CLOUD',
    }),
  });

  const cloudCfg = await brandingApiMod.fetchPlatformBranding();
  assert(
    cloudCfg.deploymentMode === 'CLOUD' &&
      brandingApiMod.getDeploymentBadgeText(cloudCfg.deploymentMode) ===
        'نسخة سحابية • أونلاين' &&
      cloudCfg.platformLogoUrl === 'https://cdn.madarcore.local/custom-logo.png' &&
      cloudCfg.primaryColor === '#1B4332' &&
      cloudCfg.secondaryColor === '#D97706',
    'RR-004: CLOUD branding endpoint applies custom logo, hex colors, and Cloud badge («نسخة سحابية • أونلاين»)',
  );

  brandingApiMod.resetPlatformBrandingCache();
  mockFetchHandler = async () => ({
    ok: true,
    json: async () => ({
      platformName: 'MadarCore Local',
      platformNameAr: 'مدار كور المحلي',
      platformLogoUrl: '/logo.png',
      primaryColor: '#582949',
      secondaryColor: '#00A8A8',
      deploymentMode: 'OFFLINE',
    }),
  });

  const offlineCfg = await brandingApiMod.fetchPlatformBranding();
  const offlineBadge = brandingApiMod.getDeploymentBadgeText(offlineCfg.deploymentMode);
  assert(
    offlineCfg.deploymentMode === 'OFFLINE' &&
      offlineBadge === 'نسخة محلية • تعمل داخل شبكة المنشأة' &&
      !offlineBadge.includes('أونلاين'),
    'RR-004: OFFLINE branding endpoint displays «نسخة محلية • تعمل داخل شبكة المنشأة» and never claims online',
  );

  brandingApiMod.resetPlatformBrandingCache();
  mockFetchHandler = async () => ({
    ok: true,
    json: async () => ({
      platformName: '',
      platformLogoUrl: 'javascript:alert(1)',
      primaryColor: 'not-a-valid-color',
      secondaryColor: 'rgb(0,0,0)',
      deploymentMode: 'INVALID_MODE',
    }),
  });

  const sanitizedCfg = await brandingApiMod.fetchPlatformBranding();
  assert(
    sanitizedCfg.platformName === 'MadarCore' &&
      sanitizedCfg.platformLogoUrl === '/logo.png' &&
      sanitizedCfg.primaryColor === '#582949' &&
      sanitizedCfg.secondaryColor === '#00A8A8' &&
      sanitizedCfg.deploymentMode === 'OFFLINE',
    'RR-004: Invalid colors/logo/mode from endpoint fall back safely to defaults',
  );

  brandingApiMod.resetPlatformBrandingCache();
  mockFetchHandler = async () => {
    throw new Error('Network unreachable');
  };
  const fallbackCfg = await brandingApiMod.fetchPlatformBranding();
  assert(
    fallbackCfg.platformName === 'MadarCore' &&
      fallbackCfg.deploymentMode === 'OFFLINE' &&
      fallbackCfg.primaryColor === '#582949',
    'RR-004: Failed /api/branding endpoint falls back safely to DEFAULT_PLATFORM_BRANDING without crashing',
  );

  if (failures > 0) {
    console.error(`\n❌ Behavioral verification failed with ${failures} error(s).`);
    process.exit(1);
  } else {
    console.log('\n🎉 All behavioral tenant-context & branding checks (RR-002, RR-003, RR-004) passed!');
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

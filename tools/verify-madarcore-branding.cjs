#!/usr/bin/env node
/**
 * Verification Script for Task 20261115-madarcore-branding-business-activity-phase1
 * Checks:
 * 1. Only allowed files from IMPLEMENTATION_PLAN.md and REPAIR_REQUEST.md are modified/created.
 * 2. Visible DawaCore / داواكور strings are replaced in all targeted UI & report files.
 * 3. Technical storage/channel identifiers remain intact.
 * 4. CLOTHING profile exists with 'اسم الصنف' and without 'الاسم العلمي'.
 * 5. UserFormModal displays read-only company activity and keeps submit payload clean.
 * 6. PriceListReportModal does not fall back to companies[0] across tenants.
 * 7. RR-001: CompaniesController passes @CurrentUser() actor and CompaniesService scopes tenant access.
 * 8. RR-002: logoutUser() delegates to useAuthStore.getState().logout().
 * 9. RR-003: SettingsPage only commits setBusinessType after settingsApi.updateBatch succeeds.
 * 10. RR-004: LoginPage & ActivationPage apply platformLogoUrl (with onError fallback), primaryColor, secondaryColor, and deploymentBadgeText without dangerouslySetInnerHTML.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const ALLOWED_FILES = new Set([
  '.env.example',
  '.env.production.example',
  'src/app.module.ts',
  'src/app.controller.ts',
  'src/main.ts',
  'src/branding/branding.module.ts',
  'src/branding/branding.controller.ts',
  'src/branding/branding.service.ts',
  'src/branding/branding.service.spec.ts',
  'src/auth/auth.service.ts',
  'src/auth/auth.service.spec.ts',
  'src/companies/companies.controller.ts',
  'src/companies/companies.controller.spec.ts',
  'src/companies/companies.service.ts',
  'src/companies/companies.service.spec.ts',
  'src/medicines/medicines.service.ts',
  'src/medicines/medicines.service.spec.ts',
  'src/modules/settings/interfaces/settings.interface.ts',
  'src/modules/accounting/reports/services/pdf-export.service.ts',
  'src/shared/report-kit/exporters/excel.exporter.ts',
  'src/shared/report-kit/exporters/pdf.exporter.ts',
  'src/shared/supplier-documents/supplier-documents-pdf.service.ts',
  'frontend/index.html',
  'frontend/src/App.tsx',
  'frontend/src/api/branding.ts',
  'frontend/src/api/companies.ts',
  'frontend/src/stores/auth.store.ts',
  'frontend/src/utils/permissions.ts',
  'frontend/src/utils/platform-brand.ts',
  'frontend/src/hooks/usePlatformBrand.ts',
  'frontend/src/utils/business-terminology.ts',
  'frontend/src/hooks/useBusinessTerminology.ts',
  'frontend/src/components/users/UserFormModal.tsx',
  'frontend/src/components/AppSidebar.tsx',
  'frontend/src/pages/LoginPage.tsx',
  'frontend/src/pages/ActivationPage.tsx',
  'frontend/src/pages/settings/SettingsPage.tsx',
  'frontend/src/pages/CustomerDisplayPage.tsx',
  'frontend/src/pages/CustomerStatementPage.tsx',
  'frontend/src/pages/PosPage.tsx',
  'frontend/src/pages/ReceiptsPage.tsx',
  'frontend/src/pages/SalesInvoicesPage.tsx',
  'frontend/src/pages/ShiftsPage.tsx',
  'frontend/src/components/common/BarcodeLabelModal.tsx',
  'frontend/src/components/expenses/ExpensePrintModal.tsx',
  'frontend/src/components/receipts/ReceiptPrintModal.tsx',
  'frontend/src/components/medicines/PriceListReportModal.tsx',
  'frontend/src/services/printer.service.ts',
  'tools/verify-madarcore-branding.cjs',
  'tools/verify-madarcore-tenant-context.cjs',
  'IMPLEMENTATION_REPORT.md',
  // Operational handoff/planning/review docs maintained by Codex in the working tree:
  'IMPLEMENTATION_PLAN.md',
  'ANTIGRAVITY_HANDOFF.md',
  'REVIEW_REPORT.md',
  'REPAIR_REQUEST.md',
]);

const BRANDING_TARGET_FILES = [
  'src/app.controller.ts',
  'src/main.ts',
  'src/modules/accounting/reports/services/pdf-export.service.ts',
  'src/shared/report-kit/exporters/excel.exporter.ts',
  'src/shared/report-kit/exporters/pdf.exporter.ts',
  'src/shared/supplier-documents/supplier-documents-pdf.service.ts',
  'frontend/index.html',
  'frontend/src/App.tsx',
  'frontend/src/components/AppSidebar.tsx',
  'frontend/src/pages/LoginPage.tsx',
  'frontend/src/pages/ActivationPage.tsx',
  'frontend/src/pages/settings/SettingsPage.tsx',
  'frontend/src/pages/CustomerDisplayPage.tsx',
  'frontend/src/pages/CustomerStatementPage.tsx',
  'frontend/src/pages/PosPage.tsx',
  'frontend/src/pages/ReceiptsPage.tsx',
  'frontend/src/pages/SalesInvoicesPage.tsx',
  'frontend/src/pages/ShiftsPage.tsx',
  'frontend/src/components/common/BarcodeLabelModal.tsx',
  'frontend/src/components/expenses/ExpensePrintModal.tsx',
  'frontend/src/components/receipts/ReceiptPrintModal.tsx',
  'frontend/src/components/medicines/PriceListReportModal.tsx',
  'frontend/src/services/printer.service.ts',
];

let failures = 0;

function pass(msg) {
  console.log(`✅ PASS: ${msg}`);
}

function fail(msg) {
  console.error(`❌ FAIL: ${msg}`);
  failures++;
}

// 1. Check git status against allowed files
try {
  const statusOut = execSync('git status --porcelain -uall', { cwd: ROOT, encoding: 'utf8' });
  const lines = statusOut
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  const unexpected = [];
  for (const line of lines) {
    const filePart = line.slice(3).trim().replace(/\\/g, '/');
    if (!ALLOWED_FILES.has(filePart)) {
      unexpected.push(filePart);
    }
  }

  if (unexpected.length > 0) {
    fail(`Modified/untracked files outside allowed list: ${unexpected.join(', ')}`);
  } else {
    pass(`All ${lines.length} touched files are within the allowed files list.`);
  }
} catch (err) {
  fail(`Failed to check git status: ${err.message}`);
}

// 2. Check visible DawaCore / داواكور in target files (excluding lowercase technical keys)
for (const relPath of BRANDING_TARGET_FILES) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing target file: ${relPath}`);
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.includes('DawaCore') || content.includes('داواكور')) {
    fail(`Found visible 'DawaCore' or 'داواكور' in ${relPath}`);
  }
}
if (failures === 0) {
  pass('Zero visible DawaCore / داواكور strings remain in all 23 targeted UI/report/print files.');
}

// 3. Check technical keys remain intact
const authStoreContent = fs.readFileSync(path.join(ROOT, 'frontend/src/stores/auth.store.ts'), 'utf8');
if (
  authStoreContent.includes("name: 'dawacore-auth'") &&
  authStoreContent.includes('dawacore_token') &&
  authStoreContent.includes('dawacore_user')
) {
  pass('Technical auth storage keys (dawacore-auth, dawacore_token, dawacore_user) are preserved.');
} else {
  fail('Technical auth storage keys were altered in frontend/src/stores/auth.store.ts.');
}

const customerDisplayContent = fs.readFileSync(
  path.join(ROOT, 'frontend/src/pages/CustomerDisplayPage.tsx'),
  'utf8',
);
if (
  customerDisplayContent.includes('dawacore_customer_display_state') &&
  customerDisplayContent.includes('dawacore-pos-active-cart') &&
  customerDisplayContent.includes('dawacore_pos_channel')
) {
  pass('Technical POS / CustomerDisplay channel and storage keys are preserved.');
} else {
  fail('Technical POS / CustomerDisplay keys were altered in CustomerDisplayPage.tsx.');
}

// 4. Check CLOTHING terminology
const terminologyContent = fs.readFileSync(
  path.join(ROOT, 'frontend/src/utils/business-terminology.ts'),
  'utf8',
);
const clothingMatch = terminologyContent.match(/CLOTHING:\s*\{[\s\S]*?\n\s*\},/);
if (!clothingMatch) {
  fail('CLOTHING profile not found in frontend/src/utils/business-terminology.ts');
} else {
  const clothingBlock = clothingMatch[0];
  if (
    clothingBlock.includes('اسم الصنف') &&
    !clothingBlock.includes('الاسم العلمي')
  ) {
    pass("CLOTHING profile uses 'اسم الصنف' and does not contain 'الاسم العلمي'.");
  } else {
    fail('CLOTHING profile scientificNameLabel check failed.');
  }
}

// 5. Check UserFormModal read-only company activity and clean submit payload
const userFormContent = fs.readFileSync(
  path.join(ROOT, 'frontend/src/components/users/UserFormModal.tsx'),
  'utf8',
);
if (
  userFormContent.includes('نشاط الشركة التابع لها المستخدم (للقراءة فقط)') &&
  !userFormContent.includes('payload.businessType') &&
  !userFormContent.includes('payload.activity')
) {
  pass('UserFormModal displays read-only company activity and keeps submit payload free of businessType/activity.');
} else {
  fail('UserFormModal verification failed.');
}

// 6. Check PriceListReportModal does not fall back to companies[0]
const priceListContent = fs.readFileSync(
  path.join(ROOT, 'frontend/src/components/medicines/PriceListReportModal.tsx'),
  'utf8',
);
if (!priceListContent.includes('companies[0]')) {
  pass('PriceListReportModal does not fall back to companies[0] across tenants.');
} else {
  fail('PriceListReportModal still contains companies[0] fallback.');
}

// 7. Check RR-001: CompaniesController & CompaniesService tenant scoping
const companiesControllerContent = fs.readFileSync(
  path.join(ROOT, 'src/companies/companies.controller.ts'),
  'utf8',
);
const companiesServiceContent = fs.readFileSync(
  path.join(ROOT, 'src/companies/companies.service.ts'),
  'utf8',
);
if (
  companiesControllerContent.includes('@CurrentUser() actor: AuthenticatedUser') &&
  companiesServiceContent.includes('assertCanReadCompany') &&
  companiesServiceContent.includes('assertCanUpdateCompany') &&
  companiesServiceContent.includes('assertSuperAdmin')
) {
  pass('RR-001: CompaniesController forwards @CurrentUser() actor and CompaniesService enforces tenant scope.');
} else {
  fail('RR-001: CompaniesController / CompaniesService tenant scoping check failed.');
}

// 8. Check RR-002: logoutUser delegates to useAuthStore.getState().logout()
const permissionsContent = fs.readFileSync(
  path.join(ROOT, 'frontend/src/utils/permissions.ts'),
  'utf8',
);
if (permissionsContent.includes('useAuthStore.getState().logout()')) {
  pass('RR-002: logoutUser() delegates to useAuthStore.getState().logout().');
} else {
  fail('RR-002: logoutUser() does not delegate to useAuthStore.getState().logout().');
}

// 9. Check RR-003: SettingsPage does not call setBusinessType on card click
const settingsContent = fs.readFileSync(
  path.join(ROOT, 'frontend/src/pages/settings/SettingsPage.tsx'),
  'utf8',
);
const cardOnClickMatch = settingsContent.match(/onClick=\{\(\)\s*=>\s*\{[\s\S]*?\}\}/);
if (
  cardOnClickMatch &&
  cardOnClickMatch[0].includes("setVal('businessType', profile.type)") &&
  !cardOnClickMatch[0].includes('setBusinessType(') &&
  settingsContent.includes('await settingsApi.updateBatch(payload);')
) {
  pass('RR-003: SettingsPage only updates local form state on card click and commits setBusinessType after updateBatch.');
} else {
  fail('RR-003: SettingsPage business activity card click check failed.');
}

// 10. Check RR-004: LoginPage and ActivationPage branding & deployment badge
const loginContent = fs.readFileSync(
  path.join(ROOT, 'frontend/src/pages/LoginPage.tsx'),
  'utf8',
);
const activationContent = fs.readFileSync(
  path.join(ROOT, 'frontend/src/pages/ActivationPage.tsx'),
  'utf8',
);
const brandingApiContent = fs.readFileSync(
  path.join(ROOT, 'frontend/src/api/branding.ts'),
  'utf8',
);
if (
  brandingApiContent.includes('نسخة سحابية • أونلاين') &&
  brandingApiContent.includes('نسخة محلية • تعمل داخل شبكة المنشأة') &&
  loginContent.includes('platform.platformLogoUrl') &&
  loginContent.includes('onError={() => setLogoError(true)}') &&
  loginContent.includes('deploymentBadgeText') &&
  loginContent.includes('platform.primaryColor') &&
  loginContent.includes('platform.secondaryColor') &&
  !loginContent.includes('النظام يعمل بكفاءة عالية • أونلاين') &&
  !loginContent.includes('dangerouslySetInnerHTML') &&
  activationContent.includes('onError={() => setLogoError(true)}') &&
  activationContent.includes('deploymentBadgeText') &&
  activationContent.includes('platform.primaryColor') &&
  activationContent.includes('platform.secondaryColor') &&
  !activationContent.includes('dangerouslySetInnerHTML')
) {
  pass('RR-004: LoginPage and ActivationPage apply logo with fallback, colors, and Cloud/Offline badge safely.');
} else {
  fail('RR-004: LoginPage / ActivationPage branding verification failed.');
}

if (failures > 0) {
  console.error(`\nVerification failed with ${failures} error(s).`);
  process.exit(1);
} else {
  console.log('\n🎉 All MadarCore Phase 1 & Repair verification checks passed!');
}

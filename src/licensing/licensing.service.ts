import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

export interface LicenseInfo {
  isActivated: boolean;
  hwid: string;
  clientName?: string;
  licenseType?: 'LIFETIME' | 'ANNUAL' | 'TRIAL';
  expiresAt?: string;
  issuedAt?: string;
  error?: string;
}

interface LicensePayload {
  h: string; // HWID
  c: string; // Client Name
  t: 'LIFETIME' | 'ANNUAL' | 'TRIAL';
  e: number; // Expiry timestamp (0 = lifetime)
  i: number; // Issued timestamp
}

@Injectable()
export class LicensingService implements OnModuleInit {
  private readonly secretKey =
    process.env.VENDOR_SECRET || 'DAWACORE_MASTER_VENDOR_SECRET_KEY_PROD_2026_SECURE';
  private readonly licenseFilePath = path.join(process.cwd(), 'license.key');

  private currentHwid: string = '';
  private activeLicense: LicenseInfo = {
    isActivated: false,
    hwid: '',
  };

  onModuleInit() {
    this.currentHwid = this.detectHardwareId();
    this.checkCurrentLicense();
  }

  /**
   * استخراج بصمة عتاد الجهاز (Motherboard UUID + MachineGuid)
   */
  public detectHardwareId(): string {
    if (this.currentHwid) return this.currentHwid;

    let rawId = '';

    // 1. Windows MachineGuid من الريجستري
    try {
      const regOutput = execSync(
        'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true },
      );
      const match = regOutput.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/i);
      if (match && match[1]) {
        rawId += match[1].trim();
      }
    } catch (e) {}

    // 2. Motherboard / System UUID عبر PowerShell أو WMIC
    try {
      const psOutput = execSync(
        'powershell -NoProfile -Command "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID"',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true },
      );
      if (psOutput && psOutput.trim()) {
        rawId += '_' + psOutput.trim();
      }
    } catch (e) {
      try {
        const wmicOutput = execSync('wmic csproduct get uuid', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
          windowsHide: true,
        });
        const lines = wmicOutput.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          rawId += '_' + lines[1];
        }
      } catch (e2) {}
    }

    // 3. Fallback إلى CPU و Hostname
    if (!rawId) {
      rawId = os.hostname() + '_' + (os.cpus()[0]?.model || 'GENERIC_CPU');
    }

    const hash = crypto.createHash('sha256').update(rawId).digest('hex').toUpperCase();
    const chunk1 = hash.substring(0, 4);
    const chunk2 = hash.substring(4, 8);
    const chunk3 = hash.substring(8, 12);
    const chunk4 = hash.substring(12, 16);

    this.currentHwid = `DWA-${chunk1}-${chunk2}-${chunk3}-${chunk4}`;
    return this.currentHwid;
  }

  /**
   * فحص ملف الترخيص الحالي المحفوظ في الجهاز
   */
  public checkCurrentLicense(): LicenseInfo {
    const hwid = this.detectHardwareId();

    if (!fs.existsSync(this.licenseFilePath)) {
      this.activeLicense = { isActivated: false, hwid };
      return this.activeLicense;
    }

    try {
      const rawKey = fs.readFileSync(this.licenseFilePath, 'utf8').trim();
      const verified = this.verifyKey(rawKey, hwid);
      this.activeLicense = verified;
      return this.activeLicense;
    } catch (err: any) {
      this.activeLicense = {
        isActivated: false,
        hwid,
        error: err.message || 'ملف الترخيص غير صالح',
      };
      return this.activeLicense;
    }
  }

  /**
   * تفعيل النظام بمفتاح ترخيص جديد
   */
  public activate(licenseKey: string): LicenseInfo {
    const hwid = this.detectHardwareId();
    const cleanKey = licenseKey.trim();

    const verification = this.verifyKey(cleanKey, hwid);

    if (!verification.isActivated) {
      throw new BadRequestException(verification.error || 'مفتاح الترخيص غير صالح');
    }

    // حفظ المفتاح في ملف license.key
    fs.writeFileSync(this.licenseFilePath, cleanKey, 'utf8');
    this.activeLicense = verification;
    return this.activeLicense;
  }

  /**
   * التحقق الرياضي والمشفّر من مفتاح الترخيص
   */
  public verifyKey(key: string, expectedHwid: string): LicenseInfo {
    try {
      const parts = key.split('.');
      if (parts.length !== 2) {
        return { isActivated: false, hwid: expectedHwid, error: 'صيغة مفتاح الترخيص غير صالحة' };
      }

      const [payloadBase64, signature] = parts;
      const expectedSig = crypto
        .createHmac('sha256', this.secretKey)
        .update(payloadBase64)
        .digest('hex')
        .substring(0, 24)
        .toUpperCase();

      if (signature.toUpperCase() !== expectedSig) {
        return { isActivated: false, hwid: expectedHwid, error: 'توقيع المفتاح غير معتمد أو تم التلاعب به' };
      }

      const jsonStr = Buffer.from(payloadBase64, 'base64').toString('utf8');
      const payload: LicensePayload = JSON.parse(jsonStr);

      // التحقق الصارم من بصمة الجهاز (Hardware Lock)
      if (payload.h !== expectedHwid) {
        return {
          isActivated: false,
          hwid: expectedHwid,
          error: `هذا الترخيص مخصص لجهاز آخر (${payload.h}) ولا يعمل على هذا الجهاز!`,
        };
      }

      // التحقق من تاريخ الصلاحية
      if (payload.e > 0 && Date.now() > payload.e) {
        return {
          isActivated: false,
          hwid: expectedHwid,
          error: `انتهت صلاحية هذا الترخيص بتاريخ ${new Date(payload.e).toLocaleDateString('ar-EG')}`,
        };
      }

      return {
        isActivated: true,
        hwid: expectedHwid,
        clientName: payload.c,
        licenseType: payload.t,
        expiresAt: payload.e === 0 ? 'ترخيص دائم (Lifetime)' : new Date(payload.e).toISOString(),
        issuedAt: new Date(payload.i).toISOString(),
      };
    } catch (e: any) {
      return { isActivated: false, hwid: expectedHwid, error: 'تعذر فك تشفير الترخيص' };
    }
  }

  public getStatus(): LicenseInfo {
    return this.activeLicense;
  }
}

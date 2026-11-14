import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReportFilterDto } from '../report-filter.dto';

describe('IsGreaterThanOrEqualTo Decorator & ReportFilterDto', () => {
  it('should pass when toDate is greater than fromDate', async () => {
    const dto = plainToInstance(ReportFilterDto, {
      fromDate: '2026-01-01',
      toDate: '2026-01-15',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass when toDate equals fromDate', async () => {
    const dto = plainToInstance(ReportFilterDto, {
      fromDate: '2026-01-01',
      toDate: '2026-01-01',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail with clear Arabic message when toDate is before fromDate', async () => {
    const dto = plainToInstance(ReportFilterDto, {
      fromDate: '2026-02-15',
      toDate: '2026-02-01',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const toDateError = errors.find((e) => e.property === 'toDate');
    expect(toDateError).toBeDefined();
    expect(toDateError?.constraints?.isGreaterThanOrEqualTo).toBe(
      'تاريخ النهاية يجب أن يكون بعد أو يطابق تاريخ البداية',
    );
  });

  it('should pass when dates are omitted (optional)', async () => {
    const dto = plainToInstance(ReportFilterDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when date string is invalid', async () => {
    const dto = plainToInstance(ReportFilterDto, {
      fromDate: 'invalid-date',
      toDate: '2026-01-01',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

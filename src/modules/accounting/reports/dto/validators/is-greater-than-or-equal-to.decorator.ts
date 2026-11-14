import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * ✅ يتحقق من أن قيمة الحقل أكبر من أو تساوي قيمة حقل مرجعي (مقارنة تواريخ).
 *
 * @example
 * class ReportFilterDto {
 *   fromDate?: string;
 *
 *   @IsGreaterThanOrEqualTo('fromDate', {
 *     message: 'تاريخ النهاية يجب أن يكون بعد أو يطابق تاريخ البداية',
 *   })
 *   toDate?: string;
 * }
 */
export function IsGreaterThanOrEqualTo(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isGreaterThanOrEqualTo',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];

          // تجاهل التحقق إذا كان أي من الطرفين غير موجود (للسماح بالحقول الاختيارية)
          if (value === undefined || value === null || value === '') return true;
          if (relatedValue === undefined || relatedValue === null || relatedValue === '') return true;

          const valueDate = new Date(value);
          const relatedDate = new Date(relatedValue);

          // حماية من التواريخ غير الصالحة
          if (isNaN(valueDate.getTime()) || isNaN(relatedDate.getTime())) {
            return false;
          }

          return valueDate >= relatedDate;
        },
        defaultMessage(args: ValidationArguments) {
          const ARABIC_LABELS: Record<string, string> = {
            fromDate: 'تاريخ البداية',
            toDate: 'تاريخ النهاية',
            asOfDate: 'تاريخ الرصيد حتى',
          };

          const propertyLabel = ARABIC_LABELS[args.property] || args.property;
          const relatedLabel = ARABIC_LABELS[args.constraints[0]] || args.constraints[0];

          return `${propertyLabel} يجب أن يكون بعد أو يطابق ${relatedLabel}`;
        },
      },
    });
  };
}

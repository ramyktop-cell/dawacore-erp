import React, { useState } from 'react';

export interface VirtualKeyboardProps {
  activeField: 'username' | 'password';
  setActiveField: (field: 'username' | 'password') => void;
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
  onClose?: () => void;
}

type KeyboardMode = 'en' | 'ar' | 'symbols' | 'numpad';

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  activeField,
  setActiveField,
  onKeyPress,
  onBackspace,
  onClear,
  onSubmit,
  onClose,
}) => {
  const [mode, setMode] = useState<KeyboardMode>('en');
  const [isCaps, setIsCaps] = useState(false);

  // تخطيطات المفاتيح
  const enRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '@', '_', '.'],
  ];

  const arRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
    ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
    ['ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'ـ'],
  ];

  const symbolRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
    ['-', '_', '=', '+', '[', ']', '{', '}', ';', ':'],
    ['"', "'", '<', '>', ',', '.', '?', '/', '\\', '|'],
  ];

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', '@'],
  ];

  const handleKeyClick = (key: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (mode === 'en') {
      onKeyPress(isCaps ? key.toUpperCase() : key.toLowerCase());
    } else {
      onKeyPress(key);
    }
  };

  return (
    <div
      className="mt-4 rounded-2xl border border-slate-200/90 bg-slate-50/95 p-2.5 sm:p-3 shadow-lg select-none touch-manipulation transition-all animate-fadeIn"
      dir="ltr"
    >
      {/* شريط التحكم العلوي: تحديد الحقل النشط + التبديل بين الأنماط */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 mb-2 border-b border-slate-200 text-xs">
        {/* اختيار الحقل المستهدف */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs" dir="rtl">
          <span className="text-[10px] font-bold text-slate-400 px-1">الكتابة في:</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setActiveField('username')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
              activeField === 'username'
                ? 'bg-[#582949] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>👤</span>
            <span>اسم المستخدم</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setActiveField('password')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
              activeField === 'password'
                ? 'bg-[#00A8A8] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>🔒</span>
            <span>كلمة المرور</span>
          </button>
        </div>

        {/* أزرار التبديل بين أنماط لوحة المفاتيح */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode('numpad')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              mode === 'numpad' ? 'bg-[#582949] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            🔢 أرقام فقط
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode('en')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              mode === 'en' ? 'bg-[#582949] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode('ar')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              mode === 'ar' ? 'bg-[#582949] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            عربي
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode('symbols')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              mode === 'symbols' ? 'bg-[#582949] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            !#$
          </button>
        </div>
      </div>

      {/* لوحة أرقام Numpad سريعة ومثالية لكلمات المرور وأجهزة اللمس اللوحية */}
      {mode === 'numpad' ? (
        <div className="grid grid-cols-4 gap-2 py-1">
          <div className="col-span-3 grid grid-cols-3 gap-2">
            {numpadKeys.flat().map((num) => (
              <button
                key={num}
                type="button"
                onMouseDown={(e) => handleKeyClick(num, e)}
                className="h-12 sm:h-14 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-lg sm:text-xl font-bold text-slate-800 shadow-2xs hover:bg-slate-100 active:scale-95 active:bg-slate-200 transition cursor-pointer"
              >
                {num}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onBackspace();
              }}
              className="flex-1 flex flex-col items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-sm shadow-2xs hover:bg-amber-100 active:scale-95 transition cursor-pointer"
              title="حذف حرف"
            >
              <span className="text-lg">⌫</span>
              <span className="text-[10px]">مسح</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onClear();
              }}
              className="h-11 flex items-center justify-center rounded-xl bg-red-50 border border-red-200 text-red-700 font-bold text-xs shadow-2xs hover:bg-red-100 active:scale-95 transition cursor-pointer"
              title="تفريغ الحقل بالكامل"
            >
              مسح الكل
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setActiveField(activeField === 'username' ? 'password' : 'username');
              }}
              className="h-11 flex items-center justify-center rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs shadow-2xs hover:bg-slate-200 active:scale-95 transition cursor-pointer"
              title="الانتقال للحقل التالي"
            >
              ⇥ التالي
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSubmit();
              }}
              className="h-14 flex items-center justify-center rounded-xl bg-[#00A8A8] text-white font-bold text-sm shadow-md hover:bg-[#009292] active:scale-95 transition cursor-pointer"
            >
              ✓ دخول
            </button>
          </div>
        </div>
      ) : (
        /* لوحة مفاتيح كاملة (Full QWERTY / Arabic / Symbols) */
        <div className="flex flex-col gap-1.5 py-0.5">
          {/* صفوف المفاتيح */}
          {(mode === 'ar' ? arRows : mode === 'symbols' ? symbolRows : enRows).map((row, rIdx) => (
            <div key={rIdx} className="flex w-full justify-center gap-1 sm:gap-1.5">
              {/* مفتاح Caps Lock في الصف الرابع لإنجليزي */}
              {mode === 'en' && rIdx === 3 && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsCaps(!isCaps);
                  }}
                  className={`w-[42px] shrink-0 sm:w-[46px] px-1 h-10 sm:h-11 flex items-center justify-center rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer ${
                    isCaps
                      ? 'bg-[#582949] text-white shadow-xs'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  ⇧ Caps
                </button>
              )}

              {row.map((char) => {
                const displayChar = mode === 'en' && isCaps ? char.toUpperCase() : char;
                return (
                  <button
                    key={char}
                    type="button"
                    onMouseDown={(e) => handleKeyClick(char, e)}
                    className="flex h-10 min-w-0 max-w-[46px] flex-1 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-sm font-semibold text-slate-800 shadow-2xs transition hover:bg-slate-100 active:scale-95 active:bg-slate-200 sm:h-11 sm:text-base cursor-pointer"
                  >
                    {displayChar}
                  </button>
                );
              })}

              {/* مفتاح Backspace في الصف الرابع */}
              {rIdx === 3 && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onBackspace();
                  }}
                  className="flex h-10 w-[42px] shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-amber-100/80 px-1 text-sm font-bold text-amber-900 shadow-2xs transition hover:bg-amber-200 active:scale-95 sm:h-11 sm:w-[48px] cursor-pointer"
                  title="حذف"
                >
                  ⌫
                </button>
              )}
            </div>
          ))}

          {/* الصف السفلي الخاص بالمسافة والإجراءات */}
          <div className="flex items-center justify-between gap-1.5 pt-1 w-full">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onClear();
              }}
              className="px-2.5 sm:px-3 h-10 sm:h-11 rounded-lg bg-red-50 border border-red-200 text-red-600 font-bold text-[11px] sm:text-xs hover:bg-red-100 active:scale-95 transition cursor-pointer"
            >
              مسح الكل
            </button>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setActiveField(activeField === 'username' ? 'password' : 'username');
              }}
              className="px-2.5 sm:px-3 h-10 sm:h-11 rounded-lg bg-slate-200 border border-slate-300 text-slate-700 font-bold text-[11px] sm:text-xs hover:bg-slate-300 active:scale-95 transition cursor-pointer"
            >
              ⇥ التالي
            </button>

            <button
              type="button"
              onMouseDown={(e) => handleKeyClick(' ', e)}
              className="flex-1 h-10 sm:h-11 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-500 shadow-2xs hover:bg-slate-100 active:bg-slate-200 active:scale-[0.98] transition cursor-pointer"
            >
              مسافة (Space)
            </button>

            <button
              type="button"
              onMouseDown={(e) => handleKeyClick('-', e)}
              className="w-9 h-10 sm:h-11 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition cursor-pointer"
            >
              -
            </button>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSubmit();
              }}
              className="px-4 sm:px-5 h-10 sm:h-11 rounded-lg bg-[#00A8A8] text-white font-bold text-xs sm:text-sm shadow-md hover:bg-[#009292] active:scale-95 transition cursor-pointer flex items-center gap-1"
            >
              <span>دخول</span>
              <span>✓</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

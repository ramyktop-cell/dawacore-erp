/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'IBM Plex Sans Arabic', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
    },
  },
  safelist: [
    // Financial (violet)
    'bg-violet-50', 'bg-violet-100', 'bg-violet-600',
    'text-violet-600', 'text-violet-700', 'border-violet-100',
    'border-violet-200', 'border-violet-300', 'border-violet-600',
    'hover:border-violet-300',
    
    // Sales (emerald)
    'bg-emerald-50', 'bg-emerald-100', 'bg-emerald-600',
    'text-emerald-600', 'text-emerald-700', 'border-emerald-100',
    'border-emerald-200', 'border-emerald-300', 'border-emerald-600',
    'hover:border-emerald-300',
    
    // Inventory (amber)
    'bg-amber-50', 'bg-amber-100', 'bg-amber-600',
    'text-amber-600', 'text-amber-700', 'border-amber-100',
    'border-amber-200', 'border-amber-300', 'border-amber-600',
    'hover:border-amber-300',
    
    // Partners (blue)
    'bg-blue-50', 'bg-blue-100', 'bg-blue-600',
    'text-blue-600', 'text-blue-700', 'border-blue-100',
    'border-blue-200', 'border-blue-300', 'border-blue-600',
    'hover:border-blue-300',
    
    // Operations (rose)
    'bg-rose-50', 'bg-rose-100', 'bg-rose-600',
    'text-rose-600', 'text-rose-700', 'border-rose-100',
    'border-rose-200', 'border-rose-300', 'border-rose-600',
    'hover:border-rose-300',

    // Risk / Overdue (orange)
    'bg-orange-50', 'bg-orange-100', 'bg-orange-600',
    'text-orange-600', 'text-orange-700', 'border-orange-100',
    'border-orange-200', 'border-orange-300', 'border-orange-600',
    'hover:border-orange-300',
    
    // Neutral (slate)
    'bg-slate-50', 'bg-slate-100', 'bg-slate-600',
    'text-slate-600', 'text-slate-700', 'border-slate-100',
    'border-slate-200', 'border-slate-300', 'border-slate-600',
    'hover:border-slate-300',
  ],
  plugins: [],
};

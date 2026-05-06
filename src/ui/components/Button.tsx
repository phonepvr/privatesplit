import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 disabled:opacity-60',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:opacity-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-slate-300',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export function Button({ variant = 'primary', fullWidth, className = '', ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-400 ${
        VARIANTS[variant]
      } ${fullWidth ? 'w-full' : ''} ${className}`}
    />
  );
}

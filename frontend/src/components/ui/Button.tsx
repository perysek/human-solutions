import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  small?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'refined-btn-primary',
  secondary: 'refined-btn-secondary',
  ghost: 'refined-btn-ghost',
  danger: 'refined-btn-danger',
  brand: 'refined-btn-brand',
};

/** Flat/refined button — the canonical variants from input.css §Buttons. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', small = false, className = '', type = 'button', ...rest },
  ref,
) {
  const classes = [VARIANT_CLASS[variant], 'btn-press', small ? 'refined-btn-sm' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button ref={ref} type={type} className={classes} {...rest} />;
});

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id ?? label?.replace(/\s/g, '-').toLowerCase();
    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-sm font-medium text-ink-70">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-base',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1',
            error && 'border-danger',
            className,
          )}
          {...props}
        />
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

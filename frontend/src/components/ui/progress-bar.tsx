import clsx from 'clsx';

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  barClassName?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export function ProgressBar({ value, className, barClassName, size = 'md' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={clsx('w-full overflow-hidden rounded-full bg-surface-hover', SIZE_CLASSES[size], className)}>
      <div
        className={clsx('h-full animate-fill-bar rounded-full bg-primary transition-[width] duration-700 ease-out', barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

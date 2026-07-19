import clsx from 'clsx';

interface PillOption {
  value: string;
  label: string;
}

interface PillSelectProps {
  options: PillOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

/** Multi-select rendered as toggleable pills - used for "associated skills" pickers. */
export function PillSelect({ options, value, onChange, className }: PillSelectProps) {
  function toggle(optionValue: string) {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  }

  return (
    <div className={clsx('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={clsx(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selected
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border bg-transparent text-muted hover:border-primary/40 hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

import clsx from 'clsx';

const STEP_LABELS = ['Welcome', 'Skills', 'Goal', 'Activities'];

interface StepDotsProps {
  current: number;
}

/** Small step-progress indicator shown at the top of the onboarding card. */
export function StepDots({ current }: StepDotsProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-center gap-2">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1;
          const active = stepNumber === current;
          const complete = stepNumber < current;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                aria-label={`Step ${stepNumber}: ${label}`}
                aria-current={active ? 'step' : undefined}
                className={clsx(
                  'h-2.5 rounded-full transition-all',
                  active ? 'w-6 bg-primary' : complete ? 'w-2.5 bg-primary/50' : 'w-2.5 bg-border',
                )}
              />
              {stepNumber < STEP_LABELS.length && <div className="h-px w-4 bg-border" />}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs font-medium uppercase tracking-wide text-muted">
        Step {current} of {STEP_LABELS.length} · {STEP_LABELS[current - 1]}
      </p>
    </div>
  );
}

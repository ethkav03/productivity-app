import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Sparkles className="h-7 w-7" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">Your real life is the game</h1>
        <p className="text-sm leading-relaxed text-muted">
          Your goals become quests and habits. Completing them earns XP, levels up your
          character, and grows the skills behind who you want to become.
        </p>
      </div>

      <Button type="button" size="lg" className="w-full" onClick={onNext}>
        Begin Your Journey
      </Button>
    </div>
  );
}

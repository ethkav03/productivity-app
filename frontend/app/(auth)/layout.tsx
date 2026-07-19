import { Swords } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Swords className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold tracking-tight text-foreground">Life RPG</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Life RPG',
  description: 'Your real life is the game. Turn goals, quests and habits into character progression.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try { var stored = localStorage.getItem('liferpg.theme'); var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; if (dark) document.documentElement.classList.add('dark'); } catch (e) {}",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

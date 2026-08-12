export const metadata = {
  title: 'School Information System',
  description: 'SIS',
};

import '../src/index.css';
import { Toaster } from '../src/components/ui/sonner';
import { SupportButton } from '../src/components/SupportButton';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full">
        {children}
        {/* Moved off sonner's bottom-right default, which is now the support
            button's corner. Without this the two overlap on every toast. */}
        <Toaster position="top-right" />
        {/* A client component: it needs usePathname to know which page the user
            is on, both to hide itself on the two screens that carry their own
            support block and to tell support where the user was. This layout
            stays a server component. */}
        <SupportButton />
      </body>
    </html>
  );
}

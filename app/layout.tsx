export const metadata = {
  title: 'School Information System',
  description: 'SIS',
};

import '../src/index.css';
import { Toaster } from '../src/components/ui/sonner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

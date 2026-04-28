
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: 'Sergio Oliveira PT',
  description: 'Manage students, track workouts, and build progress with Sergio Oliveira PT.',
  icons: {
    icon: '/sergio-oliveira-logo.png',
    apple: '/sergio-oliveira-logo.png',
    shortcut: '/sergio-oliveira-logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <FirebaseClientProvider>
            <I18nProvider>
              {children}
              <Toaster />
            </I18nProvider>
          </FirebaseClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
// Leaflet base styles first so the app's map overrides (styles/map.css) win the cascade.
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/constants/theme";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  // 300 is the overview page's display weight
  weight: ["300", "400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  // no title here: each view renders its own <title>, and a metadata one would win over it
  description:
    "AI-assisted bushfire severity classification and dispatch coordination.",
};

// viewport-fit=cover lets the phone tab bar pad itself clear of the home indicator (env(safe-area-inset-*)).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}

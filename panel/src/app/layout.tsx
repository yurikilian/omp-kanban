import type { Metadata } from "next";
import "./globals.css";
import "../styles/typography.css";
import { LOCAL_FONT_ASSETS } from "./fonts";

export const metadata: Metadata = {
  title: "OMP Panel",
  description: "Local operations and inspection interface for Oh My Pi sessions, agents, audits and configurations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {LOCAL_FONT_ASSETS.map((href) => (
          <link
            key={href}
            rel="preload"
            href={href}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}

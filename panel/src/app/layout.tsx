import type { Metadata } from "next";
import "./globals.css";
import "../styles/typography.css";
import { codeFont, uiFont } from "./fonts";

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
    <html lang="en" className={`${uiFont.variable} ${codeFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}

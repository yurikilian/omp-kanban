import localFont from "next/font/local";

export const uiFont = localFont({
  src: "../../public/fonts/geist-sans-variable.woff2",
  variable: "--font-ui",
  weight: "100 900",
});

export const codeFont = localFont({
  src: "../../public/fonts/geist-mono-variable.woff2",
  variable: "--font-code",
  weight: "100 900",
});

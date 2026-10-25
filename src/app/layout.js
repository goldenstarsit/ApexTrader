import "./globals.css";

export const metadata = {
  title: "Apex Trader",
  description: "A modular trading platform with configurable strategies and risk management.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import './globals.css';

export const metadata = { title: 'Bridge' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

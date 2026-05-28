import './globals.css';

export const metadata = { title: 'Rehearsal' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Medical AI Assistant",
  description: "AI assistant for doctors",
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
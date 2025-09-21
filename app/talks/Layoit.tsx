export default function TalksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Этот layout будет использоваться ТОЛЬКО для страницы /talks
  // Он не включает Header и Footer из основного layout
  return (
    <html lang="ru">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
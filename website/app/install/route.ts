const INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/north-brook/git-jazz/main/scripts/install.sh";

export async function GET(): Promise<Response> {
  const response = await fetch(INSTALL_SCRIPT_URL, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    return new Response("Failed to fetch install script", { status: 502 });
  }

  const script = await response.text();

  return new Response(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

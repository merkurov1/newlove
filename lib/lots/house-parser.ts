import { NextResponse } from "next/server";
import { ParserRegistry } from "@/lib/lots/registry";

function isBlockedHtml(html: string): boolean {
  if (!html || html.length < 500) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes("just a moment...") ||
    lower.includes("enable javascript and cookies to continue") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("challenge-running") ||
    lower.includes("attention required! | cloudflare")
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const apiKey = process.env.SCRAPINGANT_API_KEY;
    let html = "";

    try {
      const directRes = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (directRes.ok) {
        const directHtml = await directRes.text();
        if (!isBlockedHtml(directHtml)) {
          html = directHtml;
        }
      }
    } catch {
      console.warn("[Parser] Direct HTML fetch failed, falling back to ScrapingAnt");
    }

    if (!html && apiKey) {
      try {
        const saEndpoint = new URL("https://api.scrapingant.com/v2/general");
        saEndpoint.searchParams.set("url", url);
        saEndpoint.searchParams.set("browser", "true");

        const saRes = await fetch(saEndpoint, {
          headers: { "x-api-key": apiKey },
          signal: AbortSignal.timeout(25_000),
        });

        if (saRes.ok) {
          html = await saRes.text();
        }
      } catch (err) {
        console.warn("[Parser] ScrapingAnt request failed:", err);
      }
    }

    if (!html || isBlockedHtml(html)) {
      return NextResponse.json(
        { error: "Failed to retrieve unblocked HTML from the target URL" },
        { status: 422 }
      );
    }

    const registry = new ParserRegistry();
    const parsed = registry.parse(html, url);

    if (!parsed) {
      return NextResponse.json(
        {
          error: "Unsupported auction house",
          details: "No parser matched this auction house",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ...parsed,
      auction_house: parsed.auctionHouse,
      title: parsed.title,
      artist: parsed.artist,
      lot_number: parsed.lotNumber,
      image_url: parsed.imageUrl,
      confidence: parsed.confidence ?? 0.5,
      source: parsed.source ?? "house-parser",
      extracted: parsed,
    });
  } catch (error: any) {
    console.error("[API parse-url] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to parse lot" },
      { status: 500 }
    );
  }
}

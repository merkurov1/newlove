const jsdom = require("jsdom");
const { JSDOM } = jsdom;

async function test() {
  const url = "https://www.christies.com/en/lot/lot-6453838"; // Example URL
  console.log("Testing URL:", url);

  const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    console.log("Fetching...");
    const [jinaResult, rawResult] = await Promise.allSettled([
      fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
        headers: { 'X-Return-Format': 'markdown', 'X-With-Images-Summary': 'true', ...headers }
      }),
      fetch(url, { headers })
    ]);

    console.log("Jina status:", jinaResult.status);
    console.log("Raw status:", rawResult.status);

    const markdown = jinaResult.status === 'fulfilled' && jinaResult.value.ok ? await jinaResult.value.text() : '';
    const html = rawResult.status === 'fulfilled' && rawResult.value.ok ? await rawResult.value.text() : '';

    console.log("Markdown length:", markdown.length);
    console.log("HTML length:", html.length);

    if (!markdown && !html) {
      console.error("Both failed");
      return;
    }

    console.log("Creating JSDOM...");
    const dom = new JSDOM(html || `<html><body>${markdown}</body></html>`);
    console.log("JSDOM created.");
    
    const title = dom.window.document.title;
    console.log("Page title:", title);

  } catch (e) {
    console.error("Error:", e);
  }
}

test();

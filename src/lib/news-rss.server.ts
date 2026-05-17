// Server-only RSS fetching + parsing. Worker-runtime safe.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

export type RawItem = {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  image?: string | null;
  guid?: string | null;
};

async function fetchWithTimeout(url: string, ms = 10_000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 QuantaTerminalBot/1.0 (+news-aggregator)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
      },
      redirect: "follow",
    });
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(s?: string | null): string {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImage(item: any): string | null {
  if (item?.enclosure?.["@_url"]) return String(item.enclosure["@_url"]);
  if (item?.["media:content"]?.["@_url"]) return String(item["media:content"]["@_url"]);
  if (item?.["media:thumbnail"]?.["@_url"]) return String(item["media:thumbnail"]["@_url"]);
  const desc = String(item?.description ?? item?.summary ?? "");
  const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

export async function fetchRss(url: string): Promise<RawItem[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchWithTimeout(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      const xml = parser.parse(text);

      // RSS 2.0
      const rssItems = xml?.rss?.channel?.item;
      if (rssItems) {
        return asArray<any>(rssItems).map((it) => ({
          title: stripHtml(typeof it.title === "object" ? it.title["#text"] : it.title),
          link: typeof it.link === "object" ? it.link["@_href"] ?? it.link["#text"] : it.link,
          description: stripHtml(it.description ?? it["content:encoded"] ?? ""),
          pubDate: it.pubDate ?? it["dc:date"] ?? null,
          image: extractImage(it),
          guid: typeof it.guid === "object" ? it.guid["#text"] : it.guid ?? it.link,
        })).filter((x) => x.title && x.link);
      }

      // Atom
      const atomEntries = xml?.feed?.entry;
      if (atomEntries) {
        return asArray<any>(atomEntries).map((e) => {
          const link = Array.isArray(e.link) ? e.link[0]?.["@_href"] : (e.link?.["@_href"] ?? e.link);
          return {
            title: stripHtml(typeof e.title === "object" ? e.title["#text"] : e.title),
            link: typeof link === "string" ? link : "",
            description: stripHtml(e.summary?.["#text"] ?? e.summary ?? e.content?.["#text"] ?? e.content ?? ""),
            pubDate: e.published ?? e.updated ?? null,
            image: extractImage(e),
            guid: e.id ?? link,
          };
        }).filter((x) => x.title && x.link);
      }

      return [];
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("RSS fetch failed");
}

export async function fetchRssWithFallback(
  primary: string,
  fallbacks: string[] = [],
): Promise<{ url: string; items: RawItem[] }> {
  const urls = [primary, ...fallbacks];
  let lastErr: unknown;
  for (const u of urls) {
    try {
      const items = await fetchRss(u);
      if (items.length > 0) return { url: u, items };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All sources empty");
}

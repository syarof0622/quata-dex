const BASE_URL = "https://quata-dex.lovable.app";

export function seoHead(opts: {
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
}) {
  const url = `${BASE_URL}${opts.path}`;
  const meta: Array<Record<string, string>> = [
    { title: opts.title },
    { name: "description", content: opts.description },
    { property: "og:title", content: opts.title },
    { property: "og:description", content: opts.description },
    { property: "og:url", content: url },
    { name: "twitter:title", content: opts.title },
    { name: "twitter:description", content: opts.description },
  ];
  if (opts.noindex) meta.push({ name: "robots", content: "noindex, nofollow" });
  return {
    meta,
    links: [{ rel: "canonical", href: url }],
  };
}

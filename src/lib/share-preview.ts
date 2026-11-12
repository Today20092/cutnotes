export type SharePreview = { title: string; description: string; image: string };

export function shareMeta(preview: SharePreview | null | undefined, fallback: string) {
  const title = preview?.title ?? fallback;
  const description = preview?.description ?? "Ask the person who sent this link for a new one.";
  return [
    { title: `${title} · Cutnotes` },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Cutnotes" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    ...(preview?.image
      ? [
          { property: "og:image", content: preview.image },
          { name: "twitter:image", content: preview.image },
        ]
      : []),
    // These URLs are credentials; never send them as referrers or index them.
    { name: "referrer", content: "no-referrer" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

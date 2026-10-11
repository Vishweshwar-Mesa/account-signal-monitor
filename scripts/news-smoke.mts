import { fetchFeed, googleNewsUrl, resolveGoogleNewsUrl, fetchArticle } from "../src/lib/pipeline/news";
const items = await fetchFeed(googleNewsUrl('"Lemon Tree Hotels"'));
console.log(items.length, items.slice(0, 3).map((i) => [i.title, i.source_name, i.published_at?.toISOString()]));
for (const it of items.slice(0, 3)) {
  const u = await resolveGoogleNewsUrl(it.link);
  console.log("resolved:", u);
  if (u) { const a = await fetchArticle(u); console.log("blocked" in a ? a : [a.title, a.text.length, a.published_at]); }
}

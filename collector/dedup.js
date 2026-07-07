/**
 * タイトルを重複判定用に正規化する。
 * 同じ記事が別メディア・別URL（Yahoo!ニュース転載、dメニュー転載など）で
 * 配信されるケースを、タイトルの一致で検出するために使う。
 */
export function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    // Google News が付ける「 - メディア名」の除去
    .replace(/\s[-–|]\s[^-–|]+$/, '')
    // 記号・空白の除去（転載時の全角半角ゆれを吸収）
    .replace(/[\s、。・：:；;！!？?「」『』【】\[\]()（）<>《》"'“”‘’…‥~〜･•]+/g, '')
    .slice(0, 60);
}

/**
 * タイトルの重複を除去する（先に来た記事を優先）。
 * @param {Array} articles
 * @returns {Array}
 */
export function dedupeByTitle(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = normalizeTitle(article.title);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

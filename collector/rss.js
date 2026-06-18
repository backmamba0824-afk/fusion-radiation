import RSSParser from 'rss-parser';

const parser = new RSSParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'FusionRadiation/1.0 (RSS Aggregator)',
  },
});

/**
 * 指定されたRSSフィードから記事を収集
 * @param {Array} feeds - { name, url, category } の配列
 * @param {number} hoursBack - 何時間前までの記事を取得するか（デフォルト: 24時間）
 * @returns {Array} 収集した記事の配列
 */
export async function collectRSS(feeds, hoursBack = 24) {
  const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const allArticles = [];
  const failedFeeds = [];

  for (const feed of feeds) {
    try {
      console.log(`📡 RSS取得中: ${feed.name}`);
      const parsed = await parser.parseURL(feed.url);

      const articles = (parsed.items || [])
        .filter((item) => {
          const pubDate = new Date(item.pubDate || item.isoDate || 0);
          return pubDate >= cutoffDate;
        })
        .map((item) => ({
          sourceName: feed.name,
          title: item.title || '無題',
          url: item.link || item.guid || '',
          content: stripHtml(item.contentSnippet || item.content || item.summary || ''),
          category: feed.category,
          author: item.creator || item.author || null,
          publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
          thumbnail: extractThumbnail(item),
        }))
        .filter((a) => a.url);

      allArticles.push(...articles);
      console.log(`  ✅ ${articles.length}件取得`);
    } catch (error) {
      console.error(`  ❌ RSS取得エラー (${feed.name}): ${error.message}`);
      failedFeeds.push(feed.name);
    }
  }

  if (failedFeeds.length > 0) {
    console.warn(`  ⚠️ 取得失敗したフィード (${failedFeeds.length}件): ${failedFeeds.join(', ')}`);
  }

  console.log(`📡 RSS合計: ${allArticles.length}件`);
  return allArticles;
}

/**
 * HTMLタグを除去
 */
function stripHtml(text) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

/**
 * 記事からサムネイルURLを抽出
 */
function extractThumbnail(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  if (item['media:thumbnail']?.$.url) return item['media:thumbnail'].$.url;
  if (item['media:content']?.$.url) return item['media:content'].$.url;

  const imgMatch = (item.content || '').match(/<img[^>]+src="([^"]+)"/);
  if (imgMatch) return imgMatch[1];

  return null;
}

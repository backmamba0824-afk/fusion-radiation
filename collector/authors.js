import RSSParser from 'rss-parser';

const parser = new RSSParser({
  timeout: 12000,
  headers: { 'User-Agent': 'FusionRadiation/2.0 (Author Watcher)' },
});

/**
 * note.com / Zenn の特定著者 RSS から新着記事を収集
 * @param {Array} authors - { name, platform, username } の配列
 * @param {number} hoursBack
 * @returns {Array}
 */
export async function collectAuthors(authors, hoursBack = 24) {
  if (!authors || authors.length === 0) return [];

  const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const allArticles = [];
  const failedAuthors = [];

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  👤 著者ウォッチ RSS 収集');
  console.log('═══════════════════════════════════════');
  console.log('');

  for (const author of authors) {
    const feedUrl = buildFeedUrl(author);
    if (!feedUrl) {
      console.warn(`  ⚠️ 未対応のプラットフォーム: ${author.platform}`);
      continue;
    }

    try {
      console.log(`👤 著者取得中: ${author.name} (${author.platform})`);
      const parsed = await parser.parseURL(feedUrl);

      const articles = (parsed.items || [])
        .filter(item => {
          const pubDate = new Date(item.pubDate || item.isoDate || 0);
          return pubDate >= cutoffDate;
        })
        .map(item => ({
          sourceName: `${author.platform === 'note' ? 'note' : 'Zenn'} - ${author.name}`,
          title: item.title || '無題',
          url: item.link || item.guid || '',
          content: stripHtml(item.contentSnippet || item.content || item.summary || ''),
          category: '著者ウォッチ',
          author: author.name,
          publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
          thumbnail: extractThumbnail(item),
        }))
        .filter(a => a.url);

      allArticles.push(...articles);
      console.log(`  ✅ ${articles.length}件取得`);
    } catch (err) {
      console.error(`  ❌ 著者取得エラー (${author.name}): ${err.message}`);
      failedAuthors.push(author.name);
    }
  }

  if (failedAuthors.length > 0) {
    console.warn(`  ⚠️ 取得失敗: ${failedAuthors.join(', ')}`);
  }

  console.log(`👤 著者ウォッチ合計: ${allArticles.length}件`);
  return allArticles;
}

function buildFeedUrl({ platform, username }) {
  if (platform === 'note') return `https://note.com/${username}/rss`;
  if (platform === 'zenn') return `https://zenn.dev/${username}/feed`;
  return null;
}

function stripHtml(text) {
  if (!text) return '';
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

function extractThumbnail(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  if (item['media:thumbnail']?.$.url) return item['media:thumbnail'].$.url;
  const imgMatch = (item.content || '').match(/<img[^>]+src="([^"]+)"/);
  return imgMatch ? imgMatch[1] : null;
}

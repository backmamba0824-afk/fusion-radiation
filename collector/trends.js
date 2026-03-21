import RSSParser from 'rss-parser';

const parser = new RSSParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'FusionRadiation/1.0 (Trend Aggregator)',
  },
});

/**
 * HTMLタグを除去（サマリー用）
 */
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
    .slice(0, 1000);
}

/**
 * 急上昇・トレンド記事を収集
 * @param {Array} categories - 現在有効なカテゴリ名の配列 (例: ['AI', '3DCG'])
 * @param {number} hoursBack - 何時間前までの記事を取得するか
 * @returns {Array} 収集した記事の配列
 */
export async function collectTrends(categories, hoursBack = 24) {
  const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const allArticles = [];

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  📈 急上昇トレンド記事の収集');
  console.log('═══════════════════════════════════════');
  console.log('');

  // 1. はてなブックマーク ホットエントリー (IT・テクノロジー)
  try {
    console.log(`📈 トレンド取得中: はてなブックマーク (IT・テクノロジー)`);
    const parsed = await parser.parseURL('https://b.hatena.ne.jp/hotentry/it.rss');

    const articles = (parsed.items || [])
      .filter((item) => {
        const pubDate = new Date(item.pubDate || item.isoDate || 0);
        return pubDate >= cutoffDate;
      })
      .map((item) => ({
        sourceName: '⭐(急上昇) はてブ',
        title: item.title,
        url: item.link,
        content: stripHtml(item.contentSnippet || item.content),
        category: 'その他', // AI分類モジュールで後から再分類される
        author: item.creator || null,
        publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
        thumbnail: null,
      }))
      .slice(0, 10); // 上位10件に制限

    allArticles.push(...articles);
    console.log(`  ✅ ${articles.length}件取得`);
  } catch (error) {
    console.error(`  ❌ トレンド取得エラー (はてブ): ${error.message}`);
  }

  // 2. Google News 検索 (カテゴリごとに検索)
  // 除外するカテゴリ
  const skipCategories = ['すべて', 'その他'];
  const searchCategories = categories.filter(c => !skipCategories.includes(c));

  for (const cat of searchCategories) {
    try {
      console.log(`📈 トレンド取得中: Google News [${cat}]`);
      const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cat)}&hl=ja&gl=JP&ceid=JP:ja`;
      const parsed = await parser.parseURL(searchUrl);

      const articles = (parsed.items || [])
        .filter((item) => {
          const pubDate = new Date(item.pubDate || item.isoDate || 0);
          return pubDate >= cutoffDate;
        })
        .map((item) => {
          // Google Newsの場合、ソース名はタイトルや末尾に含まれることが多い
          const sourceMatch = item.title?.match(/ - (.+)$/);
          const originalSource = sourceMatch ? sourceMatch[1] : 'Google News';
          const cleanTitle = item.title?.replace(/ - .+$/, '') || '無題';

          return {
            sourceName: `⭐(急上昇) ${originalSource}`,
            title: cleanTitle,
            url: item.link,
            content: stripHtml(item.contentSnippet || item.content),
            category: cat, // 検索キーワードと同じカテゴリとしてとりあえず設定
            author: originalSource,
            publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
            thumbnail: null,
          };
        })
        .slice(0, 5); // 検索ごと上位5件に制限

      allArticles.push(...articles);
      console.log(`  ✅ ${articles.length}件取得`);
    } catch (error) {
      console.error(`  ❌ トレンド取得エラー (Google News[${cat}]): ${error.message}`);
    }

    // Google制限対策の少し待機
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`📈 トレンド合計: ${allArticles.length}件`);
  return allArticles;
}

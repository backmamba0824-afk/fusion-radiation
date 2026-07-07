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
 * Google News の Base64 エンコード URL を安全にデコード
 */
function safeDecodeGoogleNewsUrl(url) {
  if (!url || !url.includes('news.google.com/rss/articles/')) return url;
  try {
    const match = url.match(/articles\/([^?&]+)/);
    if (!match) return url;
    const id = match[1];
    const padded = id + '='.repeat((4 - id.length % 4) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const urlMatch = decoded.match(/(https?:\/\/[^\s"'<>]+)/);
    return urlMatch ? urlMatch[1] : url;
  } catch {
    return url;
  }
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

  // カテゴリ名そのままでは検索にヒットしにくいものは、実際のニュースキーワードに置き換える
  const CATEGORY_QUERIES = {
    '家計・NISA': '(NISA OR 家計 OR 資産形成 OR 節約) when:1d',
    '住宅情報': '(住宅ローン OR 注文住宅 OR マイホーム OR 住宅購入) when:1d',
  };

  // 話題のキーワードを追加検索（カテゴリ外の固定キーワード）
  const hotKeywords = [
    { keyword: 'Unreal Engine 6', category: 'ゲーム開発' },
    { keyword: 'UE6', category: 'ゲーム開発' },
  ];
  for (const { keyword, category } of hotKeywords) {
    try {
      console.log(`📈 ホットキーワード取得中: ${keyword}`);
      const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ja&gl=JP&ceid=JP:ja`;
      const parsed = await parser.parseURL(searchUrl);
      const articles = (parsed.items || [])
        .filter(item => new Date(item.pubDate || item.isoDate || 0) >= cutoffDate)
        .map(item => {
          const sourceMatch = item.title?.match(/ - (.+)$/);
          const originalSource = sourceMatch ? sourceMatch[1] : 'Google News';
          return {
            sourceName: `⭐(急上昇) ${originalSource}`,
            title: item.title?.replace(/ - .+$/, '') || '無題',
            url: safeDecodeGoogleNewsUrl(item.link),
            content: stripHtml(item.contentSnippet || item.content),
            category,
            author: originalSource,
            publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
            thumbnail: null,
          };
        })
        .slice(0, 5);
      allArticles.push(...articles);
      console.log(`  ✅ ${articles.length}件取得`);
    } catch (error) {
      console.error(`  ❌ ホットキーワード取得エラー (${keyword}): ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  for (const cat of searchCategories) {
    try {
      const query = CATEGORY_QUERIES[cat] || cat;
      console.log(`📈 トレンド取得中: Google News [${cat}]`);
      const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
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
            url: safeDecodeGoogleNewsUrl(item.link),
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

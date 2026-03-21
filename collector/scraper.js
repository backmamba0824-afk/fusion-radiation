import { load } from 'cheerio';

/**
 * 特定サイトの記事をスクレイピング
 * @param {Array} sites - { name, url, category, selectors } の配列
 * @param {number} hoursBack - 何時間前までの記事を取得するか
 * @returns {Array} 収集した記事の配列
 */
export async function collectScrape(sites, hoursBack = 24) {
  if (!sites || sites.length === 0) {
    console.log('🔍 スクレイピング対象サイトなし - スキップ');
    return [];
  }

  const allArticles = [];

  for (const site of sites) {
    try {
      console.log(`🔍 スクレイピング中: ${site.name}`);

      const response = await fetch(site.url, {
        headers: {
          'User-Agent': 'FusionRadiation/1.0 (Information Aggregator)',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const $ = load(html);

      const selectors = site.selectors || {
        article: 'article',
        title: 'h2 a, h3 a',
        link: 'h2 a, h3 a',
        summary: 'p',
      };

      const articles = [];
      $(selectors.article).each((i, el) => {
        if (i >= 10) return false; // 最大10件

        const titleEl = $(el).find(selectors.title).first();
        const title = titleEl.text().trim();
        let url = titleEl.attr('href') || $(el).find(selectors.link).first().attr('href') || '';

        // 相対URLを絶対URLに変換
        if (url && !url.startsWith('http')) {
          const baseUrl = new URL(site.url);
          url = new URL(url, baseUrl.origin).toString();
        }

        const summary = $(el).find(selectors.summary).first().text().trim().slice(0, 500);

        if (title && url) {
          articles.push({
            sourceName: site.name,
            title,
            url,
            content: summary,
            category: site.category,
            author: null,
            publishedAt: new Date().toISOString(),
            thumbnail: null,
          });
        }
      });

      allArticles.push(...articles);
      console.log(`  ✅ ${articles.length}件取得`);
    } catch (error) {
      console.error(`  ❌ スクレイピングエラー (${site.name}): ${error.message}`);
    }
  }

  console.log(`🔍 スクレイピング合計: ${allArticles.length}件`);
  return allArticles;
}

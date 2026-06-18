import { collectRSS } from './rss.js';
import { collectYouTube } from './youtube.js';
import { collectScrape } from './scraper.js';
import { collectTrends } from './trends.js';
import { collectAuthors } from './authors.js';
import supabase from '../db/supabase.js';

const DEFAULT_CATEGORIES = [
  '3DCG', 'AI', 'ゲーム開発', 'デザイン',
  'デジタルマーケティング', '映像制作', '子育て', '家計・NISA', '住宅情報'
];

/**
 * DBからすべてのアクティブな情報ソースを取得
 */
async function getActiveSources() {
  if (!supabase) {
    console.error('❌ Supabaseクライアントが未初期化です。');
    return { rss: [], youtube: [], scrape: [] };
  }

  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('❌ ソース取得エラー:', error.message);
    return { rss: [], youtube: [], scrape: [] };
  }

  const sources = data || [];
  
  return {
    rss: sources.filter(s => s.type === 'rss').map(s => ({
      name: s.name,
      url: s.url,
      category: s.category
    })),
    youtube: sources.filter(s => s.type === 'youtube').map(s => ({
      name: s.name,
      channelId: s.url,
      category: s.category
    })),
    scrape: sources.filter(s => s.type === 'scrape').map(s => ({
      name: s.name,
      url: s.url,
      category: s.category
    })),
    authors: sources.filter(s => s.type === 'author').map(s => ({
      name: s.name,
      platform: s.category === 'Zenn' ? 'zenn' : 'note',
      username: s.url,
    }))
  };
}

/**
 * 全ソースから情報を収集
 * @param {number} hoursBack - 何時間前までの記事を取得するか
 * @returns {Array} 収集した全記事
 */
export async function collectAll(hoursBack = 24) {
  // DBからソースを取得
  const config = await getActiveSources();

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  📡 情報収集を開始 (Database Sources)');
  console.log('═══════════════════════════════════════');
  console.log('');

  // DBから動的に取得したカテゴリ + デフォルトカテゴリをマージ
  const activeCategories = [...new Set([
    ...DEFAULT_CATEGORIES,
    ...(config.rss || []).map(s => s.category),
    ...(config.youtube || []).map(s => s.category),
    ...(config.scrape || []).map(s => s.category)
  ])];

  // 並列で全ソースから収集
  const [rssArticles, youtubeArticles, scrapeArticles, trendArticles, authorArticles] = await Promise.all([
    collectRSS(config.rss || [], hoursBack),
    collectYouTube(config.youtube || [], hoursBack),
    collectScrape(config.scrape || [], hoursBack),
    collectTrends(activeCategories, hoursBack),
    collectAuthors(config.authors || [], hoursBack),
  ]);

  const allArticles = [...rssArticles, ...youtubeArticles, ...scrapeArticles, ...trendArticles, ...authorArticles];

  // URL重複除去
  const seen = new Set();
  const uniqueArticles = allArticles.filter((article) => {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });

  console.log('');
  console.log(`📊 収集完了: 合計${uniqueArticles.length}件（重複除去後）`);
  console.log(`   RSS: ${rssArticles.length}件, YouTube: ${youtubeArticles.length}件, スクレイピング: ${scrapeArticles.length}件, 急上昇: ${trendArticles.length}件, 著者: ${authorArticles.length}件`);
  console.log('');

  return uniqueArticles;
}

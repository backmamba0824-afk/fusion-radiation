import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ SUPABASE_URL / SUPABASE_ANON_KEY が設定されていません');
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * 記事をデータベースに保存（重複URLはスキップ）
 */
export async function saveArticles(articles) {
  if (!supabase) {
    console.log('📦 DB未接続: 記事の保存をスキップ');
    return { saved: 0, skipped: articles.length };
  }

  let saved = 0;
  let skipped = 0;

  for (const article of articles) {
    const { error } = await supabase
      .from('articles')
      .upsert(
        {
          source_name: article.sourceName,
          title: article.title,
          url: article.url,
          original_content: article.content || '',
          summary: article.summary || '',
          category: article.category,
          importance: article.importance || 3,
          thumbnail_url: article.thumbnail || null,
          author: article.author || null,
          published_at: article.publishedAt || new Date().toISOString(),
          is_notified: false,
        },
        { onConflict: 'url', ignoreDuplicates: true }
      );

    if (error) {
      console.error(`❌ 保存エラー: ${article.title}`, error.message);
      skipped++;
    } else {
      saved++;
    }
  }

  console.log(`📦 DB保存: ${saved}件保存, ${skipped}件スキップ`);
  return { saved, skipped };
}

/**
 * 未通知の記事を取得
 */
export async function getUnnotifiedArticles() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('is_notified', false)
    .order('importance', { ascending: false })
    .order('published_at', { ascending: false });

  if (error) {
    console.error('❌ 記事取得エラー:', error.message);
    return [];
  }

  return data || [];
}

/**
 * 記事を通知済みに更新
 */
export async function markAsNotified(articleIds) {
  if (!supabase || articleIds.length === 0) return;

  const { error } = await supabase
    .from('articles')
    .update({ is_notified: true })
    .in('id', articleIds);

  if (error) {
    console.error('❌ 通知済み更新エラー:', error.message);
  }
}

/**
 * ダイジェスト送信ログを記録
 */
export async function logDigest(articleCount, categories, status, errorMessage = null) {
  if (!supabase) return;

  const { error } = await supabase
    .from('digest_logs')
    .insert({
      article_count: articleCount,
      categories: categories,
      status: status,
      error_message: errorMessage,
    });

  if (error) {
    console.error('❌ ダイジェストログ保存エラー:', error.message);
  }
}

/**
 * 記事一覧を取得（Webダッシュボード用）
 */
export async function getArticles({ category, limit = 50, offset = 0, search } = {}) {
  if (!supabase) return [];

  let query = supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) {
    query = query.eq('category', category);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('❌ 記事取得エラー:', error.message);
    return { articles: [], total: 0 };
  }

  return { articles: data || [], total: count || 0 };
}

export default supabase;

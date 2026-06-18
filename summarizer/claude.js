import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';

const VALID_CATEGORIES = [
  '3DCG', 'AI', 'ゲーム開発', 'デザイン',
  'デジタルマーケティング', '映像制作', '子育て', '家計・NISA', '住宅情報', '著者ウォッチ'
];

const BATCH_MODEL = 'claude-haiku-4-5-20251001';
const YOUTUBE_MODEL = 'claude-sonnet-4-6';

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * 指数バックオフ付きリトライ
 */
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const wait = 1000 * Math.pow(2, i);
      console.warn(`  ⚠️ リトライ ${i + 1}/${maxRetries - 1} (${wait}ms 後): ${err.message}`);
      await sleep(wait);
    }
  }
}

/**
 * 全記事を AI で要約・分類
 */
export async function summarizeArticles(articles) {
  const ai = getClient();
  if (!ai) {
    console.log('⚠️ ANTHROPIC_API_KEY が未設定のため、AI要約をスキップ');
    return articles;
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  🤖 AI要約・分類を開始 (Claude)');
  console.log('═══════════════════════════════════════');
  console.log('');

  // YouTube 記事と通常記事を分離
  const youtubeArticles = articles.filter(a => isYouTubeUrl(a.url));
  const normalArticles = articles.filter(a => !isYouTubeUrl(a.url));

  // YouTube は個別に Sonnet で要約（transcript あり）
  const summarizedYoutube = await summarizeYouTubeArticles(ai, youtubeArticles);

  // 通常記事は Haiku でバッチ要約
  const summarizedNormal = await summarizeBatchArticles(ai, normalArticles);

  const result = [...summarizedNormal, ...summarizedYoutube];
  console.log(`🤖 AI要約完了: ${result.length}件`);
  return result;
}

/**
 * YouTube 動画を Sonnet で要約（transcript 優先）
 */
async function summarizeYouTubeArticles(ai, articles) {
  if (articles.length === 0) return [];

  console.log(`🎬 YouTube 要約: ${articles.length}件`);
  const results = [];

  for (const article of articles) {
    try {
      const content = article.transcriptText
        ? `【字幕/トランスクリプト】\n${article.transcriptText.slice(0, 8000)}`
        : `【動画説明文】\n${article.content || ''}`;

      const response = await withRetry(() =>
        ai.messages.create({
          model: YOUTUBE_MODEL,
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `以下のYouTube動画の内容を日本語で600文字以内で要約してください。
視聴者にとって有益な情報・学べること・主なポイントを具体的に書いてください。

タイトル: ${article.title}
チャンネル: ${article.author || article.sourceName}

${content}

JSONのみを返してください:
{"summary": "要約テキスト", "importance": 3}`
          }]
        })
      );

      const text = response.content[0].text.trim()
        .replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
      const parsed = JSON.parse(text);

      results.push({
        ...article,
        summary: parsed.summary || article.content?.slice(0, 200) || '',
        importance: clampImportance(parsed.importance),
        category: article.category,
      });
    } catch (err) {
      console.error(`  ❌ YouTube要約エラー (${article.title?.slice(0, 40)}): ${err.message}`);
      results.push({ ...article, summary: article.content?.slice(0, 200) || '', importance: 3 });
    }

    await sleep(500);
  }

  return results;
}

/**
 * 通常記事を Haiku でバッチ要約（5件/バッチ）
 */
async function summarizeBatchArticles(ai, articles) {
  if (articles.length === 0) return [];

  const batchSize = 5;
  const summarized = [];

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    try {
      const results = await withRetry(() => summarizeBatch(ai, batch));
      summarized.push(...results);
    } catch (err) {
      console.error(`  ❌ バッチ要約エラー (${i}～${i + batch.length}件目): ${err.message}`);
      // バッチ失敗時はフォールバックで続行
      summarized.push(...batch.map(a => ({
        ...a,
        summary: a.content?.slice(0, 200) || '',
        importance: 3,
      })));
    }

    console.log(`  📝 進捗: ${Math.min(i + batchSize, articles.length)}/${articles.length}件`);

    if (i + batchSize < articles.length) {
      await sleep(1500);
    }
  }

  return summarized;
}

/**
 * 1 バッチ（最大5件）を要約
 */
async function summarizeBatch(ai, articles) {
  const enriched = await Promise.all(
    articles.map(async a => {
      const fullContent = await fetchFullContent(a.url, a.content || '');
      return { ...a, fullContent };
    })
  );

  const articlesText = enriched
    .map((a, i) =>
      `[記事${i + 1}]\nタイトル: ${a.title}\nソース: ${a.sourceName}\n元カテゴリ: ${a.category}\n内容: ${a.fullContent}`
    )
    .join('\n\n---\n\n');

  const prompt = `以下の記事を日本語で要約・分類してください。

各記事に対して以下のJSON配列を返してください:
[
  {
    "index": 0,
    "summary": "200文字以内の要約。タイトルを繰り返さず、記事の本質的なポイントを書くこと",
    "category": "有効なカテゴリ名",
    "importance": 3
  }
]

有効なカテゴリ: ${VALID_CATEGORIES.join(', ')}
重要度: 1(低) ～ 5(高)

記事:
${articlesText}

JSONのみを返してください。コードブロックは不要です。`;

  const response = await ai.messages.create({
    model: BATCH_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim()
    .replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
  const summaries = JSON.parse(text);

  return articles.map((article, i) => {
    const s = summaries.find(x => x.index === i) || summaries[i];
    return {
      ...article,
      summary: s?.summary || enriched[i]?.fullContent?.slice(0, 200) || article.content?.slice(0, 200) || '',
      category: validateCategory(s?.category) || article.category,
      importance: clampImportance(s?.importance),
    };
  });
}

/**
 * URL から記事本文を取得（YouTube はスキップ）
 */
async function fetchFullContent(url, fallback) {
  const targetUrl = safeDecodeGoogleNewsUrl(url);

  if (isYouTubeUrl(targetUrl)) return fallback;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return fallback;

    const html = await res.text();
    const $ = cheerio.load(html);

    $('script, style, nav, footer, header, aside, .sidebar, iframe, noscript').remove();

    let mainText = '';
    for (const selector of ['article', 'main', '.post-content', '.entry-content', '#content', 'body']) {
      const el = $(selector);
      if (el.length > 0) {
        mainText = el.text();
        break;
      }
    }

    if (!mainText || mainText.trim().length < 50) return fallback;
    return mainText.replace(/\s+/g, ' ').trim().slice(0, 8000);
  } catch {
    return fallback;
  }
}

/**
 * Google News の Base64 エンコード URL を安全にデコード
 */
function safeDecodeGoogleNewsUrl(url) {
  if (!url.includes('news.google.com/rss/articles/')) return url;
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

function isYouTubeUrl(url) {
  return url && (url.includes('youtube.com') || url.includes('youtu.be'));
}

function validateCategory(category) {
  if (!category) return null;
  if (VALID_CATEGORIES.includes(category)) return category;
  return VALID_CATEGORIES.find(
    c => c.toLowerCase().includes(category.toLowerCase()) ||
         category.toLowerCase().includes(c.toLowerCase())
  ) || null;
}

function clampImportance(v) {
  const n = parseInt(v) || 3;
  return Math.min(5, Math.max(1, n));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

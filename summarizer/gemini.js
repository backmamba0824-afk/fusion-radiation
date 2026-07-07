import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';

const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
}

const VALID_CATEGORIES = [
  '3DCG', 'AI', 'ゲーム開発', 'デザイン',
  'デジタルマーケティング', '映像制作', '子育て', '家計・NISA', '住宅情報'
];
const IRRELEVANT_CATEGORY = '関係なし';

/**
 * 記事をAIで要約・分類
 * @param {Array} articles - 記事の配列
 * @returns {Array} 要約・分類済みの記事配列
 */
export async function summarizeArticles(articles) {
  if (!model) {
    console.log('⚠️ GEMINI_API_KEY が未設定のため、AI要約をスキップ');
    return articles;
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  🤖 AI要約・分類を開始');
  console.log('═══════════════════════════════════════');
  console.log('');

  const batchSize = 5;
  const summarized = [];

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const results = await summarizeBatch(batch);
    summarized.push(...results);

    console.log(`  📝 進捗: ${Math.min(i + batchSize, articles.length)}/${articles.length}件`);

    // 無料枠レート制限: 10 RPM = 最低6秒/リクエスト、余裕を持って8秒待機
    if (i + batchSize < articles.length) {
      await sleep(8000);
    }
  }

  console.log(`🤖 AI要約完了: ${summarized.length}件`);
  return summarized;
}

/**
 * Google NewsのBase64エンコードされたURLをデコードして真のURLを取得
 */
function decodeGoogleNewsUrl(url) {
  if (!url.includes('news.google.com/rss/articles/')) return url;
  try {
    const id = url.match(/articles\/([^?]+)/)[1];
    const padded = id.padEnd(id.length + (4 - id.length % 4) % 4, '=');
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64').toString('ascii');
    const match = decoded.match(/https?:\/\/[^\s"'<>]+/);
    return match ? match[0] : url;
  } catch (error) {
    return url;
  }
}

/**
 * URLから記事の本文（HTML）を取得し、プレーンテキストとOGP画像を返す
 * 取得に失敗した場合やYouTubeの場合は、fallback（元々の短い要約/説明文）を返す
 * @returns {{ text: string, image: string|null }}
 */
async function fetchFullContent(url, fallback) {
  // Google News専用のリダイレクトURLデコード処理
  let targetUrl = decodeGoogleNewsUrl(url);

  // YouTubeはスクレイピングしても本文が取れないのでスキップ
  if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
    return { text: fallback, image: null };
  }

  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000) // 10秒でタイムアウト
    });

    if (!res.ok) return { text: fallback, image: null };

    const html = await res.text();
    const $ = cheerio.load(html);

    // OGP画像をサムネイルとして抽出
    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null;

    // 不要な要素を削除
    $('script, style, nav, footer, header, aside, .sidebar, iframe, noscript').remove();

    // 記事本文が入っていそうな場所からテキストを抽出
    let mainText = '';
    const selectors = ['article', 'main', '.post-content', '.entry-content', '#content', 'body'];

    for (const selector of selectors) {
      const el = $(selector);
      if (el.length > 0) {
        mainText = el.text();
        break; // 最も具体的なセレクタで見つかったら終了
      }
    }

    if (!mainText || mainText.trim().length < 50) return { text: fallback, image };

    // 余分な空白や改行をきれいにして返す（最大10000文字）
    return { text: mainText.replace(/\s+/g, ' ').trim().slice(0, 10000), image };
  } catch (error) {
    console.log(`    ⚠️ 全文取得スキップ (${url.slice(0, 50)}...): ${error.message}`);
    return { text: fallback, image: null };
  }
}

/**
 * バッチで記事を要約
 */
async function summarizeBatch(articles) {
  // 1. 各記事の全文とOGP画像を裏で取得する
  const enrichedArticles = await Promise.all(
    articles.map(async (a) => {
      // YouTube動画は字幕を本文として使う（スクレイピング不可のため）
      const { text: fullContent, image } = await fetchFullContent(a.url, a.transcriptText || a.content || '');
      return { ...a, fullContent, thumbnail: a.thumbnail || image || null };
    })
  );

  // 2. フェッチした全文を使ってプロンプトを作成
  const articlesText = enrichedArticles
    .map((a, i) => `[記事${i + 1}]\\nタイトル: ${a.title}\\nソース: ${a.sourceName}\\n元カテゴリ: ${a.category}\\n内容: ${a.fullContent}`)
    .join('\\n\\n---\\n\\n');

  const prompt = `以下の記事それぞれについて、内容を深く理解した上で、日本語で詳細に要約・分類してください。

【分類の指示】
- 有効なカテゴリのいずれにも明確に当てはまらない記事（ネットワーク設定ツール・セキュリティ証明書・インフラ系など）は category を「関係なし」としてください。
- 「関係なし」の記事は summary を空文字、importance を 0 にしてください。

【要約の指示（関係ありの記事のみ）】
- タイトルをそのまま繰り返すのではなく、記事や動画の「本質的な内容」「重要なポイント」「結論や示唆」を抽出してください。
- 文章は【400文字程度】で、適度に読みやすくまとめてください（改行には \\n を使ってください）。
- 「〇〇について解説しています」等の紹介文句ではなく、実際の役に立つ情報（要点）を直接書いてください。

各記事に対して以下のJSON形式で回答してください:
[
  {
    "index": 0,
    "summary": "400文字程度の詳細な要約（関係なしの場合は空文字）",
    "category": "適切なカテゴリ名 または 関係なし",
    "importance": 3
  }
]

有効なカテゴリ: ${VALID_CATEGORIES.join(', ')}, 関係なし
重要度: 1(低) ~ 5(高) で評価。関係なしは 0。

記事:
${articlesText}

JSONのみを返してください。マークダウンのコードブロックは使わないでください。`;

  try {
    let result;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        const waitMs = 15000 * Math.pow(2, attempt);
        console.warn(`  ⏳ リトライ ${attempt + 1}/3 (${waitMs / 1000}秒後): ${err.message.slice(0, 60)}`);
        await sleep(waitMs);
      }
    }
    const responseText = result.response.text().trim();

    // JSONを抽出（コードブロックで囲まれている場合に対応）
    const jsonStr = responseText.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
    const summaries = JSON.parse(jsonStr);

    return enrichedArticles.map((article, i) => {
      const summary = summaries.find((s) => s.index === i) || summaries[i];
      // 要約失敗・未返却時は、フルコンテンツか元コンテントの先頭を返す
      const fallbackSummary = article.fullContent
        ? article.fullContent.slice(0, 300) + '...'
        : article.content?.slice(0, 200) || '';

      return {
        ...article,
        summary: summary?.summary || fallbackSummary,
        category: validateCategory(summary?.category) || article.category,
        importance: Math.min(5, Math.max(1, summary?.importance || 3)),
      };
    });
  } catch (error) {
    console.error(`  ⚠️ AI要約エラー: ${error.message}`);
    // エラー時はフェッチした本文か元コンテントをそのまま返す
    return enrichedArticles.map((article) => ({
      ...article,
      summary: article.fullContent ? article.fullContent.slice(0, 300) + '...' : (article.content?.slice(0, 200) || ''),
      importance: 3,
    }));
  }
}

/**
 * カテゴリ名を検証・修正
 */
function validateCategory(category) {
  if (!category) return null;
  if (category === IRRELEVANT_CATEGORY) return IRRELEVANT_CATEGORY;
  if (VALID_CATEGORIES.includes(category)) return category;

  const match = VALID_CATEGORIES.find(
    (c) => c.toLowerCase().includes(category.toLowerCase())
      || category.toLowerCase().includes(c.toLowerCase())
  );
  return match || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

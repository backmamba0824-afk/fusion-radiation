import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

const VALID_CATEGORIES = [
  '3DCG', 'AI', 'ゲーム開発', 'デザイン',
  'デジタルマーケティング', '映像制作', '子育て', '家計・NISA',
];

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

    // レート制限を避けるため少し待つ
    if (i + batchSize < articles.length) {
      await sleep(2000);
    }
  }

  console.log(`🤖 AI要約完了: ${summarized.length}件`);
  return summarized;
}

/**
 * バッチで記事を要約
 */
async function summarizeBatch(articles) {
  const articlesText = articles
    .map((a, i) => `[記事${i + 1}]\nタイトル: ${a.title}\nソース: ${a.sourceName}\n元カテゴリ: ${a.category}\n内容: ${(a.content || '').slice(0, 500)}`)
    .join('\n\n---\n\n');

  const prompt = `以下の記事それぞれについて、日本語で要約・分類してください。

各記事に対して以下のJSON形式で回答してください:
[
  {
    "index": 0,
    "summary": "2-3文の簡潔な日本語要約",
    "category": "適切なカテゴリ名",
    "importance": 3
  }
]

有効なカテゴリ: ${VALID_CATEGORIES.join(', ')}
重要度: 1(低) ~ 5(高) で評価

記事:
${articlesText}

JSONのみを返してください。マークダウンのコードブロックは使わないでください。`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // JSONを抽出（コードブロックで囲まれている場合に対応）
    const jsonStr = responseText.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
    const summaries = JSON.parse(jsonStr);

    return articles.map((article, i) => {
      const summary = summaries.find((s) => s.index === i) || summaries[i];
      return {
        ...article,
        summary: summary?.summary || article.content?.slice(0, 200) || '',
        category: validateCategory(summary?.category) || article.category,
        importance: Math.min(5, Math.max(1, summary?.importance || 3)),
      };
    });
  } catch (error) {
    console.error(`  ⚠️ AI要約エラー: ${error.message}`);
    // エラー時はそのまま返す
    return articles.map((article) => ({
      ...article,
      summary: article.content?.slice(0, 200) || '',
      importance: 3,
    }));
  }
}

/**
 * カテゴリ名を検証・修正
 */
function validateCategory(category) {
  if (!category) return null;
  if (VALID_CATEGORIES.includes(category)) return category;

  // 部分一致を試みる
  const match = VALID_CATEGORIES.find(
    (c) => c.toLowerCase().includes(category.toLowerCase())
      || category.toLowerCase().includes(c.toLowerCase())
  );
  return match || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Discord Webhook でダイジェストを送信
 */

const CATEGORY_EMOJIS = {
  '3DCG': '🎨',
  'AI': '🤖',
  'ゲーム開発': '🎮',
  'デザイン': '✨',
  'デジタルマーケティング': '📈',
  '映像制作': '🎬',
  '子育て': '👶',
  '家計・NISA': '💰',
};

/**
 * ダイジェストをDiscordに送信
 * @param {Array} articles - 記事の配列
 * @returns {boolean} 送信成功かどうか
 */
export async function sendDigest(articles) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log('⚠️ DISCORD_WEBHOOK_URL が未設定のため、Discord通知をスキップ');
    return false;
  }

  if (articles.length === 0) {
    console.log('📭 通知する記事がありません');
    return true;
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  📢 Discordダイジェスト送信');
  console.log('═══════════════════════════════════════');
  console.log('');

  // カテゴリ別にグループ化
  const grouped = groupByCategory(articles);

  // 日付ヘッダー
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // ヘッダーEmbed
  const headerEmbed = {
    title: `📰 Fusion Radiation - デイリーダイジェスト`,
    description: `**${today}**\n\n本日の収集記事: **${articles.length}件** / **${Object.keys(grouped).length}カテゴリ**`,
    color: 0x6366f1, // Indigo
    timestamp: new Date().toISOString(),
  };

  // ヘッダーを送信
  await sendWebhook(webhookUrl, { embeds: [headerEmbed] });

  // カテゴリ別にEmbedを送信
  for (const [category, catArticles] of Object.entries(grouped)) {
    const emoji = CATEGORY_EMOJIS[category] || '📌';
    const sortedArticles = catArticles.sort((a, b) => (b.importance || 3) - (a.importance || 3));

    const fields = sortedArticles.slice(0, 10).map((article) => {
      const importance = '⭐'.repeat(article.importance || 3);
      const summary = article.summary
        ? `\n${article.summary.slice(0, 150)}`
        : '';

      return {
        name: `${importance} ${article.title.slice(0, 80)}`,
        value: `${summary}\n[📖 記事を読む](${article.url}) | _${article.sourceName}_`,
        inline: false,
      };
    });

    const categoryEmbed = {
      title: `${emoji} ${category}（${catArticles.length}件）`,
      color: getCategoryColor(category),
      fields,
    };

    await sendWebhook(webhookUrl, { embeds: [categoryEmbed] });

    // レート制限を避ける
    await sleep(1000);
  }

  console.log(`📢 Discord送信完了: ${articles.length}件`);
  return true;
}

/**
 * Discord Webhookにメッセージを送信
 */
async function sendWebhook(url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Fusion Radiation',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/2103/2103633.png',
        ...payload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook応答: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error(`❌ Webhook送信エラー: ${error.message}`);
    throw error;
  }
}

/**
 * カテゴリ別にグループ化
 */
function groupByCategory(articles) {
  return articles.reduce((acc, article) => {
    const cat = article.category || 'その他';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(article);
    return acc;
  }, {});
}

/**
 * カテゴリごとの色を返す
 */
function getCategoryColor(category) {
  const colors = {
    '3DCG': 0xf59e0b,       // Amber
    'AI': 0x8b5cf6,          // Violet
    'ゲーム開発': 0x10b981,   // Emerald
    'デザイン': 0xec4899,     // Pink
    'デジタルマーケティング': 0x3b82f6, // Blue
    '映像制作': 0xef4444,    // Red
    '子育て': 0x14b8a6,      // Teal
    '家計・NISA': 0xf97316,  // Orange
  };
  return colors[category] || 0x6b7280;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

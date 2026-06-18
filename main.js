// .env ファイルを最初に読み込む（他のモジュールより前に実行）
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnv() {
  const envPath = join(__dirname, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
    console.log('✅ .env ファイルを読み込みました');
  } else {
    console.log('⚠️ .env ファイルが見つかりません');
  }
}

// ★ 他のモジュールをimportする前に.envを読み込む
loadEnv();

// ★ .env読み込み後にモジュールを動的import
const { collectAll } = await import('./collector/index.js');
const { summarizeArticles } = await import('./summarizer/gemini.js');
const { saveArticles, getUnnotifiedArticles, markAsNotified, logDigest } = await import('./db/supabase.js');
const { sendDigest } = await import('./notifier/discord.js');

async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const collectOnly = args.includes('--collect-only');
  const digestOnly = args.includes('--digest-only');
  const limit = parseInt(args.find((a) => a.startsWith('--limit'))?.split('=')[1] || args[args.indexOf('--limit') + 1] || '0', 10);
  const hoursBack = parseInt(args.find((a) => a.startsWith('--hours'))?.split('=')[1] || args[args.indexOf('--hours') + 1] || '24', 10);

  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   🔥 Fusion Radiation                 ║');
  console.log('║   情報集約・通知システム                   ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  console.log(`⏰ 実行時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  console.log(`📋 モード: ${isTest ? 'テスト' : digestOnly ? 'ダイジェストのみ' : collectOnly ? '収集のみ' : '通常'}`);
  console.log('');

  try {
    let articles = [];

    if (!digestOnly) {
      // ========== 1. 情報収集 ==========
      articles = await collectAll(hoursBack);

      if (limit > 0) {
        articles = articles.slice(0, limit);
        console.log(`🔬 テストモード: ${limit}件に制限`);
      }

      if (articles.length === 0) {
        console.log('📭 新しい記事がありませんでした');
        return;
      }

      // ========== 2. AI要約・分類 ==========
      articles = await summarizeArticles(articles);

      // ========== 3. DB保存 ==========
      await saveArticles(articles);
    } else {
      // ダイジェストのみモード: 未通知記事を取得
      articles = await getUnnotifiedArticles();
      if (articles.length === 0) {
        console.log('📭 未通知の記事がありません');
        return;
      }
    }

    if (collectOnly) {
      console.log('✅ 収集完了（通知スキップ）');
      printSummary(articles);
      return;
    }

    // ========== 4. Discord通知 ==========
    const success = await sendDigest(articles);

    if (success) {
      // 通知済みにマーク
      const ids = articles.filter((a) => a.id).map((a) => a.id);
      if (ids.length > 0) {
        await markAsNotified(ids);
      }

      // ダイジェストログ
      const categories = [...new Set(articles.map((a) => a.category))];
      await logDigest(articles.length, categories, 'success');
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('  ✅ 全処理完了！');
    console.log('═══════════════════════════════════════');
    printSummary(articles);

  } catch (error) {
    console.error('');
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error.stack);

    await logDigest(0, [], 'failed', error.message);
    process.exit(1);
  }
}

function printSummary(articles) {
  console.log('');
  console.log('📊 カテゴリ別集計:');
  const grouped = articles.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});

  for (const [cat, count] of Object.entries(grouped).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${count}件`);
  }
  console.log('');
}

main();

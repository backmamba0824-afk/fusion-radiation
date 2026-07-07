// 既存記事のサムネイル一括補完スクリプト
// 使い方: node backfill_thumbnails.js [--days 30]
//  - YouTube動画 → 動画IDからサムネイルURLを導出
//  - Google News URL → 実URLに解決してから og:image を取得
//  - その他 → 記事ページの og:image / twitter:image を取得
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      const i = t.indexOf('=');
      if (i > 0 && !process.env[t.slice(0, i).trim()]) {
        process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      }
    }
  }
}

const { default: supabase } = await import('./db/supabase.js');
const { resolveGoogleNewsUrls } = await import('./collector/gnews.js');
const cheerio = await import('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const args = process.argv.slice(2);
const days = parseInt(args.find(a => a.startsWith('--days'))?.split('=')[1] || args[args.indexOf('--days') + 1] || '30', 10);

function youtubeThumbnail(url) {
  const m = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}

async function fetchOgImage(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const $ = cheerio.load(await res.text());
    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null;
    if (!image) return null;
    // 相対URLを絶対URLに変換
    return new URL(image, res.url || url).href;
  } catch {
    return null;
  }
}

async function main() {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('articles')
    .select('id, url, thumbnail_url')
    .or('thumbnail_url.is.null,thumbnail_url.eq.')
    .gte('collected_at', since)
    .limit(3000);

  if (error) {
    console.error('❌ 記事取得エラー:', error.message);
    process.exit(1);
  }

  console.log(`🖼️ サムネイル補完対象: ${rows.length}件（直近${days}日）`);

  // Google News URL は先にまとめて実URLに解決（DBのURLは変更しない）
  const targets = rows.map(r => ({ id: r.id, url: r.url }));
  await resolveGoogleNewsUrls(targets);

  let updated = 0;
  let failed = 0;
  const concurrency = 6;

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    await Promise.all(batch.map(async (t) => {
      const thumbnail = youtubeThumbnail(t.url) || await fetchOgImage(t.url);
      if (!thumbnail || !thumbnail.startsWith('http')) {
        failed++;
        return;
      }
      const { error: upErr } = await supabase
        .from('articles')
        .update({ thumbnail_url: thumbnail })
        .eq('id', t.id);
      if (upErr) failed++;
      else updated++;
    }));

    if ((i + concurrency) % 60 < concurrency) {
      console.log(`  📝 進捗: ${Math.min(i + concurrency, targets.length)}/${targets.length}件（成功${updated} / 取得不可${failed}）`);
    }
  }

  console.log(`✅ 完了: ${updated}件補完 / ${failed}件は画像取得不可`);
  process.exit(0);
}

main();

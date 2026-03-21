import { createClient } from '@supabase/supabase-js';
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
  }
}

async function migrateSources() {
  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ .env に SUPABASE_URL と SUPABASE_ANON_KEY が必要です');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const configPath = join(__dirname, 'config', 'sources.json');
  
  if (!existsSync(configPath)) {
    console.error('❌ config/sources.json が見つかりません');
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const allSources = [];

  // RSS
  if (config.rss) {
    for (const item of config.rss) {
      allSources.push({
        name: item.name,
        url: item.url,
        type: 'rss',
        category: item.category,
        is_active: true
      });
    }
  }

  // YouTube
  if (config.youtube) {
    for (const item of config.youtube) {
      allSources.push({
        name: item.name,
        url: item.channelId, // YouTubeの場合はchannelIdをURLカラムに保存
        type: 'youtube',
        category: item.category,
        is_active: true
      });
    }
  }

  // Scrape
  if (config.scrape) {
    for (const item of config.scrape) {
      allSources.push({
        name: item.name,
        url: item.url,
        type: 'scrape',
        category: item.category,
        is_active: true
      });
    }
  }

  console.log(`🚀 ${allSources.length}件のソースをデータベースに移行します...`);

  let successCount = 0;
  for (const source of allSources) {
    const { error } = await supabase
      .from('sources')
      .upsert(source, { onConflict: 'url', ignoreDuplicates: true });

    if (error) {
      console.error(`❌ エラー: ${source.name} - ${error.message}`);
    } else {
      successCount++;
    }
  }

  console.log(`✅ 移行完了！ ${successCount}件を保存しました（すでに存在する場合はスキップしました）。`);
}

migrateSources();

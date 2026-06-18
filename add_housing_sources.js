import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);

async function addSources() {
  const sources = [
    { name: 'Google News (注文住宅)', url: 'https://news.google.com/rss/search?q=注文住宅+when:7d&hl=ja&gl=JP&ceid=JP:ja', type: 'rss', category: '住宅情報', is_active: true },
    { name: 'SUUMOジャーナル', url: 'https://suumo.jp/journal/feed/', type: 'rss', category: '住宅情報', is_active: true },
    { name: 'げげ', url: 'UC7Puhg3u78b-L2H-l-sJ1OQ', type: 'youtube', category: '住宅情報', is_active: true },
    { name: 'ラクジュ建築と不動産', url: 'UCW4wunNlA5uXyP2U1Nq693Q', type: 'youtube', category: '住宅情報', is_active: true }
  ];
  
  for (const s of sources) {
    const { error } = await supabase.from('sources').insert([s]);
    if (error) {
      if (error.code === '23505') console.log('✅ 既に登録済み:', s.name);
      else console.error('❌ 追加エラー:', s.name, error.message);
    } else {
      console.log('✅ 追加成功:', s.name);
    }
  }
}

addSources();

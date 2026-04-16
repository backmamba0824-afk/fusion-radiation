import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export async function fetchArticles({ category, search, page = 1, limit = 20, showFavoritesOnly = false } = {}) {
  // DB未接続時はデモデータを返す
  if (!supabase) {
    return getDemoData({ category, search, page, limit, showFavoritesOnly });
  }

  const offset = (page - 1) * limit;

  let query = supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== 'すべて') {
    query = query.eq('category', category);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
  }

  if (showFavoritesOnly) {
    query = query.eq('is_favorite', true);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Supabase error:', error);
    return getDemoData({ category, search, page, limit });
  }

  return {
    articles: data || [],
    total: count || 0,
    isDemo: false,
  };
}

function getDemoData({ category, search, page = 1, limit = 20, showFavoritesOnly = false }) {
  let articles = DEMO_ARTICLES;

  if (category && category !== 'すべて') {
    articles = articles.filter((a) => a.category === category);
  }

  if (showFavoritesOnly) {
    articles = articles.filter((a) => a.is_favorite);
  }

  if (search) {
    const q = search.toLowerCase();
    articles = articles.filter(
      (a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)
    );
  }

  const total = articles.length;
  const offset = (page - 1) * limit;
  articles = articles.slice(offset, offset + limit);

  return { articles, total, isDemo: true };
}

const DEMO_ARTICLES = [
  {
    id: '1',
    title: 'Blender 4.3の新機能まとめ：ジオメトリノードの大幅改善',
    url: 'https://example.com/blender-4-3',
    summary: 'Blender 4.3ではジオメトリノードに多くの改善が加えられました。新しいシミュレーションノード、改善されたUV編集ツール、パフォーマンス向上などが含まれています。',
    category: '3DCG',
    source_name: 'Blender Nation',
    importance: 5,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    title: 'GPT-5の最新リーク情報と業界への影響分析',
    url: 'https://example.com/gpt-5',
    summary: 'OpenAIの次世代モデルGPT-5に関する情報が流出。マルチモーダル能力の大幅強化、推論能力の向上、コスト削減が期待されています。',
    category: 'AI',
    source_name: 'Zenn - AI',
    importance: 5,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    title: 'Unity 7 Beta公開 - ECSがデフォルトアーキテクチャに',
    url: 'https://example.com/unity-7',
    summary: 'Unity 7のベータ版が公開されました。Entity Component System(ECS)がデフォルトとなり、パフォーマンスが大幅に向上しています。',
    category: 'ゲーム開発',
    source_name: 'Unity Blog',
    importance: 4,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '4',
    title: '2026年のUIデザイントレンド：ニューモーフィズムからグラスモーフィズムへ',
    url: 'https://example.com/design-trends-2026',
    summary: '2026年のデザイントレンドを予測。ダークモード、マイクロアニメーション、3D要素の活用がさらに加速しています。',
    category: 'デザイン',
    source_name: 'Smashing Magazine',
    importance: 3,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '5',
    title: 'Google広告の最新アップデート：AI生成クリエイティブの自動最適化',
    url: 'https://example.com/google-ads-ai',
    summary: 'Google広告にAI生成クリエイティブの自動最適化機能が追加。広告のA/Bテストと最適化が全自動で行われるようになります。',
    category: 'デジタルマーケティング',
    source_name: 'Web担当者Forum',
    importance: 4,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '6',
    title: 'DaVinci Resolve 20のカラーグレーディング新機能',
    url: 'https://example.com/davinci-20',
    summary: 'DaVinci Resolve 20ではAIベースのカラーグレーディング機能が強化。HDR10+ドルビービジョンの同時出力にも対応しています。',
    category: '映像制作',
    source_name: 'Vook',
    importance: 4,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '7',
    title: '子どものプログラミング教育、何歳から始めるべき？専門家の見解',
    url: 'https://example.com/kids-programming',
    summary: '子どものプログラミング教育の適切な開始年齢について、教育専門家の最新の見解をまとめました。Scratchの活用法も紹介。',
    category: '子育て',
    source_name: 'たまひよ',
    importance: 3,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '8',
    title: '2026年度NISA改正ポイント：成長投資枠の拡大と新たな非課税メリット',
    url: 'https://example.com/nisa-2026',
    summary: '2026年度のNISA制度改正の主要ポイントを解説。成長投資枠の拡大、新たな非課税メリット、おすすめの運用戦略を紹介します。',
    category: '家計・NISA',
    source_name: 'トウシル',
    importance: 5,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '9',
    title: 'Stable Diffusion 4.0リリース：動画生成にも対応',
    url: 'https://example.com/sd-4',
    summary: 'Stable Diffusion 4.0がリリースされ、テキストから動画を生成する機能が追加されました。品質も大幅に向上しています。',
    category: 'AI',
    source_name: 'GIGAZINE',
    importance: 4,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '10',
    title: 'Unreal Engine 6のNanite改良：植物・布のリアルタイムレンダリング',
    url: 'https://example.com/ue6-nanite',
    summary: 'Unreal Engine 6ではNaniteが植物や布などの動的オブジェクトにも対応。リアルタイムレンダリングの品質が飛躍的に向上しました。',
    category: '3DCG',
    source_name: 'Zenn - 3DCG',
    importance: 4,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '11',
    title: '子育て世帯向け補助金ガイド2026年版：自治体別の支援制度まとめ',
    url: 'https://example.com/subsidy-2026',
    summary: '2026年度の子育て世帯向け補助金・支援制度を自治体別にまとめました。申請方法や期限も詳しく解説しています。',
    category: '家計・NISA',
    source_name: 'マネーフォワード',
    importance: 5,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '12',
    title: 'Figma AI機能の新展開：デザインからコードへの自動変換精度が90%に',
    url: 'https://example.com/figma-ai',
    summary: 'FigmaのAI機能が大幅にアップデート。デザインからReactコンポーネントへの自動変換精度が90%を達成しました。',
    category: 'デザイン',
    source_name: 'Zenn - デザイン',
    importance: 4,
    thumbnail_url: null,
    published_at: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
  },
];

/**
 * 情報ソースを取得
 */
export async function fetchSources() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Sources fetch error:', error);
    return [];
  }
  return data || [];
}

/**
 * 新しい情報ソースを追加
 */
export async function addSource(sourceData) {
  if (!supabase) return { error: 'Supabase is not connected' };

  const { data, error } = await supabase
    .from('sources')
    .insert([sourceData])
    .select()
    .single();

  return { data, error };
}

/**
 * 情報ソースを削除
 */
export async function deleteSource(id) {
  if (!supabase) return { error: 'Supabase is not connected' };

  const { error } = await supabase
    .from('sources')
    .delete()
    .eq('id', id);

  return { error };
}

/**
 * 情報ソースの有効/無効を切り替え
 */
export async function toggleSource(id, currentStatus) {
  if (!supabase) return { error: 'Supabase is not connected' };

  const { error } = await supabase
    .from('sources')
    .update({ is_active: !currentStatus })
    .eq('id', id);

  return { error };
}

/**
 * 記事のお気に入り状態を切り替え
 */
export async function toggleArticleFavorite(id, currentStatus) {
  if (!supabase) return { error: 'Supabase is not connected' };

  const { error } = await supabase
    .from('articles')
    .update({ is_favorite: !currentStatus })
    .eq('id', id);

  return { error };
}

export default supabase;


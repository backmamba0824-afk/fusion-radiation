import { useState, useEffect, useCallback } from 'react';
import { fetchArticles, fetchSources, addSource, deleteSource, toggleSource, toggleArticleFavorite } from './supabase.js';

const CATEGORIES = [
  { name: 'すべて', emoji: '📰' },
  { name: '3DCG', emoji: '🎨' },
  { name: 'AI', emoji: '🤖' },
  { name: 'ゲーム開発', emoji: '🎮' },
  { name: 'デザイン', emoji: '✨' },
  { name: 'デジタルマーケティング', emoji: '📈' },
  { name: '映像制作', emoji: '🎬' },
  { name: '子育て', emoji: '👶' },
  { name: '家計・NISA', emoji: '💰' },
  { name: '住宅情報', emoji: '🏠' },
  { name: '著者ウォッチ', emoji: '👤' },
];

const BADGE_CLASSES = {
  '3DCG': 'badge-3dcg',
  'AI': 'badge-ai',
  'ゲーム開発': 'badge-gamedev',
  'デザイン': 'badge-design',
  'デジタルマーケティング': 'badge-marketing',
  '映像制作': 'badge-video',
  '子育て': 'badge-parenting',
  '家計・NISA': 'badge-finance',
  '住宅情報': 'badge-housing',
  '著者ウォッチ': 'badge-author',
};

function App() {
  const [view, setView] = useState('articles'); // 'articles' | 'sources'
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('すべて');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState({});
  const limit = 20;

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchArticles({ category, search, page, limit, showFavoritesOnly });
      setArticles(result.articles);
      setTotal(result.total);
      setIsDemo(result.isDemo);
    } catch (error) {
      console.error('記事の取得に失敗:', error);
    }
    setLoading(false);
  }, [category, search, page, showFavoritesOnly]);

  useEffect(() => {
    async function loadCounts() {
      const counts = {};
      let allCount = 0;
      for (const cat of CATEGORIES) {
        if (cat.name === 'すべて') continue;
        const result = await fetchArticles({ category: cat.name, limit: 1000 });
        counts[cat.name] = result.total;
        allCount += result.total;
      }
      counts['すべて'] = allCount;
      setCategoryCounts(counts);
    }
    loadCounts();
  }, []);

  useEffect(() => {
    if (view === 'articles') {
      loadArticles();
    }
  }, [loadArticles, view]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    setView('articles');
  };

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    setPage(1);
    setView('articles');
  };

  const handleFavoriteToggle = async (articleId, currentStatus) => {
    const { error } = await toggleArticleFavorite(articleId, currentStatus);
    if (!error) {
      setArticles(articles.map(a => 
        a.id === articleId ? { ...a, is_favorite: !currentStatus } : a
      ));
    }
  };

  const totalPages = Math.ceil(total / limit);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'たった今';
    if (hours < 24) return `${hours}時間前`;
    if (hours < 48) return '昨日';
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="logo" onClick={() => setView('articles')} style={{cursor: 'pointer'}}>
            <span className="logo-icon">🔥</span>
            <span>Fusion Radiation</span>
          </div>

          <form className="search-box" onSubmit={handleSearch}>
            <span className="search-icon">🔍</span>
            <input
              id="search-input"
              type="text"
              placeholder="記事を検索..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>

          <div className="header-stats">
            <span>📰 {total}件</span>
            <button 
              onClick={() => setView(view === 'sources' ? 'articles' : 'sources')}
              className="sources-btn"
            >
              ⚙️ {view === 'sources' ? '記事に戻る' : 'ソース管理'}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        {isDemo && view === 'articles' && (
          <div className="demo-banner">
            <span className="demo-banner-icon">💡</span>
            <div>
              <strong>デモモード</strong> - Supabase未接続のため、サンプルデータを表示しています。
              <code>.env</code> に接続情報を設定するとリアルデータが表示されます。
            </div>
          </div>
        )}

        {view === 'sources' ? (
          <SourceManager CATEGORIES={CATEGORIES} />
        ) : (
          <>
            {/* Category Tabs */}
            <div className="category-tabs" role="tablist">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.name}
                  id={`tab-${cat.name}`}
                  className={`category-tab ${category === cat.name ? 'active' : ''}`}
                  onClick={() => handleCategoryChange(cat.name)}
                  role="tab"
                  aria-selected={category === cat.name}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.name}</span>
                  {categoryCounts[cat.name] !== undefined && (
                    <span className="tab-count">{categoryCounts[cat.name]}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="filter-controls">
              <label className="favorite-filter-label">
                <input 
                  type="checkbox" 
                  checked={showFavoritesOnly}
                  onChange={(e) => {
                    setShowFavoritesOnly(e.target.checked);
                    setPage(1);
                  }}
                />
                🌟 お気に入りのみ表示
              </label>
            </div>

            {/* Content */}
            {loading ? (
              <div className="loading">
                <div className="loading-spinner" />
                <span className="loading-text">記事を読み込み中...</span>
              </div>
            ) : articles.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <h3>記事が見つかりません</h3>
                <p>選択されたカテゴリまたは検索条件に一致する記事がありませんでした。</p>
              </div>
            ) : (
              <>
                <div className="articles-grid">
                  {articles.map((article) => (
                    <ArticleCard
                      key={article.id || article.url}
                      article={article}
                      formatDate={formatDate}
                      onToggleFavorite={handleFavoriteToggle}
                      badgeClass={BADGE_CLASSES[article.category] || ''}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="pagination">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                    >
                      ← 前へ
                    </button>
                    <span className="page-info">
                      {page} / {totalPages} ページ
                    </span>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                    >
                      次へ →
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Fusion Radiation © {new Date().getFullYear()} - AI-powered Information Aggregator</p>
      </footer>
    </div>
  );
}

// YouTube動画はURLからサムネイルを直接導出できる（thumbnail_url未登録の古い記事対策）
function getThumbnail(article) {
  if (article.thumbnail_url) return article.thumbnail_url;
  const match = (article.url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  return match ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : null;
}

function ArticleCard({ article, formatDate, onToggleFavorite, badgeClass }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const thumbnail = getThumbnail(article);

  const handleToggle = (e) => {
    e.stopPropagation(); // リンクへの遷移を防ぐ
    setIsExpanded(!isExpanded);
  };

  return (
    <article
      className={`article-card ${isExpanded ? 'expanded' : ''}`}
      onClick={() => window.open(article.url, '_blank')}
    >
      <div className="article-card-body">
        <div className="article-card-meta">
          <span className={`article-category-badge ${badgeClass}`}>
            {article.category}
          </span>
          <span className="article-source">{article.source_name}</span>
        </div>

        <h2 className="article-card-title">{article.title}</h2>

        {thumbnail && (
          <img
            className="article-card-thumbnail"
            src={thumbnail}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}

        {article.summary && (
          <div className="summary-container">
            <button 
              className="summary-toggle-btn"
              onClick={handleToggle}
              aria-expanded={isExpanded}
            >
              <span className="toggle-icon">{isExpanded ? '📖' : '📘'}</span>
              AI詳細要約 {isExpanded ? 'を閉じる ▴' : 'を読む ▾'}
            </button>
            
            <div className={`article-card-summary-wrapper ${isExpanded ? 'open' : ''}`}>
              <div className="article-card-summary">
                {/* 改行対応（\nや改行文字を<br>に変換） */}
                {article.summary.split(/\\n|\n/).map((line, i) => (
                  <span key={i}>{line}<br/></span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="article-card-footer">
          <span className="article-date">
            {formatDate(article.published_at)}
          </span>
          <button 
            className={`favorite-btn ${article.is_favorite ? 'is-fav' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(article.id, !!article.is_favorite);
            }}
            title={article.is_favorite ? 'お気に入りから外す' : 'お気に入りに追加'}
          >
            {article.is_favorite ? '🌟' : '☆'}
          </button>
        </div>
      </div>
    </article>
  );
}

// ==========================================
// ソース管理コンポーネント
// ==========================================
function SourceManager({ CATEGORIES }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', url: '', type: 'rss', category: 'AI' });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadSources = async () => {
    setLoading(true);
    const data = await fetchSources();
    setSources(data);
    setLoading(false);
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!form.name || !form.url) {
      setErrorMsg('サイト名とURLを入力してください');
      return;
    }

    const { error } = await addSource({ ...form, is_active: true });
    
    if (error) {
      setErrorMsg(error.message || '追加に失敗しました');
    } else {
      setSuccessMsg('ソースを追加しました！');
      setForm({ ...form, name: '', url: '' });
      loadSources();
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`「${name}」を削除してもよろしいですか？`)) return;
    const { error } = await deleteSource(id);
    if (!error) loadSources();
  };

  const handleToggle = async (id, currentStatus) => {
    const { error } = await toggleSource(id, currentStatus);
    if (!error) loadSources();
  };

  const validCategories = CATEGORIES.filter(c => c.name !== 'すべて');

  return (
    <div className="source-manager">
      <div className="source-header">
        <h2>⚙️ 情報ソース管理</h2>
        <p>RSSフィードやYouTubeチャンネルを登録すると、毎朝自動で記事を収集・要約します。</p>
      </div>

      <div className="source-card form-card">
        <h3>➕ 新しいソースを追加</h3>
        
        {errorMsg && <div className="alert error">{errorMsg}</div>}
        {successMsg && <div className="alert success">{successMsg}</div>}

        <form onSubmit={handleSubmit} className="source-form">
          <div className="form-group row">
            <div className="form-col">
              <label>種類</label>
              <select 
                value={form.type} 
                onChange={(e) => setForm({...form, type: e.target.value})}
              >
                <option value="rss">RSS / Atom フィード</option>
                <option value="youtube">YouTubeチャンネル</option>
                <option value="scrape">Webスクレイピング</option>
              </select>
            </div>
            <div className="form-col">
              <label>ジャンル（カテゴリ）</label>
              <select 
                value={form.category} 
                onChange={(e) => setForm({...form, category: e.target.value})}
              >
                {validCategories.map(c => (
                  <option value={c.name} key={c.name}>{c.emoji} {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group row">
            <div className="form-col">
              <label>サイト名 / チャンネル名</label>
              <input 
                type="text" 
                placeholder="例: Tech Blog" 
                value={form.name}
                onChange={(e) => setForm({...form, name: e.target.value})}
              />
            </div>
            <div className="form-col">
              <label>{form.type === 'youtube' ? 'YouTube チャンネルID' : 'URL (RSS または Webサイト)'}</label>
              <input 
                type="text" 
                placeholder={form.type === 'youtube' ? "例: UCOK..." : "https://..."}
                value={form.url}
                onChange={(e) => setForm({...form, url: e.target.value})}
              />
            </div>
          </div>

          <button type="submit" className="submit-btn">追加する</button>
        </form>
      </div>

      <div className="source-list">
        <h3>📋 登録済みのソース ({sources.length}件)</h3>
        
        {loading ? (
          <p className="loading-text">読み込み中...</p>
        ) : sources.length === 0 ? (
          <p className="empty-text">ソースが登録されていません</p>
        ) : (
          <div className="table-responsive">
            <table className="source-table">
              <thead>
                <tr>
                  <th>状態</th>
                  <th>名前</th>
                  <th>カテゴリ</th>
                  <th>種類</th>
                  <th>URL / ID</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  <tr key={s.id} className={!s.is_active ? 'inactive' : ''}>
                    <td>
                      <button 
                        className={`toggle-btn ${s.is_active ? 'active' : ''}`}
                        onClick={() => handleToggle(s.id, s.is_active)}
                        title={s.is_active ? '無効にする' : '有効にする'}
                      >
                        {s.is_active ? '🟢 有効' : '⚫ 無効'}
                      </button>
                    </td>
                    <td><strong>{s.name}</strong></td>
                    <td><span className={`article-category-badge ${BADGE_CLASSES[s.category] || ''}`}>{s.category}</span></td>
                    <td><span className="type-badge">{s.type.toUpperCase()}</span></td>
                    <td className="url-cell">{s.url}</td>
                    <td>
                      <button 
                        className="delete-btn"
                        onClick={() => handleDelete(s.id, s.name)}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

// trigger redeploy

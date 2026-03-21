-- Fusion Radiation データベーススキーマ
-- Supabase (PostgreSQL) 用

-- 情報ソース管理テーブル
CREATE TABLE IF NOT EXISTS sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('rss', 'youtube', 'scrape')),
  category TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 収集記事テーブル
CREATE TABLE IF NOT EXISTS articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  original_content TEXT,
  summary TEXT,
  category TEXT NOT NULL,
  importance INTEGER DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  thumbnail_url TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  is_notified BOOLEAN DEFAULT false
);

-- ダイジェスト送信履歴
CREATE TABLE IF NOT EXISTS digest_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  article_count INTEGER NOT NULL,
  categories TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_collected_at ON articles(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_is_notified ON articles(is_notified);
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);

-- Row Level Security (RLS) - Webダッシュボードからの読み取り用
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_logs ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザー（Webダッシュボード）に読み取りを許可
CREATE POLICY "Allow anonymous read access on articles"
  ON articles FOR SELECT
  USING (true);

CREATE POLICY "Allow anonymous read access on digest_logs"
  ON digest_logs FOR SELECT
  USING (true);

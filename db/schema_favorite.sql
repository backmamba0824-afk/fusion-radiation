-- 1. articles テーブルにお気に入りフラグを追加
ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- 2. 匿名ユーザー（Webダッシュボードの閲覧者）がお気に入り状態を更新できるようにする
CREATE POLICY "Allow anonymous update on articles is_favorite"
  ON articles
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

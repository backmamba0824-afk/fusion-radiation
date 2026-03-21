-- 情報ソース（sources）テーブルのアクセス権限をWebダッシュボードに開放するSQL

-- 一旦既存のポリシーがあれば削除
DROP POLICY IF EXISTS "Allow anonymous read access on sources" ON sources;
DROP POLICY IF EXISTS "Allow anonymous all access on sources" ON sources;

-- RLS（Row Level Security）を有効化
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

-- anonキー（Webダッシュボード）から、ソースの読み取り・追加・更新・削除をすべて許可
CREATE POLICY "Allow anonymous all access on sources"
  ON sources FOR ALL
  USING (true)
  WITH CHECK (true);

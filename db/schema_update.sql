-- RLSポリシーの修正用SQL

-- 既存のSELECT専用ポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "Allow anonymous read access on articles" ON articles;
DROP POLICY IF EXISTS "Allow anonymous read access on digest_logs" ON digest_logs;

-- anonキーですべての操作（SELECT, INSERT, UPDATE, DELETE）を許可するポリシーを作成
CREATE POLICY "Allow anonymous all access on articles"
  ON articles FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous all access on digest_logs"
  ON digest_logs FOR ALL
  USING (true)
  WITH CHECK (true);

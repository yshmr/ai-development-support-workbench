# フロントエンドキャッシュガイドライン

## 概要

プロフィール画像や静的メディアURLを画面へ反映する際のキャッシュ方針である。この文書は公開可能なsynthetic guidelineである。

## プロフィール画像の即時反映

### 最新URLの利用

プロフィール画像更新APIが返すlatest image URLを、クライアントのユーザー状態へ即時反映する。ページ全体のreloadを前提にしない。

### Cache busting

同じURLを再利用するとブラウザやCDNのimage cacheにより古い画像が見える場合がある。`profileImageVersion` をquery parameterへ付与するか、versioned URLを返す。

### ETag

ETagを使う場合でも、更新直後のUIではlatest image URLまたはversioned URLを優先する。ユーザーが変更完了直後に古い画像を見る体験を避ける。

## 注意事項

複数端末で同時にプロフィール画像を表示している場合、別端末への反映はリアルタイム同期を保証しない。必要に応じて次回取得時に最新URLを反映する。

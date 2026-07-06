# プロフィールAPI仕様

## 概要

Workbench Profile のプロフィール画像アップロードAPI仕様である。この文書は公開用のsynthetic corpusである。

## Endpoint

### プロフィール画像アップロード

`POST /api/profile/image` はログイン中ユーザーのプロフィール画像を更新する。requestは `multipart/form-data` を使用し、画像ファイルは `image` fieldに設定する。

## 成功レスポンス

成功時はHTTP 200を返す。response bodyには `profileImageUrl` と `profileImageVersion` を含める。

`profileImageUrl` は最新画像を指すURLであり、フロントエンドはこの値を画面状態に反映する。`profileImageVersion` はキャッシュ更新や表示確認に利用できる。

## エラーレスポンス

### Validation error

ファイルサイズ超過、未対応形式、画像実体検証失敗はHTTP 400で返す。エラーコードは `file_too_large`、`unsupported_format`、`invalid_image_content` を使用する。

### Server error

ストレージ保存失敗や想定外例外はHTTP 500として扱う。ユーザー向けには内部例外詳細を返さず、再試行可能な一般メッセージを返す。

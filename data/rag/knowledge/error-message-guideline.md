# エラーメッセージガイドライン

## 概要

Workbench Profile のユーザー向けエラーメッセージ方針である。この文書はsynthetic corpusである。

## 基本方針

### 行動可能な文言

ユーザーに表示するメッセージは、何が起きたかと次に何をすればよいかが分かる文言にする。

### 内部例外を表示しない

stack trace、storage bucket名、内部API名、認証header、例外詳細はuser-facing messageに表示しない。

## プロフィール画像アップロード

### Validation error

5MBを超える場合は「画像サイズは5MB以下にしてください。」と表示する。JPG/PNG以外の場合は「JPGまたはPNG形式の画像を選択してください。」と表示する。

画像実体検証に失敗した場合は「画像ファイルを確認して、もう一度選択してください。」と表示する。

### Network error

通信失敗や一時的なserver errorでは「画像を更新できませんでした。時間をおいて再度お試しください。」と表示する。

## Retryability

validation errorはユーザーが入力を修正するまで再試行しても成功しない。network errorや一時的なserver errorは再試行可能として扱う。

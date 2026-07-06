# 検索フィルター仕様

## 概要

Workbench Search の検索結果フィルター機能に関するsynthetic specificationである。プロフィール画像とは無関係なdistractor sourceとして利用する。

## ステータスフィルター

### 対応ステータス

検索結果は `open`、`in_progress`、`resolved`、`archived` のステータスで絞り込める。複数ステータスを同時に選択できる。

### URL query

選択中のステータスはURL query parameter `status` に反映する。複数選択時はcomma separated valueとして保持する。

## 並び順

検索結果の初期並び順は関連度順である。ユーザーは更新日時順へ切り替えられるが、ステータスフィルターとの組み合わせでも結果件数が0件の場合は空状態を表示する。

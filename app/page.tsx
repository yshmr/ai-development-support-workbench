"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { GenerationOutput, GenerationRecord, JiraTaskType } from "@/lib/schema";

type GeneratedResponse = GenerationOutput & {
  id: string;
  promptVersion: string;
  modelName: string;
  createdAt: string;
};

const sampleInput = `ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。`;

const taskTypeLabels: Record<JiraTaskType, string> = {
  frontend: "Frontend",
  backend: "Backend",
  test: "Test",
  documentation: "Docs"
};

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="result-block">
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function ResultView({
  output,
  meta
}: {
  output: GenerationOutput;
  meta?: Pick<GenerationRecord, "modelName" | "promptVersion" | "createdAt">;
}) {
  return (
    <div className="result-grid">
      <section className="summary-panel">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>要約</h2>
        </div>
        <p>{output.summary}</p>
        {meta ? (
          <dl className="meta-list">
            <div>
              <dt>Model</dt>
              <dd>{meta.modelName}</dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>{meta.promptVersion}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(meta.createdAt).toLocaleString("ja-JP")}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <ListSection title="仕様" items={output.spec} />
      <ListSection title="受け入れ条件" items={output.acceptanceCriteria} />

      <section className="result-block jira-block">
        <h3>Jiraチケット</h3>
        <div className="task-list">
          {output.jiraTasks.map((task, index) => (
            <article key={`${task.title}-${index}`} className="task-item">
              <span className={`task-badge ${task.type}`}>
                {taskTypeLabels[task.type]}
              </span>
              <h4>{task.title}</h4>
              <p>{task.description}</p>
            </article>
          ))}
        </div>
      </section>

      <ListSection title="実装方針" items={output.implementationPlan} />
      <ListSection title="レビュー観点" items={output.reviewPoints} />
      <ListSection title="リスク・確認事項" items={output.risks} />
    </div>
  );
}

export default function Home() {
  const [inputText, setInputText] = useState(sampleInput);
  const [result, setResult] = useState<GeneratedResponse | null>(null);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const selectedHistory = useMemo(
    () => history.find((record) => record.id === selectedHistoryId) ?? null,
    [history, selectedHistoryId]
  );

  async function loadHistory() {
    setIsHistoryLoading(true);
    try {
      const response = await fetch("/api/generations", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "履歴の取得に失敗しました。");
      }

      setHistory(data.generations ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "履歴の取得に失敗しました。"
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!inputText.trim()) {
      setError("要件メモを入力してください。");
      return;
    }

    setIsLoading(true);
    setSelectedHistoryId(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputText })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "生成に失敗しました。");
      }

      setResult(data);
      await loadHistory();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "生成に失敗しました。"
      );
    } finally {
      setIsLoading(false);
    }
  }

  const activeOutput = selectedHistory?.output ?? result;
  const activeMeta = selectedHistory
    ? {
        modelName: selectedHistory.modelName,
        promptVersion: selectedHistory.promptVersion,
        createdAt: selectedHistory.createdAt
      }
    : result
      ? {
          modelName: result.modelName,
          promptVersion: result.promptVersion,
          createdAt: result.createdAt
        }
      : undefined;

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">LLM App PoC</p>
          <h1>要件メモを開発チケットへ整える</h1>
          <p className="lead">
            仕様、受け入れ条件、Jira風タスク、レビュー観点をJSONスキーマで安定化して生成します。
          </p>
        </div>
      </header>

      <div className="workspace">
        <section className="input-pane" aria-labelledby="input-heading">
          <div className="pane-heading">
            <div>
              <p className="eyebrow">Input</p>
              <h2 id="input-heading">要件メモ</h2>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setInputText(sampleInput)}
            >
              サンプル
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <textarea
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              placeholder="実現したい機能や制約、失敗時の挙動を入力してください。"
              aria-label="要件メモ"
            />
            {error ? <p className="error-message">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? "生成中..." : "生成する"}
            </button>
          </form>
        </section>

        <aside className="history-pane" aria-labelledby="history-heading">
          <div className="pane-heading">
            <div>
              <p className="eyebrow">History</p>
              <h2 id="history-heading">生成履歴</h2>
            </div>
            <button className="ghost-button" type="button" onClick={loadHistory}>
              更新
            </button>
          </div>

          {isHistoryLoading ? <p className="empty-text">読み込み中...</p> : null}
          {!isHistoryLoading && history.length === 0 ? (
            <p className="empty-text">まだ履歴はありません。</p>
          ) : null}
          <div className="history-list">
            {history.map((record) => (
              <button
                key={record.id}
                className={
                  selectedHistoryId === record.id
                    ? "history-item active"
                    : "history-item"
                }
                type="button"
                onClick={() => setSelectedHistoryId(record.id)}
              >
                <span>{record.output.summary}</span>
                <time>{new Date(record.createdAt).toLocaleString("ja-JP")}</time>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <section className="output-pane" aria-live="polite">
        <div className="pane-heading">
          <div>
            <p className="eyebrow">Output</p>
            <h2>{selectedHistory ? "履歴詳細" : "生成結果"}</h2>
          </div>
        </div>

        {activeOutput ? (
          <ResultView output={activeOutput} meta={activeMeta} />
        ) : (
          <p className="empty-output">
            要件メモを送信すると、構造化された開発アウトプットがここに表示されます。
          </p>
        )}
      </section>
    </main>
  );
}

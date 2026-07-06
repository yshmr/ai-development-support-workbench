"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  GenerationOutput,
  GenerationRecord,
  JiraTaskType,
  RagContextPolicy,
  RagMetadata,
  RagMode,
  RagSource
} from "@/lib/schema";

type GeneratedResponse = GenerationOutput & {
  id: string;
  provider: GenerationRecord["provider"];
  promptVersion: string;
  modelName: string;
  createdAt: string;
  providerLatencyMs?: number;
  serverProcessingMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  clientElapsedMs?: number;
  rag?: RagMetadata;
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

const ragContextPolicyLabels: Record<RagContextPolicy, string> = {
  "raw-top-k-v1": "Baseline",
  "document-cap-v1": "Document cap",
  "document-diversity-v1": "Document diversity"
};

const ragContextPolicyHelp: Record<RagContextPolicy, string> = {
  "raw-top-k-v1": "Semantic Top 5をそのまま使用",
  "document-cap-v1":
    "Semantic Top 10から同一document最大2 chunksで最大5件選択",
  "document-diversity-v1":
    "Semantic Top 10からdocument diversityを優先し、各documentの最初のchunkを確保した後、最大2 chunks/documentで最大5件を構成"
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

function formatDuration(ms?: number) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    return "N/A";
  }

  return `${(ms / 1000).toFixed(1)} s`;
}

function formatNumber(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return value.toLocaleString("ja-JP");
}

function formatScore(value: number) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return value.toFixed(3);
}

function SourceList({ sources }: { sources: RagSource[] }) {
  return (
    <section className="result-block source-block">
      <h3>Retrieved Sources</h3>
      <div className="source-list">
        {sources.map((source) => (
          <details key={source.sourceId} className="source-item">
            <summary>
              <span className="source-id">{source.sourceId}</span>
              <span className="source-title">{source.documentTitle}</span>
              <span className="source-score">score {formatScore(source.score)}</span>
            </summary>
            <dl className="source-meta">
              <div>
                <dt>Context rank</dt>
                <dd>{source.contextRank ?? source.rank}</dd>
              </div>
              <div>
                <dt>Retrieval rank</dt>
                <dd>{source.retrievalRank ?? source.rank}</dd>
              </div>
              <div>
                <dt>Score</dt>
                <dd>{formatScore(source.score)}</dd>
              </div>
              <div>
                <dt>Chunk</dt>
                <dd>{source.chunkId}</dd>
              </div>
              <div>
                <dt>Document</dt>
                <dd>{source.documentId}</dd>
              </div>
              <div>
                <dt>Section</dt>
                <dd>{source.headingPath.length > 0 ? source.headingPath.join(" > ") : "N/A"}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{source.sourcePath}</dd>
              </div>
            </dl>
            <p className="source-content">{source.content}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function ResultView({
  output,
  meta
}: {
  output: GenerationOutput;
  meta?: Pick<
    GenerationRecord,
    | "provider"
    | "modelName"
    | "promptVersion"
    | "createdAt"
    | "providerLatencyMs"
    | "serverProcessingMs"
    | "inputTokens"
    | "outputTokens"
    | "totalTokens"
    | "rag"
  > & {
    clientElapsedMs?: number;
  };
}) {
  const rag = meta?.rag ?? { mode: "off" as const };
  const contextPolicyLabel =
    rag.mode === "on"
      ? rag.contextPolicy ?? "legacy raw Top-K"
      : undefined;

  return (
    <div className="result-grid">
      <section className="summary-panel">
        <div className="summary-content">
          <p className="eyebrow">Summary</p>
          <h2>要約</h2>
          <p>{output.summary}</p>
        </div>
        {meta ? (
          <dl className="meta-list">
            <div>
              <dt>Provider</dt>
              <dd>{meta.provider}</dd>
            </div>
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
            <div>
              <dt>Provider latency</dt>
              <dd>{formatDuration(meta.providerLatencyMs)}</dd>
            </div>
            <div>
              <dt>Server processing</dt>
              <dd>{formatDuration(meta.serverProcessingMs)}</dd>
            </div>
            <div>
              <dt>Client elapsed</dt>
              <dd>{formatDuration(meta.clientElapsedMs)}</dd>
            </div>
            <div>
              <dt>Input tokens</dt>
              <dd>{formatNumber(meta.inputTokens)}</dd>
            </div>
            <div>
              <dt>Output tokens</dt>
              <dd>{formatNumber(meta.outputTokens)}</dd>
            </div>
            <div>
              <dt>Total tokens</dt>
              <dd>{formatNumber(meta.totalTokens)}</dd>
            </div>
            <div>
              <dt>RAG</dt>
              <dd>{rag.mode === "on" ? "ON" : "OFF"}</dd>
            </div>
            {rag.mode === "on" ? (
              <>
                <div>
                  <dt>Strategy</dt>
                  <dd>{rag.strategy}</dd>
                </div>
                <div>
                  <dt>Context policy</dt>
                  <dd>{contextPolicyLabel}</dd>
                </div>
                <div>
                  <dt>Top K</dt>
                  <dd>{rag.topK}</dd>
                </div>
                {rag.candidateTopK ? (
                  <div>
                    <dt>Candidate Top K</dt>
                    <dd>{rag.candidateTopK}</dd>
                  </div>
                ) : null}
                {typeof rag.candidateChunkCount === "number" ? (
                  <div>
                    <dt>Candidate chunks</dt>
                    <dd>{rag.candidateChunkCount}</dd>
                  </div>
                ) : null}
                {typeof rag.candidateUniqueDocumentCount === "number" ? (
                  <div>
                    <dt>Candidate unique docs</dt>
                    <dd>{rag.candidateUniqueDocumentCount}</dd>
                  </div>
                ) : null}
                {rag.requestedFinalTopK ? (
                  <div>
                    <dt>Final Top K</dt>
                    <dd>{rag.requestedFinalTopK}</dd>
                  </div>
                ) : null}
                {rag.maxChunksPerDocument ? (
                  <div>
                    <dt>Max chunks / doc</dt>
                    <dd>{rag.maxChunksPerDocument}</dd>
                  </div>
                ) : null}
                {typeof rag.selectedChunkCount === "number" ? (
                  <div>
                    <dt>Selected chunks</dt>
                    <dd>{rag.selectedChunkCount}</dd>
                  </div>
                ) : null}
                {typeof rag.uniqueDocumentCount === "number" ? (
                  <div>
                    <dt>Selected unique docs</dt>
                    <dd>{rag.uniqueDocumentCount}</dd>
                  </div>
                ) : null}
                {typeof rag.maximumChunksFromSameDocument === "number" ? (
                  <div>
                    <dt>Max selected / doc</dt>
                    <dd>{rag.maximumChunksFromSameDocument}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Retrieval</dt>
                  <dd>{formatDuration(rag.retrievalLatencyMs)}</dd>
                </div>
                <div>
                  <dt>Embedding</dt>
                  <dd>{rag.embeddingModel}</dd>
                </div>
                {rag.embeddingUsage?.promptTokens ? (
                  <div>
                    <dt>Embedding tokens</dt>
                    <dd>{formatNumber(rag.embeddingUsage.promptTokens)}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
          </dl>
        ) : null}
      </section>

      {rag.mode === "on" ? <SourceList sources={rag.sources} /> : null}

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
  const [ragMode, setRagMode] = useState<RagMode>("off");
  const [ragContextPolicy, setRagContextPolicy] =
    useState<RagContextPolicy>("raw-top-k-v1");
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
    const clientStartedAt = performance.now();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputText, ragMode, ragContextPolicy })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "生成に失敗しました。");
      }

      setResult({
        ...data,
        clientElapsedMs: Math.max(0, Math.round(performance.now() - clientStartedAt))
      });
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
        provider: selectedHistory.provider,
        modelName: selectedHistory.modelName,
        promptVersion: selectedHistory.promptVersion,
        createdAt: selectedHistory.createdAt,
        providerLatencyMs: selectedHistory.providerLatencyMs,
        serverProcessingMs: selectedHistory.serverProcessingMs,
        inputTokens: selectedHistory.inputTokens,
        outputTokens: selectedHistory.outputTokens,
        totalTokens: selectedHistory.totalTokens,
        rag: selectedHistory.rag
      }
    : result
      ? {
          provider: result.provider,
          modelName: result.modelName,
          promptVersion: result.promptVersion,
          createdAt: result.createdAt,
          providerLatencyMs: result.providerLatencyMs,
          serverProcessingMs: result.serverProcessingMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          rag: result.rag,
          clientElapsedMs: result.clientElapsedMs
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
            <div className="rag-control" aria-label="RAG mode">
              <div>
                <p className="control-label">RAG</p>
                <p className="control-help">
                  heading-aware-v1 / Top 5
                </p>
              </div>
              <div className="segmented-control">
                <button
                  className={ragMode === "off" ? "segment active" : "segment"}
                  type="button"
                  onClick={() => setRagMode("off")}
                >
                  OFF
                </button>
                <button
                  className={ragMode === "on" ? "segment active" : "segment"}
                  type="button"
                  onClick={() => setRagMode("on")}
                >
                  ON
                </button>
              </div>
            </div>
            {ragMode === "on" ? (
              <fieldset className="policy-control">
                <legend>Context policy</legend>
                <div className="policy-options">
                  {(
                    [
                      "raw-top-k-v1",
                      "document-cap-v1",
                      "document-diversity-v1"
                    ] as RagContextPolicy[]
                  ).map((policy) => (
                    <label
                      key={policy}
                      className={
                        ragContextPolicy === policy
                          ? "policy-option active"
                          : "policy-option"
                      }
                    >
                      <input
                        type="radio"
                        name="ragContextPolicy"
                        value={policy}
                        checked={ragContextPolicy === policy}
                        onChange={() => setRagContextPolicy(policy)}
                      />
                      <span>{ragContextPolicyLabels[policy]}</span>
                      <small>{policy}</small>
                      <small>{ragContextPolicyHelp[policy]}</small>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
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
                <span className={record.rag?.mode === "on" ? "history-rag on" : "history-rag"}>
                  RAG {record.rag?.mode === "on" ? "ON" : "OFF"}
                </span>
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

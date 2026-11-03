import type { editor as MonacoEditor } from "monaco-editor";

export type DocumentSnapshot = {
  id: string;
  content: string;
  revision: number;
  acknowledgedRevision: number;
  saving: boolean;
  dirty: boolean;
  error: string | null;
};

type Entry = {
  id: string;
  principal: string;
  content: string;
  revision: number;
  acknowledgedRevision: number;
  saving: boolean;
  error: string | null;
  leases: number;
  revoked: boolean;
  writer: (value: string) => Promise<void>;
  inFlight: Promise<void> | null;
  listeners: Set<(snapshot: DocumentSnapshot) => void>;
  model: MonacoEditor.ITextModel | null;
};

/**
 * One authority per (principal, repository-session, source path).
 * Working drafts are committed through the existing workspace writer/IndexedDB
 * overlay, never through a second shadow writer. No unsaved draft is advertised
 * as durable until the underlying transaction has acknowledged completion.
 */
export class DocumentService {
  private principal: string | null = null;
  private readonly entries = new Map<string, Entry>();

  bindPrincipal(principal: string): void {
    if (this.principal === principal) return;
    for (const entry of this.entries.values()) {
      entry.revoked = true;
      entry.listeners.clear();
      entry.model?.dispose();
    }
    this.entries.clear();
    this.principal = principal;
  }

  acquire(
    id: string,
    principal: string,
    initial: string,
    writer: (value: string) => Promise<void>,
  ): DocumentSnapshot {
    if (!this.principal || this.principal !== principal || !id ||
        !id.includes(encodeURIComponent(principal))) {
      throw new Error("Document principal is no longer authorized.");
    }
    let entry = this.entries.get(id);
    if (!entry) {
      entry = {
        id, principal, content: initial, revision: 0, acknowledgedRevision: 0,
        saving: false, error: null, leases: 0, revoked: false, writer,
        inFlight: null, listeners: new Set(), model: null,
      };
      this.entries.set(id, entry);
    }
    if (entry.revoked) throw new Error("Document session revoked.");
    entry.writer = writer;
    entry.leases += 1;
    return this.snapshotEntry(entry);
  }

  release(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.leases = Math.max(0, entry.leases - 1);
    this.disposeIfIdle(entry);
  }

  private disposeIfIdle(entry: Entry): void {
    if (entry.leases || entry.inFlight || entry.revision !== entry.acknowledgedRevision)
      return;
    entry.model?.dispose();
    entry.model = null;
    this.entries.delete(entry.id);
  }

  attachModel(id: string, model: MonacoEditor.ITextModel | null): void {
    const entry = this.entries.get(id);
    if (!entry || !model || entry.revoked) return;
    // Monaco reuses the same URI/model for multiple editor views.
    // Never replace an existing live model with a competing copy.
    if (entry.model && entry.model !== model && !entry.model.isDisposed()) {
      throw new Error("Conflicting Monaco models for the same document resource.");
    }
    entry.model = model;
  }

  subscribe(id: string, listener: (snapshot: DocumentSnapshot) => void): () => void {
    const entry = this.entries.get(id);
    if (!entry) return () => {};
    entry.listeners.add(listener);
    listener(this.snapshotEntry(entry));
    return () => entry.listeners.delete(listener);
  }

  snapshot(id: string): DocumentSnapshot | null {
    const entry = this.entries.get(id);
    return entry ? this.snapshotEntry(entry) : null;
  }

  private snapshotEntry(entry: Entry): DocumentSnapshot {
    return {
      id: entry.id, content: entry.content, revision: entry.revision,
      acknowledgedRevision: entry.acknowledgedRevision, saving: entry.saving,
      dirty: entry.revision !== entry.acknowledgedRevision, error: entry.error,
    };
  }

  private notify(entry: Entry): void {
    const value = this.snapshotEntry(entry);
    for (const listener of entry.listeners) listener(value);
  }

  /** Synchronously retain edits before scheduling serial durable writes. */
  edit(id: string, content: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.revoked || entry.principal !== this.principal)
      return Promise.reject(new Error("Document authority revoked during edit."));
    if (entry.content !== content) {
      entry.content = content;
      entry.revision += 1;
      entry.error = null;
      this.notify(entry);
    }
    return this.flush(id);
  }

  flush(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.revoked || entry.principal !== this.principal)
      return Promise.reject(new Error("Document authority revoked during save."));
    if (entry.inFlight) return entry.inFlight;
    if (entry.revision === entry.acknowledgedRevision) return Promise.resolve();
    entry.inFlight = this.writeUntilCurrent(entry).finally(() => {
      entry.inFlight = null;
      this.disposeIfIdle(entry);
    });
    return entry.inFlight;
  }

  private async writeUntilCurrent(entry: Entry): Promise<void> {
    entry.saving = true;
    this.notify(entry);
    try {
      while (entry.revision !== entry.acknowledgedRevision) {
        if (entry.revoked || entry.principal !== this.principal)
          throw new Error("Document authority revoked before save.");
        const revision = entry.revision;
        const content = entry.content;
        await entry.writer(content);
        if (entry.revoked || entry.principal !== this.principal)
          throw new Error("Document authority revoked after save.");
        entry.acknowledgedRevision = revision;
        this.notify(entry);
      }
      entry.error = null;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      entry.saving = false;
      this.notify(entry);
    }
  }

  /** Any unacknowledged bytes or save errors block destructive transitions. */
  hasUnacknowledgedChanges(): boolean {
    for (const entry of this.entries.values()) {
      if (entry.revision !== entry.acknowledgedRevision || entry.saving || entry.error)
        return true;
    }
    return false;
  }

  assertSafeToNavigate(): void {
    if (this.hasUnacknowledgedChanges()) {
      throw new Error(
        "Document changes are not durably acknowledged. Retry the save before navigating.",
      );
    }
  }
}

export const documentService = new DocumentService();

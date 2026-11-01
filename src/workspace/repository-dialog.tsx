import { useEffect, useState } from "react";
import { LogIn, X } from "lucide-react";
import {
  beginGithubSignIn,
  getGithubAuthConfiguration,
  getGithubAuthResult,
  type GithubAuthResult,
} from "@/github/auth";
import { useWorkspace } from "./context";
import { downloadText } from "./export";
import type { WorkspaceSnapshot } from "./model";
import { exportLegacyQuarantine, importLegacyQuarantine, listUnattributedWorkspaces } from "./storage";

export function RepositoryDialog() {
  const workspace = useWorkspace();
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [authResult, setAuthResult] = useState<GithubAuthResult>(() => getGithubAuthResult());
  const authConfig = getGithubAuthConfiguration();
  const [legacyVisible, setLegacyVisible] = useState(false);
  const [legacy, setLegacy] = useState<WorkspaceSnapshot[]>([]);
  const [confirmedLegacyId, setConfirmedLegacyId] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace.dialogOpen) {
      setInput("");
      setLocalError(null);
      setLegacyVisible(false);
      setLegacy([]);
      setConfirmedLegacyId(null);
      return;
    }
    setAuthResult(getGithubAuthResult());
    const handleAuth = (event: Event) => {
      const detail = (event as CustomEvent<GithubAuthResult>).detail;
      setAuthResult(detail ?? getGithubAuthResult());
    };
    window.addEventListener("workbench-github-auth", handleAuth);
    return () => window.removeEventListener("workbench-github-auth", handleAuth);
  }, [workspace.dialogOpen]);

  if (!workspace.dialogOpen) return null;

  const open = async (value: string) => {
    setLocalError(null);
    try {
      await workspace.openRepository(value);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const signIn = async () => {
    setLocalError(null);
    try {
      await beginGithubSignIn();
      setAuthResult(getGithubAuthResult());
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const reviewLegacy = async () => {
    setLocalError(null);
    try {
      setLegacy(await listUnattributedWorkspaces());
      setLegacyVisible(true);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const exportLegacy = async () => {
    setLocalError(null);
    try {
      const archive = await exportLegacyQuarantine();
      downloadText(archive, "ghcode-legacy-recovery.json", "application/json;charset=utf-8");
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const importLegacy = async (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    try {
      await importLegacyQuarantine(await file.text());
      await reviewLegacy();
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const recoverLegacy = async (id: string) => {
    setLocalError(null);
    try {
      if (confirmedLegacyId !== id) throw new Error("Confirm the historical data belongs to you.");
      await workspace.recoverLegacy(id);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <div className="workspace-dialog-backdrop" role="presentation">
      <section
        className="workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Open GitHub repository"
      >
        <header>
          <div>
            <strong>Open GitHub Repository</strong>
            <span>Open a repository into a browser-local workspace.</span>
          </div>
          <button
            type="button"
            className="workbench-icon-button"
            onClick={() => workspace.setDialogOpen(false)}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </header>
        <form
          className="workspace-dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            void open(input);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="owner/repository or https://github.com/owner/repository"
            aria-label="Repository"
          />
          <button type="submit" disabled={!input.trim() || workspace.loading}>
            Open
          </button>
        </form>
        {(localError || workspace.error) && (
          <div className="workspace-dialog-error">{localError || workspace.error}</div>
        )}
        <div className="workspace-auth-status status-warning" role="status">
          Historical unattributed v2 data is preserved but never restored automatically across
          accounts. Explicit recovery requires a verified matching repository session.
        </div>
        {(workspace.authPhase === "failed" || workspace.authPhase === "invalidated") && (
          <button type="button" onClick={workspace.signOut}>
            Continue anonymously
          </button>
        )}
        <section className="workspace-dialog-sections">
          <div className="workspace-dialog-section-title">Historical data recovery</div>
          <div className="workspace-github-auth">
            <button type="button" onClick={() => void exportLegacy()}>
              Export preserved v2 backup
            </button>
            <button type="button" onClick={() => void reviewLegacy()}>
              Review unattributed workspaces
            </button>
            <label>
              Import preserved backup
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => void importLegacy(event.currentTarget.files?.[0])}
              />
            </label>
          </div>
          {legacyVisible && (
            <div className="workspace-list">
              {legacy.length === 0 && <p>No valid unattributed workspaces in the recovery archive.</p>}
              {legacy.map((item) => {
                const matching = Boolean(
                  workspace.workspace &&
                  workspace.workspace.repository.id === item.repository.id &&
                  workspace.workspace.ref === item.ref
                );
                return (
                  <div key={item.id} className="workspace-account-row">
                    <div>
                      <strong>{item.repository.fullName}</strong>
                      <small>{item.ref}</small>
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={confirmedLegacyId === item.id}
                        onChange={(event) =>
                          setConfirmedLegacyId(event.currentTarget.checked ? item.id : null)
                        }
                      />
                      I confirm this legacy workspace belongs to me
                    </label>
                    <button
                      type="button"
                      disabled={!matching || confirmedLegacyId !== item.id}
                      onClick={() => void recoverLegacy(item.id)}
                    >
                      Recover into current repository
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {legacyVisible && !workspace.workspace && (
            <p className="workspace-help">
              First open the matching repository and ref through GitHub, then review recovery again.
            </p>
          )}
        </section>
        <div className="workspace-dialog-sections">
          <section>
            <div className="workspace-dialog-section-title">Account</div>
            {workspace.user ? (
              <div className="workspace-account-row">
                <img src={workspace.user.avatar_url} alt="" />
                <span>{workspace.user.login}</span>
                <button type="button" onClick={workspace.signOut}>
                  Sign out
                </button>
              </div>
            ) : (
              <div className="workspace-github-auth">
                <button
                  type="button"
                  className="workspace-github-auth-button"
                  disabled={workspace.loading || !authConfig.configured}
                  onClick={() => void signIn()}
                >
                  <LogIn size={15} />
                  <span>Sign in with GitHub</span>
                </button>
                <p className="workspace-help">
                  Continue on GitHub to authorize this workbench. The returned credential is kept
                  only in this browser session and is cleared on sign-out.
                </p>
                {!authConfig.configured && (
                  <div className="workspace-auth-status status-warning">
                    GitHub sign-in is not configured for this deployment. Public repositories remain
                    available anonymously.
                  </div>
                )}
                {authResult.phase !== "signed-out" && authResult.message && (
                  <div className={`workspace-auth-status status-${authResult.phase}`} role="status">
                    {authResult.message}
                  </div>
                )}
              </div>
            )}
          </section>
          {workspace.recent.length > 0 && (
            <section>
              <div className="workspace-dialog-section-title">Recent Workspaces</div>
              <div className="workspace-list">
                {workspace.recent.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      void workspace.openRepository(item.repository.fullName, item.ref)
                    }
                  >
                    <span>{item.repository.fullName}</span>
                    <small>{item.ref}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
          {workspace.repositories.length > 0 && (
            <section>
              <div className="workspace-dialog-section-title">Accessible Repositories</div>
              <div className="workspace-list">
                {workspace.repositories.slice(0, 100).map((repository) => (
                  <button
                    key={repository.id}
                    type="button"
                    onClick={() => void open(repository.full_name)}
                  >
                    <span>{repository.full_name}</span>
                    <small>{repository.private ? "Private" : "Public"}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

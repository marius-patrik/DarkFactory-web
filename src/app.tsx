import { GithubAuthController } from "./github/auth-controller";
import { FactoryProvider } from "./factory/context";
import { RepositoryDialog } from "./workspace/repository-dialog";
import { WorkspaceProvider } from "./workspace/context";
import { WorkbenchShell } from "./workbench/shell";

export function WorkbenchApp() {
  return (
    <WorkspaceProvider>
      <GithubAuthController />
      <FactoryProvider>
        <WorkbenchShell />
      </FactoryProvider>
      <RepositoryDialog />
    </WorkspaceProvider>
  );
}

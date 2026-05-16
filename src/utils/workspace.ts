import * as vscode from 'vscode';

export function normalizeFsPath(fsPath: string): string {
  const normalized = fsPath.replace(/\\/g, '/').replace(/\/+$/g, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function getWorkspacePaths(): string[] {
  return (vscode.workspace.workspaceFolders || []).map((folder) => normalizeFsPath(folder.uri.fsPath));
}

export function isPathRelatedToWorkspaces(targetPath: string, workspacePaths: string[]): boolean {
  if (!targetPath || workspacePaths.length === 0) {
    return true;
  }

  const normalizedTargetPath = normalizeFsPath(targetPath);
  return workspacePaths.some((workspacePath) => {
    return normalizedTargetPath === workspacePath
      || normalizedTargetPath.startsWith(`${workspacePath}/`)
      || workspacePath.startsWith(`${normalizedTargetPath}/`);
  });
}

import { createContext, useContext } from "react";

export const VoidWorkspaceContext = createContext(false);
export function useVoidWorkspace() {
  return useContext(VoidWorkspaceContext);
}

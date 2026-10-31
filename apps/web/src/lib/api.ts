import { queryOptions } from "@tanstack/react-query"
import type { Case, scenarios } from "../domain/model"
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error ?? "Request failed.")
  }
  return response.json()
}
export type Bootstrap = {
  scenarios: typeof scenarios
  role: "customer" | "operator"
  sarvam: boolean
  voice: boolean
  mode: string
  ttsModel: string
  storage: string
}
export const bootstrapOptions = queryOptions({
  queryKey: ["bootstrap"],
  queryFn: () => api<Bootstrap>("bootstrap"),
})
export const chatListOptions = queryOptions({
  queryKey: ["chats"],
  queryFn: () => api<Case[]>("chats"),
  refetchInterval: 3000,
})
export const caseOptions = (id: string) =>
  queryOptions({
    queryKey: ["case", id],
    queryFn: () => api<Case>(`cases/${id}`),
    refetchInterval: 2000,
  })
export const teamOptions = queryOptions({
  queryKey: ["team-cases"],
  queryFn: () => api<Case[]>("admin/cases"),
  retry: false,
  refetchInterval: 3000,
})
export const adminCaseOptions = (id: string) =>
  queryOptions({
    queryKey: ["admin-case", id],
    queryFn: () => api<Case>(`admin/cases/${id}`),
    refetchInterval: 2000,
    retry: false,
  })

export const adminSessionOptions = queryOptions({
  queryKey: ["admin-session"],
  queryFn: () => api<{ role: "customer" | "operator" }>("admin/session"),
  refetchInterval: 3000,
})

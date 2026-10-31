import { createFileRoute } from "@tanstack/react-router"
import { caseOptions } from "@/lib/api"
import { ChatPage } from "@/features/chat"
export const Route = createFileRoute("/customer/chats/$chatId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(caseOptions(params.chatId)),
  component: Page,
})
function Page() {
  const { chatId } = Route.useParams()
  return <ChatPage chatId={chatId} />
}

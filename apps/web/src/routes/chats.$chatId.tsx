import { createFileRoute, redirect } from "@tanstack/react-router"
export const Route = createFileRoute("/chats/$chatId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/customer/chats/$chatId",
      params: { chatId: params.chatId },
      replace: true,
    })
  },
})

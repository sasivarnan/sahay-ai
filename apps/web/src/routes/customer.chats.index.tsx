import { createFileRoute } from "@tanstack/react-router"
import { NewChat } from "@/features/new-chat"
export const Route = createFileRoute("/customer/chats/")({ component: NewChat })

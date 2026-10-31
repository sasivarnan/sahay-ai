import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import css from "../index.css?url"
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Sahay AI · Payment resolution" },
      ],
      links: [{ rel: "stylesheet", href: css }],
    }),
    component: Root,
    errorComponent: ({ error }) => (
      <main className="p-8">
        <h1>Unable to load Sahay AI</h1>
        <p>
          {error instanceof Error ? error.message : "Please reload the page."}
        </p>
        <a href="/">Return to the demo</a>
      </main>
    ),
  }
)
function Root() {
  const { queryClient } = Route.useRouteContext()
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Outlet />
          </TooltipProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}

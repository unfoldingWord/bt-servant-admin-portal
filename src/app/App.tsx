import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";

const queryClient = new QueryClient();

function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <h1 className="text-foreground text-4xl font-bold">
        BT Servant Admin Portal
      </h1>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

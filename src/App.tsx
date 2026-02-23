import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import CallbackPage from "./pages/CallbackPage";
import GuildSelectPage from "./pages/GuildSelectPage";
import MusicPage from "./pages/MusicPage";
import "./index.css";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("music_token");
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/callback" element={<CallbackPage />} />
        <Route
          path="/servers"
          element={
            <RequireAuth>
              <GuildSelectPage />
            </RequireAuth>
          }
        />
        <Route
          path="/music/:guildId"
          element={
            <RequireAuth>
              <MusicPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

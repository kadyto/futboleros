import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Admin from "./Admin";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {["/admin", "/admin/"].includes(window.location.pathname) ? (
      <Admin />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Admin from "./Admin";
import Privacy from "./Privacy";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {["/privacidad", "/privacidad/"].includes(window.location.pathname) ? (
      <Privacy />
    ) : ["/admin", "/admin/"].includes(window.location.pathname) ? (
      <Admin />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);

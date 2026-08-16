import { useState } from "react";
import { fetchHealth, fetchCategories, type Category } from "./api";

type CheckState = "idle" | "loading" | "success" | "error";

function App() {
  const [state, setState] = useState<CheckState>("idle");
  const [online, setOnline] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCheckSystem() {
    setState("loading");
    setErrorMessage("");

    try {
      const health = await fetchHealth();
      const fetchedCategories = await fetchCategories();

      setOnline(health.status === "ok");
      setCategories(fetchedCategories);
      setState("success");
    } catch (err) {
      setOnline(false);
      setCategories([]);
      setErrorMessage("Unable to connect to TokTickIT API");
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 560 }}>
      <h1 className="mb-4">TokTickIT IT Service Desk</h1>

      <button
        className="btn btn-primary mb-4"
        onClick={handleCheckSystem}
        disabled={state === "loading"}
      >
        Check System
      </button>

      {state === "loading" && (
        <p role="status" className="text-muted">
          ⏳ Loading...
        </p>
      )}

      {state === "success" && (
        <div data-testid="system-status">
          <p>
            <strong>System Status:</strong>{" "}
            <span className={online ? "text-success" : "text-danger"}>
              {online ? "Online" : "Offline"}
            </span>
          </p>
          <p className="mb-2">
            <strong>Supported Request Categories:</strong>
          </p>
          <ul>
            {categories.map((category) => (
              <li key={category.id}>{category.name}</li>
            ))}
          </ul>
        </div>
      )}

      {state === "error" && (
        <div className="alert alert-danger" role="alert">
          <p className="mb-1">
            <strong>System Status:</strong> Offline
          </p>
          <p className="mb-0">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}

export default App;

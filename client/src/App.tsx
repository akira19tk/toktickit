// Application shell — Issue #2 + Issue #3
// Routing: selection → home | create-ticket (later: my-tickets)
import { useState } from "react";
import { RequesterProvider, useRequester } from "./context/RequesterContext";
import RequesterSelect from "./components/RequesterSelect";
import CreateTicket from "./components/CreateTicket";
import type { DevRequester } from "./api";

type Screen = "home" | "create";

function AppContent() {
  const { requester, setRequester } = useRequester();
  const [screen, setScreen] = useState<Screen>("home");
  const [showChangePicker, setShowChangePicker] = useState(false);

  if (!requester) {
    return <RequesterSelect onSelect={setRequester} canCancel={false} />;
  }

  function handleChange(r: DevRequester) {
    setRequester(r);
    setShowChangePicker(false);
  }

  function navClass(s: Screen) {
    return `zen-nav-link${screen === s ? " zen-nav-link--active" : ""}`;
  }

  return (
    <>
      <header className="zen-header">
        <div className="zen-header-inner">
          <button
            className="zen-logo-btn"
            onClick={() => setScreen("home")}
            aria-label="TokTickIT home"
          >
            TokTickIT
          </button>

          <nav className="zen-nav" aria-label="Main navigation">
            <button
              className={navClass("home")}
              onClick={() => setScreen("home")}
              aria-current={screen === "home" ? "page" : undefined}
            >
              My Tickets
            </button>
            <button
              className={navClass("create")}
              onClick={() => setScreen("create")}
              aria-current={screen === "create" ? "page" : undefined}
            >
              Create Ticket
            </button>
          </nav>

          <div className="zen-header-right">
            <span className="zen-requester-name" aria-label="Current requester">
              {requester.name}
            </span>
            <button
              className="zen-btn zen-btn-tertiary"
              onClick={() => setShowChangePicker(true)}
            >
              Change Requester
            </button>
          </div>
        </div>
      </header>

      <main className="zen-main" id="main-content">
        {screen === "create" ? (
          <CreateTicket
            requesterId={requester.id}
            onBack={() => setScreen("home")}
          />
        ) : (
          <div className="zen-card zen-welcome">
            <h1 className="zen-section-title">Welcome, {requester.name}</h1>
            <p className="zen-muted" style={{ marginBottom: 24 }}>
              TokTickIT IT Service Desk — select a screen from the navigation.
            </p>
            <button
              className="zen-btn zen-btn-primary"
              onClick={() => setScreen("create")}
            >
              Create Ticket
            </button>
          </div>
        )}
      </main>

      {showChangePicker && (
        <div
          className="zen-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Change Development Requester"
        >
          <RequesterSelect
            onSelect={handleChange}
            canCancel={true}
            onCancel={() => setShowChangePicker(false)}
          />
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <RequesterProvider>
      <AppContent />
    </RequesterProvider>
  );
}

export default App;

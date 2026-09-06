// Application shell — Issue #2: requester context + selection screen
// Redirects to RequesterSelect if no context is set (AC-07).
// Header shows current requester name + Change Requester action (ui-spec §10.1).
import { useState } from "react";
import { RequesterProvider, useRequester } from "./context/RequesterContext";
import RequesterSelect from "./components/RequesterSelect";
import type { DevRequester } from "./api";

function AppContent() {
  const { requester, setRequester } = useRequester();
  const [showChangePicker, setShowChangePicker] = useState(false);

  // No requester yet — show full-page selection (Cancel disabled, no prior context)
  if (!requester) {
    return <RequesterSelect onSelect={setRequester} canCancel={false} />;
  }

  function handleChange(r: DevRequester) {
    setRequester(r);
    setShowChangePicker(false);
  }

  return (
    <>
      <header className="zen-header">
        <div className="zen-header-inner">
          <span className="zen-logo">TokTickIT</span>

          <nav className="zen-nav" aria-label="Main navigation">
            <a href="#my-tickets" className="zen-nav-link">
              My Tickets
            </a>
            <a href="#create-ticket" className="zen-nav-link">
              Create Ticket
            </a>
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
        {/* Placeholder — My Tickets and Create Ticket implemented in later issues */}
        <div className="zen-card zen-welcome">
          <h1 className="zen-section-title">
            Welcome, {requester.name}
          </h1>
          <p className="zen-muted">
            TokTickIT IT Service Desk — select a screen from the navigation.
          </p>
        </div>
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

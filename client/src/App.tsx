// Application shell — Issue #2–5
// Routing: selection → my-tickets | create-ticket | ticket-detail
import { useState } from "react";
import { RequesterProvider, useRequester } from "./context/RequesterContext";
import RequesterSelect from "./components/RequesterSelect";
import CreateTicket from "./components/CreateTicket";
import MyTickets from "./components/MyTickets";
import TicketDetail from "./components/TicketDetail";
import type { DevRequester } from "./api";

type Screen = "home" | "create" | { detail: number };

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

  function isHome() { return screen === "home"; }
  function isCreate() { return screen === "create"; }

  function navClass(s: "home" | "create") {
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
              aria-current={isHome() ? "page" : undefined}
            >
              My Tickets
            </button>
            <button
              className={navClass("create")}
              onClick={() => setScreen("create")}
              aria-current={isCreate() ? "page" : undefined}
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

      <main id="main-content">
        {screen === "create" ? (
          <CreateTicket
            requesterId={requester.id}
            onBack={() => setScreen("home")}
          />
        ) : typeof screen === "object" ? (
          <TicketDetail
            ticketId={screen.detail}
            requesterId={requester.id}
            onBack={() => setScreen("home")}
          />
        ) : (
          // key={requester.id} forces full remount on requester switch → page+filter reset
          <MyTickets
            key={requester.id}
            requesterId={requester.id}
            onCreateTicket={() => setScreen("create")}
          />
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

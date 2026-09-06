// Development Requester Selection screen — ui-spec.md §10.2
// States: Loading → (Error | Empty | Loaded)
// Cancel is disabled if canCancel=false (no prior context, first-time load).
import { useEffect, useState } from "react";
import { fetchDevRequesters, type DevRequester } from "../api";

interface Props {
  onSelect: (requester: DevRequester) => void;
  canCancel?: boolean;
  onCancel?: () => void;
}

// Brand heading appears in every state so it is always visible on initial render.
function SelectionBranding() {
  return (
    <h1 className="zen-brand-heading" style={{ textAlign: "center", marginBottom: 24 }}>
      TokTickIT IT Service Desk
    </h1>
  );
}

export default function RequesterSelect({
  onSelect,
  canCancel = false,
  onCancel,
}: Props) {
  const [requesters, setRequesters] = useState<DevRequester[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  async function load() {
    setLoading(true);
    setHasError(false);
    try {
      const data = await fetchDevRequesters();
      setRequesters(data);
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleContinue() {
    const found = requesters.find((r) => r.id === Number(selectedId));
    if (found) onSelect(found);
  }

  if (loading) {
    return (
      <div className="zen-selection-wrap">
        <div>
          <SelectionBranding />
          <div className="zen-card" role="status" aria-live="polite">
            <div className="zen-spinner" aria-label="Loading requesters" />
            <p className="zen-muted">Loading requesters…</p>
          </div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="zen-selection-wrap">
        <div>
          <SelectionBranding />
          <div className="zen-card" data-testid="error-state">
            <span className="zen-icon" aria-hidden="true">⚠️</span>
            <h2 className="zen-section-title">Unable to Load Requesters</h2>
            <p className="zen-muted">
              Could not connect to the server. Please try again.
            </p>
            <button className="zen-btn zen-btn-primary" onClick={load}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (requesters.length === 0) {
    return (
      <div className="zen-selection-wrap">
        <div>
          <SelectionBranding />
          <div className="zen-card" data-testid="empty-state">
            <span className="zen-icon" aria-hidden="true">👤</span>
            <h2 className="zen-section-title">No Active Requesters</h2>
            <p className="zen-muted">
              There are no active development requesters available. Contact your
              administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="zen-selection-wrap">
      <div>
        <SelectionBranding />
        <div className="zen-card" data-testid="selection-loaded">
          <span className="zen-icon" aria-hidden="true">🎫</span>
          <h2 className="zen-section-title">Select Development Requester</h2>

          <div className="zen-info-banner" role="note">
            Only active development requesters are shown.
          </div>

          <div className="zen-field">
            <label htmlFor="requester-select" className="zen-label">
              Development Requester<span className="zen-required" aria-hidden="true"> *</span>
            </label>
            <select
              id="requester-select"
              aria-label="Development Requester"
              className="zen-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">— Choose a requester —</option>
              {requesters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.email})
                </option>
              ))}
            </select>
          </div>

          <div className="zen-disclaimer-banner" role="note">
            <strong>Lab 2 only:</strong> This selector simulates login for
            testing purposes and is not real authentication. It will be replaced
            by Lab 3 authentication.
          </div>

          <div className="zen-btn-row">
            <button
              className="zen-btn zen-btn-secondary"
              disabled={!canCancel}
              onClick={onCancel}
              aria-disabled={!canCancel}
            >
              Cancel
            </button>
            <button
              className="zen-btn zen-btn-primary"
              disabled={!selectedId}
              onClick={handleContinue}
              aria-disabled={!selectedId}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

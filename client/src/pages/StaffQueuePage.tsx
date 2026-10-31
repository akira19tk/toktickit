// Route wrapper adapting the callback-based StaffTicketQueue to react-router-dom.
// Dashboard cards drill down to /staff/queue?… (specification §8.1). We seed the
// queue's initial filters from the URL and remount (key) when they change, so
// every dashboard card lands on the correctly filtered queue.
import { useNavigate, useSearchParams } from "react-router-dom";
import StaffTicketQueue from "../components/StaffTicketQueue";

export default function StaffQueuePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const status = params.get("status") ?? undefined;
  const owner = params.get("owner") ?? undefined;
  // The drill-down param is itPriority (specification §8.1); the queue's own
  // filter is `priority` (IT Priority), so map it across.
  const priority = params.get("itPriority") ?? undefined;
  const actionAssignee = params.get("actionAssignee") ?? undefined;
  const actionStatus = params.get("actionStatus") ?? undefined;

  const initialFilters = {
    ...(status ? { status } : {}),
    ...(owner ? { owner } : {}),
    ...(priority ? { priority } : {}),
  };

  return (
    <StaffTicketQueue
      // Re-seed filters when the drill-down params change.
      key={[status, owner, priority, actionAssignee, actionStatus].join("|")}
      initialFilters={initialFilters}
      initialActionAssignee={actionAssignee}
      initialActionStatus={actionStatus}
      onOpenTicket={(id) => navigate(`/staff/tickets/${id}`)}
    />
  );
}

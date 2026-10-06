// Route wrapper adapting the callback-based StaffTicketQueue to react-router-dom.
import { useNavigate } from "react-router-dom";
import StaffTicketQueue from "../components/StaffTicketQueue";

export default function StaffQueuePage() {
  const navigate = useNavigate();
  return <StaffTicketQueue onOpenTicket={(id) => navigate(`/staff/tickets/${id}`)} />;
}

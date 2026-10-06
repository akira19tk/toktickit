// Route wrapper adapting the prop-based StaffTicketDetail to react-router-dom.
import { useNavigate, useParams } from "react-router-dom";
import StaffTicketDetail from "../components/StaffTicketDetail";

export default function StaffTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <StaffTicketDetail
      ticketId={Number(id)}
      onBack={() => navigate("/staff/queue")}
    />
  );
}

// Thin wrappers adapting Lab 2 callback-based components to react-router-dom.
import { useNavigate, useParams } from "react-router-dom";
import CreateTicket from "../components/CreateTicket";
import MyTickets from "../components/MyTickets";
import TicketDetail from "../components/TicketDetail";

export function MyTicketsPage() {
  const navigate = useNavigate();
  return (
    <MyTickets
      onCreateTicket={() => navigate("/tickets/new")}
      onOpenTicket={(id) => navigate(`/tickets/${id}`)}
    />
  );
}

export function CreateTicketPage() {
  const navigate = useNavigate();
  return (
    <CreateTicket
      onBack={() => navigate("/my-tickets")}
      onSuccess={() => navigate("/my-tickets")}
    />
  );
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <TicketDetail
      ticketId={Number(id)}
      onBack={() => navigate("/my-tickets")}
    />
  );
}

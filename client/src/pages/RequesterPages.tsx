// Thin wrappers adapting Lab 2 callback-based components to react-router-dom.
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import CreateTicket from "../components/CreateTicket";
import MyTickets from "../components/MyTickets";
import TicketDetail from "../components/TicketDetail";

export function MyTicketsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <MyTickets
      requesterId={user!.id}
      onCreateTicket={() => navigate("/tickets/new")}
      onOpenTicket={(id) => navigate(`/tickets/${id}`)}
    />
  );
}

export function CreateTicketPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <CreateTicket
      requesterId={user!.id}
      onBack={() => navigate("/my-tickets")}
      onSuccess={() => navigate("/my-tickets")}
    />
  );
}

export function TicketDetailPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <TicketDetail
      ticketId={Number(id)}
      requesterId={user!.id}
      onBack={() => navigate("/my-tickets")}
    />
  );
}

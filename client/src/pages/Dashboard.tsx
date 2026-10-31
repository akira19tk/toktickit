// Role-aware Dashboard landing (ui-spec §3). REQUESTER sees the Requester
// dashboard; IT_STAFF / ADMIN see the IT Staff dashboard (Admin reuses it).
import { useAuth } from "../context/AuthContext";
import RequesterDashboard from "./RequesterDashboard";
import StaffDashboard from "./StaffDashboard";

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "REQUESTER") return <RequesterDashboard />;
  return <StaffDashboard />;
}

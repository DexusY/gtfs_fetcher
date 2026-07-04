import { Navigate } from 'react-router-dom'
import { isLoggedIn, getRole } from '../auth'

export default function ProtectedRoute({ children, role }: { children: React.ReactNode; role: string }) {
  if (!isLoggedIn()) return <Navigate to="/login" />
  const userRole = getRole()
  // admin can access both panels
  if (role === 'admin' && userRole !== 'admin') return <Navigate to="/dashboard" />
  return <>{children}</>
}

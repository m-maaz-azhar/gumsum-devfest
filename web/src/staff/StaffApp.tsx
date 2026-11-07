import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { CircleUser, Home, LayoutGrid, Plus, ScanLine } from 'lucide-react'
import { BottomNav } from '../shared/ui/BottomNav'
import { useLiveClaims } from '../shared/api/live'
import StaffHome from './StaffHome'
import StaffItems from './StaffItems'
import AddItem from './AddItem'
import StaffItemPage from './StaffItemPage'
import Pickup from './Pickup'
import StaffProfile from './StaffProfile'

function StaffLayout() {
  const { pathname } = useLocation()
  // Live: a new or re-scored claim refreshes the dashboard and item pages (STF-DASH-01 #5, STF-CLM-01 #4).
  useLiveClaims(true, [['staff']])
  const fullScreen = pathname.startsWith('/staff/add') || pathname.startsWith('/staff/pickup')
  return (
    <>
      <Outlet />
      {!fullScreen && (
        <BottomNav
          label="Staff"
          tabs={[
            { to: '/staff', label: 'Home', icon: Home, end: true },
            { to: '/staff/items', label: 'Items', icon: LayoutGrid },
            { to: '/staff/add', label: 'Add found item', icon: Plus, raised: true },
            { to: '/staff/pickup', label: 'Pickup', icon: ScanLine },
            { to: '/staff/profile', label: 'Profile', icon: CircleUser },
          ]}
        />
      )}
    </>
  )
}

export default function StaffApp() {
  return (
    <Routes>
      <Route element={<StaffLayout />}>
        <Route index element={<StaffHome />} />
        <Route path="items" element={<StaffItems />} />
        <Route path="items/:id" element={<StaffItemPage />} />
        <Route path="add" element={<AddItem />} />
        <Route path="pickup" element={<Pickup />} />
        <Route path="profile" element={<StaffProfile />} />
        <Route path="*" element={<Navigate to="/staff" replace />} />
      </Route>
    </Routes>
  )
}

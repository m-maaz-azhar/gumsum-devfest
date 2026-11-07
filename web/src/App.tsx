import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LayoutGroup } from 'motion/react'
import { PublicOnly, RequireRole, RequireSession, Splash } from './auth/guards'
import Welcome from './auth/Welcome'
import ClaimantLayout from './claimant/ClaimantLayout'
import Home from './claimant/Home'
import { OfflineBanner } from './shared/ui/Layout'

// The staff tree is lazy-loaded so claimants never download staff code (ARCHITECTURE §1.1).
const SignIn = lazy(() => import('./auth/SignIn'))
const SearchPage = lazy(() => import('./claimant/SearchPage'))
const PlacePage = lazy(() => import('./claimant/PlacePage'))
const ItemPage = lazy(() => import('./claimant/ItemPage'))
const Requests = lazy(() => import('./claimant/Requests'))
const RequestDetail = lazy(() => import('./claimant/RequestDetail'))
const Profile = lazy(() => import('./claimant/Profile'))
const NameStep = lazy(() => import('./auth/Onboarding').then((m) => ({ default: m.NameStep })))
const PhoneStep = lazy(() => import('./auth/Onboarding').then((m) => ({ default: m.PhoneStep })))
const LocationStep = lazy(() => import('./auth/Onboarding').then((m) => ({ default: m.LocationStep })))
const StaffApp = lazy(() => import('./staff/StaffApp'))

export default function App() {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-[480px] bg-paper">
      <OfflineBanner />
      <LayoutGroup>
        <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/welcome" element={<PublicOnly><Welcome /></PublicOnly>} />
          <Route path="/sign-in" element={<PublicOnly><SignIn /></PublicOnly>} />
          <Route path="/onboarding/name" element={<RequireSession><NameStep /></RequireSession>} />
          <Route path="/onboarding/phone" element={<RequireSession><PhoneStep /></RequireSession>} />
          <Route path="/onboarding/location" element={<RequireSession><LocationStep /></RequireSession>} />

          <Route element={<RequireRole role="claimant"><ClaimantLayout /></RequireRole>}>
            <Route index element={<Home />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="places/:id" element={<PlacePage />} />
            <Route path="requests" element={<Requests />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route path="/items/:id" element={<RequireRole role="claimant"><ItemPage /></RequireRole>} />
          <Route path="/requests/:id" element={<RequireRole role="claimant"><RequestDetail /></RequireRole>} />

          <Route
            path="/staff/*"
            element={
              <RequireRole role="staff">
                <Suspense fallback={<Splash />}>
                  <StaffApp />
                </Suspense>
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </LayoutGroup>
    </div>
  )
}

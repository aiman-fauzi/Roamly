import { Navbar } from '@/components/layout/Navbar'
import { PageWrapper } from '@/components/layout/PageWrapper'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-route-wash">
      <Navbar />
      <PageWrapper>{children}</PageWrapper>
    </div>
  )
}

import Sidebar from './Sidebar'
import TopBar from './TopBar'
import CommandPalette from './CommandPalette'

interface ShellProps {
  title: string
  subtitle?: string
  crumbs?: string[]
  topBarRight?: React.ReactNode
  children: React.ReactNode
}

export default function Shell({ title, subtitle, crumbs, topBarRight, children }: ShellProps) {
  return (
    <div className="min-h-screen flex bg-canvas text-fg">
      <CommandPalette />
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar title={title} subtitle={subtitle} crumbs={crumbs} right={topBarRight} />
        <main className="flex-1 px-5 lg:px-8 py-8 max-w-[1480px] w-full mx-auto animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}

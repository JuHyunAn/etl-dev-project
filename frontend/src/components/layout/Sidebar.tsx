import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  {
    to: '/',
    exact: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    label: 'Dashboard',
  },
  {
    to: '/projects',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    label: 'Projects',
  },
  {
    to: '/connections',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    label: 'Connections',
  },
  {
    to: '/executions',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    label: 'Runs',
  },
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#161b27] border-r border-[#21262d]
      flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#21262d]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#58a6ff] to-[#bc8cff]
            flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#e6edf3] leading-none">ETL Platform</p>
            <p className="text-xs text-[#484f58] mt-0.5">Visual ELT</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm
                transition-colors group
                ${isActive
                  ? 'bg-[#1f3d6e] text-[#58a6ff]'
                  : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1f2937]'
                }`}
            >
              <span className={isActive ? 'text-[#58a6ff]' : 'text-[#484f58] group-hover:text-[#8b949e]'}>
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[#21262d]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#58a6ff] to-[#bc8cff]
            flex items-center justify-center text-white text-xs font-bold">
            E
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#e6edf3] truncate">ETL Workspace</p>
            <p className="text-xs text-[#484f58]">v0.1</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

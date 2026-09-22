import type { ReactElement } from "react";

interface IconProps {
  size?: number;
  className?: string;
}

const NAV_ICON_PATHS: Record<string, ReactElement> = {
  总览: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="9.5" rx="1.8" />
      <rect x="13" y="3.5" width="7.5" height="5.5" rx="1.8" />
      <rect x="13" y="11" width="7.5" height="9.5" rx="1.8" />
      <rect x="3.5" y="15" width="7.5" height="5.5" rx="1.8" />
    </>
  ),
  课程: (
    <>
      <path d="M12 6.4C10 5 7.3 4.6 4 5v13.4c3.3-.4 6 0 8 1.4 2-1.4 4.7-1.8 8-1.4V5c-3.3-.4-6 0-8 1.4z" />
      <path d="M12 6.4v13.4" />
    </>
  ),
  字幕: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M7 11.5h5.5" />
      <path d="M7 15h10" />
    </>
  ),
  笔记: (
    <>
      <path d="M4.5 19.5l.9-3.6L16.6 4.7a2.05 2.05 0 0 1 2.9 2.9L8.3 18.8z" />
      <path d="M14.5 6.8l2.9 2.9" />
    </>
  ),
  搜索: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  复习: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.5 3.5v4.7h-4.7" />
    </>
  ),
  导出: (
    <>
      <path d="M12 3.5v10.5" />
      <path d="M7.5 9.8l4.5 4.5 4.5-4.5" />
      <path d="M4 17v2.2A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.8-1.8V17" />
    </>
  ),
  插件管理: (
    <path d="M9.2 3.8h5.6a1.4 1.4 0 0 1 1.4 1.4v2.6h1.9a1.8 1.8 0 1 1 0 3.6h-1.9v3h-2.7v1.9a1.8 1.8 0 1 1-3.6 0v-1.9H5.4A1.4 1.4 0 0 1 4 13V5.2a1.4 1.4 0 0 1 1.4-1.4z" />
  ),
  站点适配器: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.8 5.2 3.8 8.5s-1.4 6.1-3.8 8.5c-2.4-2.4-3.8-5.2-3.8-8.5s1.4-6.1 3.8-8.5z" />
    </>
  ),
  用户与授权: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  系统设置: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9" />
    </>
  ),
  设置: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9" />
    </>
  ),
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      className={className ? `nav-icon ${className}` : "nav-icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {NAV_ICON_PATHS[name] ?? <circle cx="12" cy="12" r="7.5" />}
    </svg>
  );
}

export function SidebarToggleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `nav-icon ${className}` : "nav-icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9.2 4.5v15" />
      <path d="M14.8 10.2l-2 1.8 2 1.8" />
    </svg>
  );
}

export function Logo({ size = 28, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="la-logo-gradient" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1E40AF" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#la-logo-gradient)" />
      <path
        d="M8 8.2C10.6 7.5 13.3 7.7 16 9.2c2.7-1.5 5.4-1.7 8-1v11.6c-2.6-.7-5.3-.5-8 1-2.7-1.5-5.4-1.7-8-1z"
        fill="#FFFFFF"
      />
      <path d="M16 9.2v11.6" stroke="#2563EB" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M17.9 11.9l3.8 2.3-3.8 2.3z" fill="#2563EB" />
    </svg>
  );
}

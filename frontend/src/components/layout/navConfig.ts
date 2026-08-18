import type { AuthUser } from '@/lib/auth/types';
import type { ModuleName } from '@/lib/auth/permissions';

export interface NavLinkConfig {
  label: string;
  to: string;
  iconPath: string;
  /** Drop this link from the mobile drawer's flattened list (desktop rail only). */
  mobileHide?: boolean;
  visible: (ctx: NavVisibilityCtx) => boolean;
}

export interface NavSectionConfig {
  id: string;
  title: string;
  links: NavLinkConfig[];
}

export interface NavVisibilityCtx {
  user: AuthUser;
  hasModuleAccess: (moduleName: ModuleName | string) => boolean;
}

// Icon paths (24×24 stroke), Heroicons-style outline set — see DESIGN.md §9
// for the nav-icon coordinate-space contract (24×24, stroke, not the glyph
// system's 0 -960 960 960 filled icons).
const ICON_WORKERS =
  'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z';
const ICON_USERS =
  'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z';
const ICON_ROLES =
  'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z';
const ICON_PROFILE = 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z';
const ICON_JOBS =
  'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z';
const ICON_SKILLS =
  'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z';

export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: 'kadry',
    title: 'Kadry',
    links: [
      {
        label: 'Pracownicy',
        to: '/workers',
        iconPath: ICON_WORKERS,
        visible: (ctx) => ctx.hasModuleAccess('workers'),
      },
      {
        label: 'Stanowiska',
        to: '/jobs',
        iconPath: ICON_JOBS,
        visible: (ctx) => ctx.hasModuleAccess('jobs'),
      },
      {
        label: 'Umiejętności',
        to: '/skills',
        iconPath: ICON_SKILLS,
        visible: (ctx) => ctx.hasModuleAccess('skills'),
      },
    ],
  },
  {
    id: 'system',
    title: 'System',
    links: [
      {
        label: 'Użytkownicy',
        to: '/users',
        iconPath: ICON_USERS,
        mobileHide: true,
        // routes/users/routes.py gates every endpoint with a literal
        // role_required('superadmin') — not a module check — so this
        // mirrors the literal role, not hasModuleAccess (§13.5's trap).
        visible: (ctx) => ctx.user.role === 'superadmin',
      },
      {
        label: 'Role',
        to: '/roles',
        iconPath: ICON_ROLES,
        mobileHide: true,
        // routes/roles/routes.py: same literal role_required('superadmin').
        visible: (ctx) => ctx.user.role === 'superadmin',
      },
      {
        label: 'Profil',
        to: '/profile',
        iconPath: ICON_PROFILE,
        visible: () => true,
      },
    ],
  },
];

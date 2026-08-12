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
  isSupervisor: boolean;
  hasLinkedEmployee: boolean;
  hasModuleAccess: (moduleName: ModuleName | string) => boolean;
}

// Icon paths (24×24 stroke) reused verbatim from templates/components/sidebar.html
// where the same link exists in the reference project; "Hierarchia pracowników"
// has no reference equivalent (new page) so it uses Heroicons' UserGroupIcon.
const ICON_EMPLOYEES =
  'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z';
const ICON_ABSENCE =
  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z';
const ICON_BALANCES =
  'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z';
const ICON_BADGE =
  'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2';
const ICON_HIERARCHY =
  'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z';
const ICON_USERS =
  'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z';
const ICON_ROLES =
  'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z';
const ICON_PROFILE = 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z';

export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: 'zarzadzanie',
    title: 'Zarządzanie',
    links: [
      {
        label: 'Pracownicy',
        to: '/employees',
        iconPath: ICON_EMPLOYEES,
        visible: (ctx) => ctx.hasModuleAccess('employees'),
      },
      {
        label: 'Formy zatrudnienia',
        to: '/employees/formy-zatrudnienia',
        iconPath: ICON_BADGE,
        mobileHide: true,
        visible: (ctx) => ctx.hasModuleAccess('employees'),
      },
      {
        label: 'Hierarchia pracowników',
        to: '/employees/hierarchy',
        iconPath: ICON_HIERARCHY,
        mobileHide: true,
        visible: (ctx) => ctx.hasModuleAccess('employees'),
      },
      {
        label: 'Nieobecności',
        to: '/absences',
        iconPath: ICON_ABSENCE,
        visible: (ctx) => ctx.isSupervisor || ctx.hasModuleAccess('absences'),
      },
      {
        label: 'Bilanse urlopów',
        to: '/absences/balances',
        iconPath: ICON_BALANCES,
        mobileHide: true,
        visible: (ctx) => ctx.isSupervisor || ctx.hasModuleAccess('absences'),
      },
      {
        label: 'Moje nieobecności',
        to: '/absences/my',
        iconPath: ICON_BADGE,
        visible: (ctx) => ctx.hasLinkedEmployee,
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
        visible: (ctx) => ctx.hasModuleAccess('settings'),
      },
      {
        label: 'Role',
        to: '/roles',
        iconPath: ICON_ROLES,
        mobileHide: true,
        // routes/roles/routes.py gates EVERY endpoint with @role_required('superuser')
        // specifically — not the 'settings' module an admin also has. An admin
        // passing hasModuleAccess('settings') would see this link but 403 on
        // every API call the page makes, so this checks the literal role instead.
        visible: (ctx) => ctx.user.role === 'superuser',
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

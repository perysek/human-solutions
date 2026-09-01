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
// Faza 6 (IMPLEMENTATION_PLAN.md §11) — pulpit landing page (route "/").
const ICON_DASHBOARD =
  'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25';
// Faza 6 — DSH_5 threshold editor (superadmin only).
const ICON_ALERT_THRESHOLDS =
  'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75';
const ICON_JOBS =
  'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z';
// task1 (IMPLEMENTATION_PLAN.md addendum) — "Działy firmy" dictionary,
// office-building glyph to read distinctly from ICON_JOBS's briefcase.
const ICON_DEPARTMENTS =
  'M3 21V5.25A2.25 2.25 0 015.25 3h6a2.25 2.25 0 012.25 2.25V21m-10.5 0h15M13.5 21V9.75a2.25 2.25 0 012.25-2.25h1.5A2.25 2.25 0 0119.5 9.75V21M6.75 6.75h.008v.008H6.75V6.75zm0 3h.008v.008H6.75V9.75zm0 3h.008v.008H6.75v-.008zm3-6h.008v.008h-.008V6.75zm0 3h.008v.008h-.008V9.75zm0 3h.008v.008h-.008v-.008z';
// ORG_CHART_PROPOSAL.md §4g — hierarchy/tree glyph (three connected nodes),
// reads distinctly from ICON_DEPARTMENTS's building outline.
const ICON_ORG_CHART =
  'M12 4.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5zM4.5 15.75a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0zm10.5 0a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0zM12 9v3m0 0H6.75m5.25 0h5.25m0 0v3.75M6.75 12v3.75';
const ICON_SKILLS =
  'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z';
// Faza 4 (IMPLEMENTATION_PLAN.md §9) — medical exams / BHP training reports.
const ICON_MEDICAL =
  'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z';
const ICON_BHP =
  'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z';
// Faza 5 (IMPLEMENTATION_PLAN.md §10) — internal trainings catalog.
const ICON_TRAININGS =
  'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5';
// LUK_1 — competency-gap report (required job-skill level vs. assessed
// worker level), reuses Heroicons outline "scale" glyph (balance between
// two sides) to read as a required-vs-actual comparison at a glance.
const ICON_COMPETENCY_GAPS =
  'M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z';
// LUK_2 — action-plan tracking list (Heroicons outline "clipboard-list").
const ICON_ACTION_PLANS =
  'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z';

export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: 'kadry',
    title: 'Kadry',
    links: [
      {
        label: 'Pulpit',
        to: '/',
        iconPath: ICON_DASHBOARD,
        // module_permission_required('dashboard') — routes/dashboard/routes.py.
        // `viewer` has no dashboard grant (RBAC seed), so this link (and the
        // route itself) is invisible to it, matching PRD §5.1's ❌.
        visible: (ctx) => ctx.hasModuleAccess('dashboard'),
      },
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
        label: 'Działy firmy',
        to: '/departments',
        iconPath: ICON_DEPARTMENTS,
        // Piggybacks on 'jobs' — see routes/departments/routes.py's docstring.
        visible: (ctx) => ctx.hasModuleAccess('jobs'),
      },
      {
        label: 'Struktura organizacyjna',
        to: '/org-chart',
        iconPath: ICON_ORG_CHART,
        // Same 'jobs' grant as Działy firmy — the joined chart+history
        // page-view (OrgChartPage) internally re-checks 'audit' for its own
        // history section, so no second nav entry is needed for it (see
        // router.tsx's comment on the /org-chart route).
        visible: (ctx) => ctx.hasModuleAccess('jobs'),
      },
      {
        label: 'Umiejętności',
        to: '/skills',
        iconPath: ICON_SKILLS,
        visible: (ctx) => ctx.hasModuleAccess('skills'),
      },
      {
        label: 'Luki kompetencyjne',
        to: '/workers/competency-gaps',
        iconPath: ICON_COMPETENCY_GAPS,
        // Same data/permission surface as SKL_6 (GET /workers/api/skill-gaps)
        // — gated on 'workers', not 'skills'.
        visible: (ctx) => ctx.hasModuleAccess('workers'),
      },
      {
        label: 'Plany działań',
        to: '/workers/action-plans',
        iconPath: ICON_ACTION_PLANS,
        // action_plans is gated under module_permission_required('workers')
        // (routes/workers/routes.py), same surface as the gap report above.
        visible: (ctx) => ctx.hasModuleAccess('workers'),
      },
      {
        label: 'Badania lekarskie',
        to: '/medical/expiring',
        iconPath: ICON_MEDICAL,
        visible: (ctx) => ctx.hasModuleAccess('medical'),
      },
      {
        label: 'Szkolenia BHP',
        to: '/bhp/expiring',
        iconPath: ICON_BHP,
        visible: (ctx) => ctx.hasModuleAccess('bhp'),
      },
      {
        label: 'Szkolenia wewnętrzne',
        to: '/trainings',
        iconPath: ICON_TRAININGS,
        visible: (ctx) => ctx.hasModuleAccess('trainings'),
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
        label: 'Progi alertów',
        to: '/alert-thresholds',
        iconPath: ICON_ALERT_THRESHOLDS,
        mobileHide: true,
        // role_required('superadmin') — routes/dashboard/routes.py's
        // alert-thresholds endpoints (DSH_5), same literal-role gate as
        // Użytkownicy/Role above.
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

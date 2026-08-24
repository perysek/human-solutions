# Plan Implementacji — Domena HR Staamp Poland na obecnej architekturze aplikacji

| | |
|---|---|
| **Wersja** | 1.1 — otwarte kwestie biznesowe (sekcja 15) rozstrzygnięte interaktywnie |
| **Data** | 2026-08-17 |
| **Status** | Do przeglądu |
| **Powiązane dokumenty** | `PRD.md` (wymagania biznesowe — specyfikacja referencyjna), `DESIGN.md` (system projektowy frontendu) |

---

## 1. Kontekst — dlaczego ten plan wygląda tak, a nie inaczej

`PRD.md` opisuje aplikację HR dla Staamp Poland (`hr_app_staamp`): pracownicy, stanowiska, badania lekarskie, szkolenia BHP, macierz kompetencji, szkolenia wewnętrzne, dashboard z alertami, audit trail i administracja kontami — na stosie Flask + SQLite + Jinja2.

Analiza repozytorium (agenci `Explore` — backend i frontend) wykazała, że **kod faktycznie zacommitowany w tym repo realizuje zupełnie inny biznes**: system do zarządzania salonem kosmetycznym „MyWay Nails & Beauty" (pracownicy salonu z `base_salary`/`commission_rate`, role `receptionist`/`stylist`/`accountant`, moduł nieobecności, fakturowanie) na stosie React + Flask + PostgreSQL. `git grep -i staamp` w całym repo daje trafienia wyłącznie wewnątrz samego `PRD.md` — żadna linijka kodu nie odnosi się do Staamp. Zarówno `PRD.md`, jak i `DESIGN.md` są plikami niewpisanymi do gita (`git status`: `?? PRD.md`, `?? DESIGN.md`).

Zapytany o kierunek, użytkownik wybrał opcję: **rozbudować obecną aplikację** — zachować obecną architekturę techniczną (React SPA + Flask/PostgreSQL, warstwy `routes → services → repositories`, silnik audytu, silnik RBAC, system projektowy) jako fundament, a domenę HR Staamp zbudować od zera na tym fundamencie, zastępując nieprzystającą domenę salonu. Wymagania stosu z PRD §7 (SQLite, Jinja2) i §10 (Windows Server/IIS) traktujemy jako nieaktualne wobec decyzji technologicznych już podjętych w repozytorium.

`★ Insight ─────────────────────────────────────`
To nietypowa sytuacja dla planu implementacji — zwykle plan zakłada, że kod i wymagania opisują tę samą rzeczywistość, a różnią się tylko stopniem pokrycia. Tutaj trzeba było najpierw ustalić fakty (dwóch agentów eksploracyjnych), potem podjąć decyzję strategiczną z użytkownikiem (bo to nie jest coś, co można wywnioskować z kodu), i dopiero na tej podstawie projektować — stąd nietypowo długi rozdział kontekstowy przed właściwym planem.
`─────────────────────────────────────────────────`

Dobra wiadomość: infrastruktura "wodociągowa" obecnej aplikacji jest solidna i w większości bezpośrednio przenośna na domenę HR — `BaseRepository` (transakcje, CRUD), `AuditableMixin` (audit trail wpięty w warstwę repository, nie w routing — nie da się o nim zapomnieć), dynamiczny silnik RBAC oparty o tabele `roles`/`role_permissions` z flagami `has_access`/`read_only`/`own_data` (bogatszy niż statyczna macierz z PRD), oraz dojrzały system projektowy Reacta z `ProtectedRoute`, kontekstem uwierzytelniania i gotowym zestawem komponentów UI.

### 1.1 Doprecyzowanie zakresu (ustalone interaktywnie, 17.08.2026)

Podczas przeglądu otwartych kwestii biznesowych (sekcja 15) padło doprecyzowanie o dużym znaczeniu dla interpretacji całego dokumentu: **aplikacja nie jest budowana wyłącznie na potrzeby Staamp Poland**. PRD Staamp pełni rolę referencyjnej specyfikacji funkcjonalnej (zestaw modułów, encji i reguł biznesowych, na którym warto się wzorować), ale docelowo projekt ma być własnym produktem z myślą o szerszym użyciu/ewentualnej sprzedaży — model biznesowy (SaaS, licencja, white-label itp.) pozostaje **do ustalenia później**.

Konsekwencje dla tego planu:
- **NF_4** („dostęp wyłącznie z sieci lokalnej Staamp Poland") przestaje być wymaganiem twardym — patrz zaktualizowana decyzja wdrożeniowa w sekcji 15.
- Plan **nie wprowadza wielodostępności (multi-tenancy)** na tym etapie — to osobna, świadomie odłożona decyzja architektoniczna, którą należy podjąć dopiero razem z modelem biznesowym. Build pozostaje single-tenant.
- Tam, gdzie jest to tanie, warto unikać twardego wpisywania nazwy „Staamp Poland" w miejscach user-facing (np. tytuł aplikacji, stopka) — ale to porządek kosmetyczny, nie osobna faza w tym planie.
- Reguły biznesowe z PRD (role RBAC, progi alertów, struktura danych) pozostają punktem odniesienia dla *funkcji*, niezależnie od tego, kto ostatecznie będzie klientem.

---

## 2. Decyzje projektowe przekrojowe

Poniższe decyzje obowiązują we wszystkich fazach i nie są powtarzane przy każdej z osobna:

1. **Naturalne klucze TEXT dla `workers`, `jobs`, `skills`; SERIAL dla reszty.** Legacy identyfikatory z SQLite (`workers.id = "9001"`, `jobs.id = "BRYGADZISTA"`, `skills.id = "0002"`) są referencjami FK w 8+ innych tabelach i najpewniej są używane przez dział HR w dokumentach papierowych/raportach. Przemapowanie ich na SERIAL wymagałoby tabeli tłumaczącej podczas migracji danych legacy bez realnej korzyści — `BaseRepository._execute_insert` (`RETURNING id`) działa identycznie niezależnie od typu klucza. Wszystkie tabele szczegółów/łącznikowe (`birth_data`, `medical_exams`, `training_participants` itd.) zachowują normalną konwencję `SERIAL PRIMARY KEY`.
2. **`created_at`/`updated_at` na każdej nowej tabeli**, nawet gdy PRD §8 ich nie wymienia — zgodnie z uniwersalną konwencją istniejącą już w tym repo.
3. **Nowe repozytoria dziedziczą `class XRepository(AuditableMixin, BaseRepository)`** i korzystają z `_execute`/`_fetch_one`/`_fetch_all`/`_execute_insert`/`transaction()` zamiast ręcznie wywoływać `get_db_connection()` (starszy wzorzec widoczny w `employee_repository.py`, sprzed wprowadzenia `BaseRepository`).
4. **Logika progów alertów żyje w jednym miejscu**: `services/alert_service.py`. `medical_service.py`/`bhp_service.py` trzymają walidację domenową (enumy `kind`, kolejność dat); `alert_service.py` trzyma współdzielone kubełkowanie 30/60/90 dni, żeby odznaki na liście pracowników, globalne raporty (MED_6/BHP_5) i dashboard (DSH_2–4) nigdy nie rozjechały się w definicji „wygasające".
5. **Ukrywanie danych dla roli `viewer` (RODO_3/OQ_3) to filtr na poziomie route'a, nie nowa flaga w bazie.** Trójka `has_access/read_only/own_data` nie ma czwartego wymiaru „anonimizuj"; `routes/trainings/routes.py` zamienia w JSON-ie nazwiska uczestników i trenerów na ich `worker_id`, gdy `current_user.role == 'viewer'` — **decyzja potwierdzona interaktywnie** (sekcja 15): viewer identyfikuje osoby po ID pracownika, nie po pełnym imieniu i nazwisku, zarówno dla uczestników, jak i trenerów.
6. **`own_data_worker_id(user, module_name)`** — nowy, prostszy odpowiednik istniejącego `own_data_employee_id` w `config/auth_config.py`: ponieważ PRD umieszcza `worker_id` bezpośrednio na `users` (a nie odwrotny FK jak w schemacie salonu), nie jest potrzebne żadne dodatkowe zapytanie — to bezpośredni odczyt atrybutu z tym samym sentinelem `-1` przy braku powiązania.
7. **Pierwszy realny komponent paginacji budowany raz** (Faza 1, przy `JobsListPage`) i reużywany dla `WorkersListPage`, `SkillsListPage`, `TrainingsListPage` oraz podglądu audytu — obecnie w aplikacji nie istnieje żaden komponent paginacji (listy działają na sortowaniu/filtrowaniu client-side), a PRD wymaga jej dla list do 236/4652 rekordów.

---

## 3. Kluczowe fakty potwierdzone w kodzie (nie zakładane)

- Tabela `users` (`alembic/versions/001_create_users_and_employees_tables.py`) ma dziś `id, email, password_hash, full_name, role, is_active, last_login, created_at, updated_at` — **brak kolumn `failed_logins`/`locked_until`/`worker_id`.**
- Ograniczenie CHECK na `users.role` zostało już usunięte w migracji `a9b8c7d6e5f4_remove_check_user_role_constraint.py` — **zmiana słownika ról to czysta zmiana danych/konfiguracji, nie blokada migracyjna.**
- `roles`/`role_permissions` mają już dokładnie trójkę `has_access`/`read_only`/`own_data` potrzebną do wyrażenia macierzy z PRD §4.2 **bez żadnych zmian schematu** — to najważniejszy punkt reużycia w całym planie.
- `audit_log` to już działający, ogólny log zmian pól (`entity_type, entity_id, entity_label, action, field_name, old_value, new_value, user_id, user_name, changed_at`). Zdarzenia logowania/wylogowania **są już audytowane** (`routes/auth/routes.py` zapisuje `LOGIN`/`LOGIN_FAILED` z adresem IP) — AUTH_7/AUD_5 są w praktyce już zrealizowane.
- Brak repozytorium/route'a dla `absences` w backendzie mimo istnienia stron/wpisów w nawigacji frontendu — moduł jest już martwy po stronie backendu, co upraszcza jego wygaszenie.
- Historia Alembic zawiera migracje scalające (merge) — **przy implementacji trzeba uruchomić `alembic heads` lokalnie**, a nie zakładać konkretnego identyfikatora rewizji.
- Brak mechanizmu limitu czasu bezczynności sesji i brak mechanizmu blokady konta po nieudanych logowaniach — oba trzeba zbudować od zera (AUTH_4/AUTH_5).
- `DEPLOYMENT_VULTR.md` wspomina o (już usuniętym) `scripts/migrate_sqlite_to_postgres.py` użytym przy migracji domeny faktur z SQLite — dowód, że migracja tego typu była już w tym repo z powodzeniem wykonana; Faza 8 wzoruje się na tym precedensie.

---

## 4. Przegląd faz

| # | Faza | Zależy od | Nowe tabele | Nowe migracje |
|---|---|---|---|---|
| 0 | Fundament — przebudowa RBAC, wzmocnienie AUTH, wygaszenie domeny salonu | — | brak (kolumny w `users`) | `add_lockout_columns_to_users`, `seed_staamp_rbac` |
| 1 | Słowniki — Stanowiska i Umiejętności | 0 | `jobs`, `skills` | `create_jobs_and_skills_tables` |
| 2 | Domena pracowników | 0, 1 | `workers`, `birth_data`, `worker_nationality`, `foreigner_data` | `create_workers_and_personal_data_tables` (+ FK `users.worker_id`) |
| 3 | Macierz kompetencji | 1, 2 | `job_skills`, `worker_skills`, `worker_skill_remarks` | `create_competency_matrix_tables` |
| 4 | Badania lekarskie i BHP | 2 | `medical_exams`, `bhp_trainings` | `create_medical_and_bhp_tables` |
| 5 | Szkolenia wewnętrzne | 2, 1 | `trainings`, `training_participants`, `training_job`, `training_skills` | `create_trainings_tables` |
| 6 | Agregacja alertów dashboardu | 2, 4, 5 | `alert_thresholds` | `create_alert_thresholds_table` |
| 7 | Podgląd audit trail | 0 (technicznie), sensowniej po fazie 6 | brak | opcjonalnie `add_ip_address_to_audit_log` |
| 8 | Migracja danych legacy SQLite → PostgreSQL | tabele domenowe z faz 1–5 | brak | brak (skrypt, nie migracja schematu) |
| 9 | Strategia testów i weryfikacji | równolegle z fazami 2–7 | — | — |

---

## 5. Faza 0 — Fundament: przebudowa RBAC, wzmocnienie AUTH, wygaszenie domeny salonu

### 5.1 Przebudowa RBAC

**Nowe role** (`alembic/versions/xxxx_seed_staamp_rbac.py`, migracja danych):

```sql
DELETE FROM roles WHERE name IN ('superuser','admin','receptionist','stylist','accountant');
-- kaskadowo usuwa role_permissions dzięki istniejącemu ON DELETE CASCADE

INSERT INTO roles (name, display_name, is_protected) VALUES
  ('superadmin', 'Administrator systemu', TRUE),
  ('hr_manager', 'Kierownik HR', FALSE),
  ('trainer',    'Trener', FALSE),
  ('viewer',     'Obserwator', FALSE)
ON CONFLICT (name) DO NOTHING;
```

Nowy słownik modułów (zastępuje `invoices/appointments/clients/employees/services/settings/reports/data_correction/data_import/absences/service_prices`): **`workers, jobs, medical, bhp, skills, trainings, dashboard, audit, admin`**.

Macierz uprawnień (zgodnie z PRD §4.2, wykorzystująca istniejącą trójkę flag):

| Moduł | superadmin | hr_manager | trainer | viewer |
|---|---|---|---|---|
| `workers` | dostęp | dostęp | — | — |
| `jobs` | dostęp | dostęp | — | — |
| `medical` | dostęp | dostęp | — | — |
| `bhp` | dostęp | dostęp | — | — |
| `skills` | dostęp | dostęp | — | — |
| `trainings` | dostęp | dostęp | dostęp, **own_data=TRUE** | dostęp, **read_only=TRUE** |
| `dashboard` | dostęp | dostęp | dostęp, **own_data=TRUE** | — |
| `audit` | dostęp | dostęp, **read_only=TRUE** | — | — |
| `admin` | dostęp | — | — | — |

Cztery wiersze „Szkolenia wewn." z macierzy PRD mapują się na **jeden** wiersz modułu `trainings` na rolę dzięki istniejącej trójce flag — bez nowej kolumny.

**Aktualizacja fallbacku statycznego w `config/auth_config.py`** (równolegle z seedem dynamicznym):
```python
ROLE_HIERARCHY = {'superadmin': 4, 'hr_manager': 3, 'trainer': 2, 'viewer': 1}
MODULE_PERMISSIONS = {
    'workers': ['superadmin', 'hr_manager'],
    'jobs': ['superadmin', 'hr_manager'],
    'medical': ['superadmin', 'hr_manager'],
    'bhp': ['superadmin', 'hr_manager'],
    'skills': ['superadmin', 'hr_manager'],
    'trainings': ['superadmin', 'hr_manager', 'trainer', 'viewer'],
    'dashboard': ['superadmin', 'hr_manager', 'trainer'],
    'audit': ['superadmin', 'hr_manager'],
    'admin': ['superadmin'],
}
```
`ROLE_HIERARCHY` nie ma dziś żadnego konsumenta w kodzie — aktualizacja jego wartości jest bezpieczna. **Ryzyko szczątkowe do odnotowania, nie do naprawy w tym planie**: fallback statyczny nie zna pojęcia `read_only`/`own_data` — przy niedostępności bazy `trainer`/`viewer` dostaliby pełny zapis na `trainings`. To ograniczenie odziedziczone (identyczna luka istniała już wcześniej dla `accountant`/`service_prices`), nie nowa regresja.

**`repositories/roles/role_repository.py`**: aktualizacja `ALL_MODULES` i etykiet wyświetlanych do nowych 9 modułów. Frontend (`RolesEditForm.tsx`) powinien przestać renderować kolumny `can_edit_price_history`/`can_send_sms` — nie odpowiadają już żadnej realnej funkcji.

**Dane w `users.role`**: ponieważ to build od zera przed uruchomieniem produkcyjnym (brak realnych użytkowników Staamp — istnieją tylko dev-owe konta seedowe salonu `@myway.local`), Faza 0 zastępuje cały zestaw seedowy zamiast próbować semantycznego mapowania `superuser→superadmin` (nie ma naturalnego odpowiednika dla `receptionist/stylist/accountant`). **Założenie do weryfikacji**: gdyby jednak istnieli realni użytkownicy pod starymi nazwami ról, potrzebne byłoby `UPDATE users SET role = CASE role WHEN ... END` zamiast prostego reseedu.

### 5.2 AUTH_4 — 30-minutowy limit bezczynności

- Bez migracji.
- Nowy plik `config/session_guard.py`: `register_idle_timeout(app)` instalujący handler `app.before_request`. Przy każdym żądaniu, jeśli użytkownik jest zalogowany: porównanie `session.get('last_activity')` z `now`; po przekroczeniu `SESSION_IDLE_TIMEOUT_MINUTES` (zmienna środowiskowa, domyślnie `30`) — `logout_user()` + czyszczenie sesji; w przeciwnym razie odświeżenie znacznika czasu. Niezależne od `PERMANENT_SESSION_LIFETIME` (30-dniowy sufit „zapamiętaj mnie" pozostaje bez zmian) — to osobny, dużo krótszy licznik bezczynności.
- Podpięcie w `app.py`'s `create_app()`, zaraz po bloku `login_manager`.

### 5.3 AUTH_5 — blokada po 5 nieudanych logowaniach

- Migracja `add_lockout_columns_to_users`: `ALTER TABLE users ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0; ADD COLUMN locked_until TIMESTAMP NULL;`
- Nowe metody w `repositories/users/user_repository.py`: `increment_failed_logins`, `reset_failed_logins`, `lock_account`, `unlock_account` (ręczne odblokowanie przez superadmina), `is_locked`.
- `services/auth/auth_service.py`'s `authenticate()`: sprawdzenie blokady przed weryfikacją hasła; przy błędnym haśle inkrementacja licznika; przy 5. próbie blokada na `LOCKOUT_MINUTES` (domyślnie 30 min — patrz rozstrzygnięcie sprzeczności PRD w tabeli otwartych kwestii); przy sukcesie reset licznika i `locked_until`.
- Nowy endpoint `PUT /admin/api/users/<id>/unlock` (`role_required('superadmin')`).
- `routes/auth/routes.py` — dodanie akcji audytowych `ACCOUNT_LOCKED`/`ACCOUNT_UNLOCKED` obok już istniejącego `LOGIN_FAILED`.

### 5.4 Wygaszenie domeny salonu — backend

- Wyrejestrowanie `employees_bp` z `app.py`; usunięcie `routes/employees/`, `repositories/employees/` (zastąpione przez domenę `workers`/`jobs` z faz 1–2), `repositories/absences/*` (martwe — nigdy nie miały blueprintu).
- `database/models.py`: usunięcie dataclass `Employee`, `FormaZatrudnienia`, `Absence*` po usunięciu konsumujących je repo/route'ów.
- `config/admin_view.py` (specyficzny dla salonu stub „Widoku administratora") — do usunięcia w całości; `config/runtime_guards.py` (ograniczenie do jednego workera powiązane z funkcjami SSE salonu) — do ponownej oceny po potwierdzeniu usunięcia kodu SSE salonu (poza zakresem tego planu poza samym zaznaczeniem).
- `config/ui_messages.py`: zachować wzorzec scentralizowanych komunikatów, przepisać klucze specyficzne dla salonu stopniowo, fazami.
- **Pozostawić bez zmian ~30 nieużywanych tabel domeny faktur/wizyt/SMS** i ich migracje — potwierdzone jako martwe (brak jakichkolwiek route'ów), poza zakresem, ewentualny porządek na przyszłość.

### 5.5 Wygaszenie domeny salonu — frontend

- Usunięcie tras `/absences`, `/absences/balances`, `/absences/my` z `frontend/src/router.tsx`, wpisów nawigacji z `frontend/src/components/layout/navConfig.ts`, usunięcie `frontend/src/pages/absences/*` — bezpieczne od razu, bo backend za nimi nie stoi.
- `frontend/src/lib/auth/permissions.ts`'s `ModuleName` zmienia się na `'workers' | 'jobs' | 'medical' | 'bhp' | 'skills' | 'trainings' | 'dashboard' | 'audit' | 'admin'`.
- **Bez zmian strukturalnych, tylko aktualizacja słownictwa**: strony `auth/*`, `ProfilePage.tsx`, `pages/users/*` (brama zmienia się z `role_required('superuser','admin')` na `role_required('superadmin')` — PRD nie daje `hr_manager` dostępu do zarządzania kontami), `pages/roles/*`.
- `frontend/src/pages/employees/*` — **nie usuwać od razu**; Faza 2 buduje `pages/workers/*` obok, podmienia wpisy nawigacji, i dopiero wtedy usuwa strony `employees` — żeby w międzyczasie nawigacja nigdy nie wskazywała na nieistniejącą stronę.

---

## 6. Faza 1 — Słowniki: Stanowiska i Umiejętności

Brak zależności od `workers` — to czyste tabele słownikowe, odblokowują wszystkie późniejsze FK.

**Tabele** (migracja `create_jobs_and_skills_tables`):
- `jobs`: `id TEXT PRIMARY KEY, description TEXT, created_at, updated_at`
- `skills`: `id TEXT PRIMARY KEY, description TEXT NOT NULL, created_at, updated_at`

**Repozytoria**: `repositories/jobs/job_repository.py` (`AuditableMixin` + `BaseRepository`, `audit_entity_type='job'`), `repositories/skills/skill_repository.py` (`audit_entity_type='skill'`). Metody: `create` (id podawane przez wywołującego — zgodnie z decyzją o kluczach naturalnych), `get_by_id`, `get_all(search=None)`, `update`, `delete` (blokowane `ConflictError`, jeśli rekord jest referencjonowany — metoda `count_blocking_references` analogiczna do wzorca z `EmployeeRepository`).

**Trasy**: `routes/jobs/routes.py` (`jobs_bp`, prefix `/jobs`), `routes/skills/routes.py` (`skills_bp`, prefix `/skills`) — obie `@login_required` + `@module_permission_required('jobs')`/`('skills')`.

Endpointy (ten sam kształt dla obu): `GET /api` (JOB_1/SKL_1, `?search=`), `GET /api/<id>`, `POST /api`, `PUT /api/<id>`, `DELETE /api/<id>`.

**Frontend**: `frontend/src/lib/api/jobs.ts`, `skills.ts` (wzorowane na `employees.ts`). Strony: `pages/jobs/{JobsListPage,JobCreatePage,JobEditPage,JobViewPage}.tsx`, `pages/skills/{SkillsListPage,SkillCreatePage,SkillEditPage}.tsx`. Nowa sekcja nawigacji „Kadry" w `navConfig.ts`.

**Nowy komponent współdzielony**: `frontend/src/components/ui/PaginatedTable.tsx` — budowany tutaj (na małym, niskoryzykownym zbiorze 52 stanowisk) przed użyciem go przy większych zbiorach (`workers` — 236, `trainings` — 4652).

---

## 7. Faza 2 — Domena pracowników

**Tabele** (migracja `create_workers_and_personal_data_tables`):

- `workers`: `id TEXT PRIMARY KEY, firstname TEXT NOT NULL, surname TEXT NOT NULL, job_id TEXT REFERENCES jobs(id) ON DELETE RESTRICT, boss_id TEXT REFERENCES workers(id) ON DELETE SET NULL, gender TEXT CHECK (gender IN ('Male','Female','UNKNOWN')) DEFAULT 'UNKNOWN', hire_date DATE, fire_date DATE NULL, created_at, updated_at`. Indeksy: `idx_workers_job_id`, `idx_workers_boss_id`, `idx_workers_fire_date` (napędza filtr aktywny/nieaktywny z WRK_11 — `fire_date IS NULL` = aktywny).
- `birth_data`: `id SERIAL PK, worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE, birth_date DATE, birth_place TEXT, created_at, updated_at`, `UNIQUE(worker_id)`.
- `worker_nationality`: `id SERIAL PK, worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE, nationality TEXT NOT NULL, created_at`.
- `foreigner_data`: `id SERIAL PK, worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE, document_kind TEXT, document_validity DATE, employment_basis TEXT, employment_basis_validity DATE, created_at, updated_at`, `UNIQUE(worker_id)`. Indeks `idx_foreigner_data_document_validity` (zapytania alertów WRK_10).

Ta sama migracja dodaje też: `ALTER TABLE users ADD COLUMN worker_id TEXT REFERENCES workers(id) ON DELETE SET NULL;` — dopełnia kształt `users` z PRD §8.3.

**Repozytoria** (wszystkie `AuditableMixin + BaseRepository`):
- `repositories/workers/worker_repository.py` (`audit_entity_type='worker'`). Metody: `create` (w `managed_transaction()`, jeśli tworzone są równolegle rekordy birth/nationality/foreigner — ERR_1), `get_by_id`, `get_all(status=..., search=..., sort=..., page=..., page_size=...)`, `update`, `deactivate` (ustawia `fire_date=CURRENT_DATE`, **nie** fizyczne usunięcie — WRK_8/RODO_4), `get_subordinates(boss_id)` (WRK_9).
- `repositories/workers/birth_data_repository.py`, `worker_nationality_repository.py`, `foreigner_data_repository.py` — cienkie repozytoria jednoprzeznaczeniowe, audytowane pod `audit_entity_type='worker'` z `entity_id=worker_id`, żeby korekta daty urodzenia pojawiała się w śladzie audytowym *pracownika*, a nie fragmentowała na cztery osobne typy encji.

**Serwis**: `services/worker_service.py` — orkiestruje `create_worker(payload)` przez wszystkie cztery repozytoria wewnątrz jednej `managed_transaction()` (spełnia ERR_1 dosłownie), waliduje enum płci, unikalność wpisów narodowości, deleguje sprawdzanie wygasających dokumentów cudzoziemca (WRK_10) do `services/alert_service.get_expiring_foreigner_docs()`.

**Trasy**: `routes/workers/routes.py`, blueprint `workers_bp`, prefix `/workers`, `@module_permission_required('workers')` (tylko superadmin/hr_manager — RODO_1/RODO_2 blokują `trainer`/`viewer` na poziomie dostępu do modułu, nie tylko na poziomie pola, bo to właśnie te tabele RODO_2 wymienia wprost).

| Endpoint | Metoda | Wymaganie |
|---|---|---|
| `/api?status=&search=&sort=&page=&page_size=` | GET | WRK_1/WRK_11 |
| `/api/<id>` | GET | WRK_2/3/4/5 (profil łączony) |
| `/api` | POST | WRK_6 |
| `/api/<id>` | PUT | WRK_7 |
| `/api/<id>/deactivate` | PUT | WRK_8 |
| `/api/<id>/subordinates` | GET | WRK_9 |
| `/api/expiring-foreigner-docs?days=30` | GET | WRK_10 (używane też przez dashboard) |

**Frontend**: `lib/api/workers.ts`, strony `pages/workers/{WorkersListPage,WorkerCreatePage,WorkerEditPage,WorkerViewPage,WorkerHierarchyPage}.tsx`, `WorkerForm.tsx` z sekcjami (dane podstawowe / urodzenie / narodowość / dokument cudzoziemca) zgodnie z konwencjami formularzy z `DESIGN.md`, lista korzysta z `PaginatedTable` (236 wierszy — pierwszy zbiór, gdzie paginacja realnie ma znaczenie).

**Przełączenie**: gdy `WorkersListPage` jest gotowa i nawigacja „Kadry → Pracownicy" wskazuje `/workers`, usunąć `pages/employees/*`, `lib/api/employees.ts` i blok tras `/employees/*`.

---

## 8. Faza 3 — Macierz kompetencji

**Tabele** (migracja `create_competency_matrix_tables`):
- `job_skills`: `id SERIAL PK, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE, required_rating INTEGER NOT NULL CHECK (required_rating BETWEEN 1 AND 3), UNIQUE(job_id, skill_id), created_at`.
- `worker_skills`: `id SERIAL PK, worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE, skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE, current_rating INTEGER CHECK (current_rating BETWEEN 1 AND 3), last_update DATE, UNIQUE(worker_id, skill_id), created_at, updated_at`.
- `worker_skill_remarks`: `id SERIAL PK, worker_skill_id INTEGER NOT NULL REFERENCES worker_skills(id) ON DELETE CASCADE, remarks TEXT NOT NULL, created_at`.

**Repozytoria**: `repositories/jobs/job_skill_repository.py` (`audit_entity_type='job'`), `repositories/workers/worker_skill_repository.py` i `worker_skill_remark_repository.py` (`audit_entity_type='worker'`) — każda zmiana oceny zapisana z `field_name='current_rating', old=..., new=...` realizuje SKL_5 (historia zmian ocen przez audit trail) bez dodatkowego kodu.

**Serwis**: `services/competency_service.py` — `get_gap_analysis(worker_id)` (SKL_4/JOB_6), `filter_workers_by_skill_gap(skill_id=None, min_gap=None)` (SKL_6).

**Trasy**: rozszerzenie `routes/jobs/routes.py` o `GET/PUT /api/<job_id>/skills` (JOB_4), `GET /api/<job_id>/workers` (JOB_5), `GET /api/<job_id>/gap-analysis`; rozszerzenie `routes/workers/routes.py` o `GET/POST/PUT/DELETE /api/<worker_id>/skills` i `POST /api/<worker_id>/skills/<skill_id>/remarks` (SKL_2/3).

**Frontend**: `JobViewPage.tsx` — sekcja „Wymagane umiejętności"; `WorkerViewPage.tsx` — zakładka „Kompetencje" z oceną, uwagami i tabelą luk kompetencyjnych.

---

## 9. Faza 4 — Badania lekarskie i BHP

**Tabele** (migracja `create_medical_and_bhp_tables`):
- `medical_exams`: `id SERIAL PK, worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE, description TEXT, performed_on DATE NOT NULL, valid_until DATE, kind TEXT NOT NULL CHECK (kind IN ('Preliminary','Periodic')), created_at, updated_at`. Indeksy: `idx_medical_exams_worker`, `idx_medical_exams_valid_until` (MED_5/MED_6, DSH_2).
- `bhp_trainings`: `id SERIAL PK, worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE, training_date DATE NOT NULL, valid_until DATE, kind TEXT NOT NULL CHECK (kind IN ('Initial','Periodic','Control')), created_at, updated_at`. Indeksy analogiczne (BHP_4/BHP_5, DSH_3).

**Repozytoria**: `repositories/medical/medical_exam_repository.py`, `repositories/bhp/bhp_training_repository.py` (obie `audit_entity_type='worker'`). Metoda `get_expiring(days_threshold)` na obu (MED_6/BHP_5), `get_all_for_worker(worker_id)` posortowane `valid_until ASC` (MED_5).

**Serwisy**: `services/medical_service.py`, `services/bhp_service.py` (walidacja `valid_until >= performed_on`, enum `kind`). **`services/alert_service.py`** (współdzielony — patrz decyzja przekrojowa #4): `get_expiring_medical(threshold_days)`, `get_expiring_bhp(threshold_days)`, kubełkowanie `{critical: ≤30d, warning: ≤60d, notice: ≤90d}` z progów Fazy 6 (z fallbackiem na twarde 30/60/90, zanim Faza 6 wyląduje).

**Trasy**: `routes/medical/routes.py`, `routes/bhp/routes.py` — obie `@module_permission_required('medical')`/`('bhp')`. Endpointy: `GET /api/worker/<worker_id>`, `POST /api/worker/<worker_id>`, `PUT /api/<id>`, `DELETE /api/<id>`, `GET /api/expiring?days=30` (globalny raport).

**Frontend**: `lib/api/medical.ts`, `bhp.ts`. `WorkerViewPage.tsx` — zakładki „Badania lekarskie" i „Szkolenia BHP". Nowe strony `pages/medical/MedicalExpiringReportPage.tsx`, `pages/bhp/BhpExpiringReportPage.tsx` z kolorowymi odznakami ważności (współdzielony komponent, spójny z kubełkami `alert_service`).

---

## 10. Faza 5 — Szkolenia wewnętrzne

**Tabele** (migracja `create_trainings_tables`):
- `trainings`: `id SERIAL PK, description TEXT NOT NULL, remarks TEXT, training_date DATE, completion INTEGER, related_docs TEXT, training_details TEXT, created_at, updated_at`. Indeks `idx_trainings_date` (NF_3, sortowanie TRN_1).
- `training_participants`: `id SERIAL PK, training_id INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE, worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE, start_date DATE, finish_date DATE, remarks TEXT, trainer_id TEXT REFERENCES workers(id) ON DELETE SET NULL, effectiveness_date DATE, created_at, updated_at`. Indeksy (kluczowe dla NF_3 — to tabela z 6612 wierszami): `idx_training_participants_training`, `idx_training_participants_worker`, `idx_training_participants_trainer` (ten ostatni czyni filtrowanie „własnych" szkoleń trenera z TRN_7 szybkim, nie tylko poprawnym).
- `training_job`: `id SERIAL PK, training_id INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, UNIQUE(training_id, job_id)`.
- `training_skills`: `id SERIAL PK, training_id INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE, skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE, UNIQUE(training_id, skill_id)`.

**Repozytoria**: `repositories/trainings/training_repository.py` (`audit_entity_type='training'`), `training_participant_repository.py` (`audit_entity_type='training'`, `entity_id=training_id`), `training_job_repository.py`, `training_skill_repository.py`. Kluczowe metody na `TrainingRepository`: `list_for_trainer(trainer_worker_id)`, `is_trainer_of(training_id, worker_id) -> bool`.

**Serwis**: `services/training_service.py` — `register_participant(...)` (TRN_8), `record_effectiveness(participant_id, effectiveness_date)` (TRN_9), oraz bramka własności dla TRN_7: `assert_trainer_can_edit(training_id, user)` — podnosi `PermissionDeniedError`, chyba że `own_data_worker_id(user, 'trainings')` zwraca `None` (rola z pełnym dostępem) lub `TrainingRepository().is_trainer_of(...)` zwraca `True`.

**Rozszerzenie `config/auth_config.py`**: nowa funkcja `own_data_worker_id(user, module_name)` (decyzja przekrojowa #6).

**Eksport CSV (TRN_11)**: `services/csv_export_service.py`'s `export_training_participants_csv(training_id) -> bytes`, kodowanie `'utf-8-sig'` (BOM, domyślne rozstrzygnięcie OQ_4). Route strumieniuje jako `text/csv` z nagłówkiem `Content-Disposition: attachment`.

**Ukrywanie danych dla `viewer` (RODO_3/OQ_3 — potwierdzone)**: `routes/trainings/routes.py` woła `_redact_for_viewer(payload)`, gdy `current_user.role == 'viewer'` — zamienia imię i nazwisko uczestnika/trenera na `worker_id` (np. „9001"); lista uczestników pozostaje widoczna (z identyfikatorami zamiast nazwisk), nie jest redukowana do samej liczby.

**Trasy**: `routes/trainings/routes.py`, blueprint `trainings_bp`, prefix `/trainings`, `@module_permission_required('trainings')`.

| Endpoint | Metoda | Brama |
|---|---|---|
| `/api?search=&sort=&page=` | GET | każda rola z dostępem (viewer dostaje payload zredagowany) — TRN_1 |
| `/api/<id>` | GET | jw., zredagowane dla viewer — TRN_2/3/4 |
| `/api` | POST | `role_required('superadmin','hr_manager')` — TRN_6 |
| `/api/<id>` | PUT | pełny dostęp bez warunków; `trainer` tylko gdy `assert_trainer_can_edit` przejdzie — TRN_7 |
| `/api/<id>` | DELETE | `role_required('superadmin','hr_manager')` |
| `/api/<id>/job-links`, `/skill-links` | GET/PUT | role z pełnym dostępem — TRN_3/4 |
| `/api/<id>/participants` | GET | każda rola z dostępem (zredagowane dla viewer) — TRN_5 |
| `/api/<id>/participants` | POST | pełny dostęp + trener-właściciel — TRN_8 |
| `/api/participants/<id>` | PUT | pełny dostęp + trener-właściciel — TRN_8/9 |
| `/api/<id>/participants/export` | GET | pełny dostęp + trener-właściciel; **nie** `viewer` — TRN_11 |
| `/api/worker/<worker_id>/history` | GET | tylko role z pełnym dostępem — TRN_10 |

**Frontend**: `lib/api/trainings.ts`, strony `pages/trainings/{TrainingsListPage,TrainingCreatePage,TrainingEditPage,TrainingViewPage}.tsx` (lista na `PaginatedTable`, 4652 wiersze — zbiór, dla którego ten komponent naprawdę powstał), `ParticipantsTable.tsx` z przyciskiem eksportu CSV, `WorkerViewPage.tsx` — zakładka „Historia szkoleń" (TRN_10).

---

## 11. Faza 6 — Agregacja alertów dashboardu

**Tabela** (migracja `create_alert_thresholds_table`, realizuje DSH_5):
```sql
CREATE TABLE alert_thresholds (
    module TEXT PRIMARY KEY CHECK (module IN ('medical','bhp','foreigner_docs')),
    warning_days INTEGER NOT NULL DEFAULT 60,
    critical_days INTEGER NOT NULL DEFAULT 30,
    notice_days INTEGER NOT NULL DEFAULT 90,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO alert_thresholds (module) VALUES ('medical'), ('bhp'), ('foreigner_docs')
ON CONFLICT DO NOTHING;
```

**Repozytorium**: `repositories/dashboard/alert_threshold_repository.py` (`AuditableMixin`, `audit_entity_type='alert_threshold'`).

**Serwis**: `services/dashboard_service.py` — `get_summary(user)` (DSH_1), `get_alerts(user)`: dla ról z pełnym dostępem zwraca panele medical/bhp/foreigner_docs (DSH_2/3/4); dla `trainer` — **żadnych paneli pracowniczych** (RODO_2 to twarda blokada, nie zawężenie own_data), tylko panel własnych szkoleń; dla `viewer` — 403 (macierz: ❌).

**Trasy**: `routes/dashboard/routes.py`, blueprint `dashboard_bp`, prefix `/dashboard`, `@module_permission_required('dashboard')`. `GET /api/summary`, `GET /api/alerts`, `GET`/`PUT /api/alert-thresholds` (`role_required('superadmin')` — DSH_5).

**Frontend**: `pages/DashboardPage.tsx` staje się stroną domyślną po zalogowaniu (zastępuje `Navigate to="/profile"` w `router.tsx`). Panele alertów przez współdzielony `AlertPanel.tsx`. `pages/dashboard/AlertThresholdsPage.tsx` (tylko superadmin) do edycji progów.

---

## 12. Faza 7 — Podgląd audit trail

Czysto addytywna — `audit_log` już działa end-to-end po stronie zapisu (każde repozytorium powyżej woła `_audit(...)` automatycznie przez `AuditableMixin`). Nowa jest tylko strona **odczytu**.

**Opcjonalna migracja** `add_ip_address_to_audit_log`: `ALTER TABLE audit_log ADD COLUMN ip_address TEXT;` + przekazanie `request.remote_addr` przez `AuditableMixin._audit`. Niski priorytet, nieblokujące żadnego wymagania PRD.

**Rozszerzenie repozytorium**: `repositories/audit_repository.py`'s `get_all()` — nowe parametry `user_id`, `action`, `date_from`, `date_to`, `limit`, `offset` (AUD_4), reużywające istniejący wzorzec budowania `conditions`/`params`.

**Trasa**: `routes/audit/routes.py`, blueprint `audit_bp`, prefix `/audit`, `@module_permission_required('audit')`. `GET /api?user_id=&entity_type=&action=&date_from=&date_to=&page=&page_size=` (AUD_3/AUD_4).

**Frontend**: `lib/api/audit.ts`, `pages/audit/AuditLogPage.tsx` na `PaginatedTable` z filtrami.

---

## 13. Faza 8 — Migracja danych legacy SQLite → PostgreSQL

**Otwarty warunek wstępny (OQ_7, blokujący)**: lokalizacja pliku źródłowego `database.db` jest nieznana/nieobecna w tym repozytorium. Ten skrypt nie może zostać uruchomiony, dopóki plik nie zostanie dostarczony.

**Podejście**, wzorowane na precedensie z tego repo (`DEPLOYMENT_VULTR.md` wspomina usunięty już `scripts/migrate_sqlite_to_postgres.py` użyty przy migracji domeny faktur):

Nowy `scripts/migrate_staamp_sqlite.py`:
1. Ścieżka źródłowa jako argument CLI, otwarcie tylko do odczytu przez `sqlite3` z `row_factory = sqlite3.Row`.
2. Migracja w kolejności zależności FK, zgodnej z sekwencją faz: `jobs` → `skills` → `workers` → `birth_data`/`worker_nationality`/`foreigner_data` → `job_skills` → `worker_skills`/`worker_skill_remarks` → `medical_exams` → `bhp_trainings` → `trainings` → `training_participants`/`training_job`/`training_skills`. Dzięki decyzji o zachowaniu naturalnych kluczy TEXT dla `workers`/`jobs`/`skills` **nie jest potrzebna żadna tabela przemapowania id** — istotne uproszczenie względem precedensu z domeny faktur.
3. Każda tabela migrowana w jednej `managed_transaction()` na partię (wsadowe wstawianie przez `psycopg2.extras.execute_values` dla przepustowości na tabelach 4652/6612-wierszowych), z logowaniem liczby rekordów przed/po i flagą `--dry-run`.
4. Kontrole integralności po migracji: zgodność liczby wierszy, skan osieroconych FK, spot-check parsowania dat w `medical_exams`/`bhp_trainings` (luźne typowanie SQLite na kolumnach `DATETIME` to najbardziej prawdopodobne źródło cichej korupcji danych — walidacja każdej daty przed insertem, odrzucenie/zalogowanie zamiast wymuszania konwersji).
5. **Nie dotyka** `users`/`audit_log` — to tabele nowe w tym systemie (PRD §8.3), seedowane osobno (Faza 0), nie migrowane z legacy `.db`.
6. Uruchomienie na świeżym, zmigrowanym do head'a schemacie Postgres (fazy 0–5 już zastosowane) najpierw w środowisku **nieprodukcyjnym**; to jednorazowe narzędzie cutover, nie część łańcucha Alembic.

---

## 14. Faza 9 — Strategia testów i weryfikacji

**Stan obecny**: zero testów w całym repozytorium mimo że `pytest`/`pytest-cov`/`pytest-mock`/`factory-boy` siedzą nieużywane w `requirements-dev.txt`. Biorąc pod uwagę 2-tygodniowy termin z nagłówka PRD, ten plan **nie** żąda pokrycia testami od zera — celuje w dwa obszary o najwyższym ryzyku cichego błędu:

1. **Logika progów/kubełkowania w `services/alert_service.py`** — funkcje czyste nad datami, łatwe do testowania bez bazy: `test_alert_service.py` sprawdzający warunki brzegowe (dokładnie 30/60/90 dni, już wygasłe, `valid_until IS NULL`, nadpisanie progów z `alert_thresholds`). To moduł zaprojektowany jako jedyne źródło prawdy dla trzech różnych powierzchni UI (odznaki pracownika, globalne raporty, dashboard) — błąd tutaj cicho propaguje się wszędzie naraz, co czyni go najwyżej wartościowym celem testowym w całym planie.
2. **Zawężanie RBAC `own_data`/`read_only`** — `test_auth_config.py` pokrywający `own_data_worker_id()` (brak powiązania → sentinel `-1`, powiązanie obecne → poprawne id, rola bez own_data → `None`), oraz `test_training_service.py` pokrywający `assert_trainer_can_edit` (właściciel przechodzi, nie-właściciel podnosi `PermissionDeniedError`, rola z pełnym dostępem omija sprawdzenie własności niezależnie). Regresja tutaj oznacza trenera edytującego cudze szkolenie albo, gorzej, `viewer`/`trainer` sięgającego do danych pracowniczych chronionych przez RODO_2 — to powierzchnia bezpieczeństwa/RODO, nie tylko błąd UX.
3. **Transakcyjne tworzenie w `services/worker_service.py`** — jeden test integracyjny (`factory-boy` + fixture testowej bazy/rollback, lub zamockowana trójka repozytoriów) weryfikujący, że błąd przy wstawianiu `foreigner_data` wycofuje już wstawione wiersze `workers`/`birth_data` (rzeczywista gwarancja ERR_1, nie tylko jego intencja).
4. Cała reszta (repozytoria CRUD, podpięcie tras) pozostawiona weryfikacji manualnej/eksploracyjnej z uwagi na harmonogram — jawnie zaznaczone jako zaakceptowana luka, nie przeoczenie, żeby recenzent mógł zakwestionować to założenie, jeśli termin ma jednak zapas.

Konfiguracja `pytest.ini`/`conftest.py`: katalog `tests/` odzwierciedlający `services/`/`config/` (nie `routes/`/`repositories/` — te wymagają żywej bazy i mają niższy ROI jako pierwszy cel testowania), fixture `conftest.py` z zamrożonym `datetime.now()` dla deterministycznych testów progów czasowych.

---

## 15. Decyzje biznesowe — rozstrzygnięte interaktywnie (17.08.2026)

Poniższe kwestie były pierwotnie otwartymi założeniami; zostały potwierdzone bezpośrednio z użytkownikiem przez `AskUserQuestion` i traktowane są teraz jako **wiążące decyzje projektowe**, nie domysły.

| PRD ID | Pytanie | Decyzja | Gdzie ma znaczenie |
|---|---|---|---|
| OQ_1 | Domyślne progi alertów | **Potwierdzono 30/60/90 dni** z DSH_2/3/4, zaseedowane w `alert_thresholds`, edytowalne przez superadmina (DSH_5). Dokumenty cudzoziemca — 30/60 (bez 90, zgodnie z WRK_10/DSH_4) | Faza 6 |
| OQ_2 | Semantyka skali ocen (1–3) | **Potwierdzono: tylko liczbowo**, bez etykiet poziomów — SKL_2/JOB_2 pokazują surową liczbę 1–3 | Faza 3 |
| OQ_3 | Dokładny zakres danych dla roli `viewer` | **Wariant pośredni**: viewer widzi listę/szczegóły `trainings` i listę uczestników, ale imię i nazwisko uczestnika/trenera zastąpione jest identyfikatorem pracownika (`worker_id`) — dotyczy zarówno uczestników, jak i trenerów. Eksport CSV pozostaje niedostępny dla `viewer` (identyfikujący z natury eksport nie pasuje do celu ograniczonego widoku) | Faza 5 |
| OQ_4 | Kodowanie/kolumny CSV | **Potwierdzono `utf-8-sig` (BOM)** dla zgodności z Excel; kolumny = wszystkie pola `training_participants` połączone z nazwiskiem pracownika i stanowiskiem | Faza 5 |
| OQ_5 | Polityka retencji backupów | **Potwierdzono 30 kopii**, zgodnie z domyślną wartością z PRD §10.3 (codzienny backup) | Poza fazami — warstwa infrastruktury |
| OQ_6 | Czy każdy `users` musi być powiązany z `workers`? | **Potwierdzono: nie** — `users.worker_id` jest nullable; konta `superadmin`/`hr_manager` mogą nie mieć rekordu pracownika, konta `trainer` powinny być powiązane (zawężanie own_data degraduje się bezpiecznie do „nic nie widzi" przez sentinel `-1`, jeśli nie są) | Faza 2, `own_data_worker_id` |
| — | Sprzeczność w AUTH_5: „automatyczne odblokowanie" vs „odblokowanie przez admina" | **Potwierdzono: oba mechanizmy naraz** — automatyczne odblokowanie po skonfigurowanym `LOCKOUT_MINUTES` (domyślnie 30 min) **oraz** jawny endpoint ręcznego odblokowania przez superadmina | Faza 0 |

### Cel wdrożenia i zakres biznesowy (rozstrzygnięte, z istotną zmianą ramy)

**Decyzja**: aplikacja pozostaje na obecnym środowisku **Vultr Linux VPS** (`DEPLOYMENT_VULTR.md`) — PRD §10 (Windows Server/IIS/sieć lokalna Staamp) traktowane jest jako nieaktualne wobec już podjętej decyzji infrastrukturalnej.

**Istotne doprecyzowanie towarzyszące tej decyzji**: aplikacja **nie jest budowana wyłącznie na potrzeby Staamp Poland** — PRD Staamp pełni rolę referencyjnej specyfikacji funkcjonalnej, ale produkt docelowo ma służyć szerszemu użyciu / ewentualnej sprzedaży, z modelem biznesowym **do ustalenia później**. Zobacz sekcję 1.1 po pełne omówienie konsekwencji. W skrócie:
- **NF_4** („dostęp wyłącznie z sieci lokalnej Staamp Poland") przestaje obowiązywać jako wymaganie — aplikacja jest (i pozostanie) dostępna z internetu przez Vultr.
- Plan **świadomie nie wprowadza wielodostępności (multi-tenancy)** na tym etapie — to osobna decyzja architektoniczna do podjęcia razem z modelem biznesowym, nie część obecnego zakresu.
- Backup/retencja (OQ_5) i inne kwestie stricte infrastrukturalne pozostają do potwierdzenia w kontekście docelowego hostingu, niezależnie od tego, kto ostatecznie będzie odbiorcą produktu.

---

## 16. Kluczowe pliki

- `config/auth_config.py` — przebudowa słownictwa RBAC, nowy helper `own_data_worker_id`, punkt podpięcia limitu bezczynności
- `database/schema.sql` — bazowy kształt `roles`/`role_permissions`/`audit_log`, wzorzec seedowania do powielenia dla nowego słownika modułów
- `repositories/auditable.py` i `repositories/base_repository.py` — mixin/klasa bazowa, na której budowane jest każde nowe repozytorium (fazy 1–6)
- `app.py` — rejestracja/wygaszanie blueprintów, podpięcie strażnika sesji, dołączanie singletonów repozytoriów
- `frontend/src/router.tsx` i `frontend/src/components/layout/navConfig.ts` — podpięcie tras/nawigacji każdego nowego modułu i sekwencja wygaszania stron salonu
- `PRD.md` — źródło prawdy dla każdego identyfikatora wymagania cytowanego w tym planie

---

## 17. Weryfikacja end-to-end

Po zakończeniu każdej fazy 1–7:
1. `alembic upgrade head` na czystej bazie deweloperskiej — migracja musi przejść bez błędów, `assert_schema_current()` (już wpięte w `app.py`) musi przejść przy starcie aplikacji.
2. Uruchomienie `run_dev.py`, ręczne przejście przez nowe endpointy przez `/auth/me` + zalogowanie jako każda z czterech ról (superadmin/hr_manager/trainer/viewer) — potwierdzenie, że macierz uprawnień z §4.2 PRD faktycznie blokuje/przepuszcza zgodnie z tabelą.
3. Dla faz z alertami (4, 6): ręczne wstawienie rekordu z `valid_until` w oknach 29/31/59/61/89/91 dni i potwierdzenie poprawnego kubełkowania.
4. Testy z Fazy 9 (`pytest`) uruchamiane w CI/lokalnie przed każdym mergem dotykającym `services/alert_service.py`, `config/auth_config.py`, `services/training_service.py`.
5. Po Fazie 8: porównanie liczby rekordów między SQLite źródłowym a Postgres docelowym dla każdej z 15 tabel domenowych, plus manualna weryfikacja próbki ~20 losowych pracowników na obu stronach.

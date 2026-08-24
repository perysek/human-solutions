# Dokument Wymagań Produktu (PRD)
## Aplikacja HR Staamp Poland

---

| **Wersja**       | 1.0                              |
|------------------|----------------------------------|
| **Data**         | 2026_04_24                       |
| **Status**       | Gotowy do implementacji          |
| **Projekt**      | hr_app_staamp                    |
| **Właściciel**   | Staamp Poland – Dział HR         |

Czas do zakończenia wdrożenia Aplikacji jako IIS na serwerze lokalnym Staaamp - 2 tygodnie od zatwierdzenia Dyrektora Zakładu.

---

## Spis treści

1. [Cel projektu](#1-cel-projektu)
2. [Zakres i kontekst](#2-zakres-i-kontekst)
3. [Definicje i skróty](#3-definicje-i-skróty)
4. [Użytkownicy docelowi i role RBAC](#4-użytkownicy-docelowi-i-role-rbac)
5. [Wymagania funkcjonalne](#5-wymagania-funkcjonalne)
6. [Wymagania niefunkcjonalne](#6-wymagania-niefunkcjonalne)
7. [Architektura techniczna](#7-architektura-techniczna)
8. [Model danych](#8-model-danych)
9. [Bezpieczeństwo i zgodność z RODO](#9-bezpieczeństwo-i-zgodność-z-rodo)
10. [Deployment i infrastruktura](#10-deployment-i-infrastruktura)
11. [Struktura folderów projektu](#11-struktura-folderów-projektu)
12. [Otwarte kwestie](#12-otwarte-kwestie)

---

## 1. Cel projektu

Celem projektu jest dostarczenie **webowej aplikacji HR** dla firmy Staamp Poland, umożliwiającej:

- centralne zarządzanie danymi pracowniczymi (dane podstawowe, dane urodzenia, obywatelstwo, dane cudzoziemców) zgodnie z wymogami RODO,
- śledzenie badań lekarskich i szkoleń BHP pracowników z powiadomieniami o upływających terminach ważności,
- zarządzanie macierzą kompetencji — słownikiem umiejętności, wymaganiami stanowiskowymi i oceną pracowników,
- obsługę modułu szkoleń wewnętrznych (katalog szkoleń, uczestnicy, trenerzy, skuteczność),
- rejestrację pełnej historii operacji (audit trail),
- bezpieczny dostęp oparty na rolach (RBAC) zgodny z RODO, wyłącznie w sieci lokalnej Staamp Poland.

---

## 2. Zakres i kontekst

### 2.1 W zakresie projektu

| Moduł                         | Opis                                                                 |
|-------------------------------|----------------------------------------------------------------------|
| **AUTH**                      | Autentykacja, autoryzacja RBAC, zarządzanie sesjami                 |
| **WORKERS**                   | Dane pracownicze, dane urodzenia, obywatelstwo, dane cudzoziemców   |
| **JOBS**                      | Stanowiska pracy, macierz wymaganych kompetencji na stanowisku       |
| **MEDICAL**                   | Badania lekarskie (wstępne, okresowe) z alertami terminów            |
| **BHP**                       | Szkolenia BHP (wstępne, okresowe, kontrolne) z alertami terminów     |
| **SKILLS**                    | Słownik umiejętności, oceny pracownicze, uwagi                      |
| **TRAININGS**                 | Katalog szkoleń wewnętrznych, uczestnicy, trenerzy, skuteczność     |
| **DASHBOARD**                 | Pulpit z alertami upływających terminów i statystykami              |
| **AUDIT**                     | Podgląd audit trail wszystkich operacji                             |
| **ADMIN**                     | Zarządzanie kontami użytkowników systemu                             |

### 2.2 Poza zakresem projektu

- Integracje z zewnętrznymi systemami ERP lub płacowymi
- Dostęp z sieci zewnętrznej / VPN
- Moduł rekrutacji
- Aplikacja mobilna
- Generowanie dokumentów (umów, zaświadczeń) w formacie DOCX

### 2.3 Kontekst biznesowy

Aplikacja działa wyłącznie w sieci lokalnej Staamp Poland i jest dostępna pod adresem:

```
http://10.52.10.101:8091/
```

Baza danych zawiera dane **236 pracowników**, **52 stanowiska**, **179 umiejętności**, **4652 szkolenia** i **6612 rekordów uczestnictwa** — dane są migrowane z istniejącej bazy SQLite.

---

## 3. Definicje i skróty

| Skrót / Termin        | Znaczenie                                                                  |
|-----------------------|----------------------------------------------------------------------------|
| **RBAC**              | Role-Based Access Control – kontrola dostępu oparta na rolach              |
| **RODO**              | Rozporządzenie o Ochronie Danych Osobowych (GDPR)                         |
| **Audit trail**       | Chronologiczny zapis zmian z informacją: kto, co i kiedy zmienił          |
| **Rollback**          | Cofnięcie transakcji bazodanowej w przypadku błędu zapisu                  |
| **BHP**               | Bezpieczeństwo i Higiena Pracy (Health & Safety)                          |
| **Macierz kompetencji** | Zestawienie wymaganych i posiadanych umiejętności dla stanowisk i pracowników |
| **Skuteczność szkolenia** | Zweryfikowanie, że pracownik zastosował w praktyce efekty szkolenia (effectiveness_date) |
| **XSS**               | Cross-Site Scripting – atak polegający na wstrzyknięciu kodu JavaScript    |
| **CRUD**              | Create, Read, Update, Delete – podstawowe operacje na danych               |

---

## 4. Użytkownicy docelowi i role RBAC

### 4.1 Definicja ról

| Rola           | Poziom | Opis                                                                                          |
|----------------|--------|-----------------------------------------------------------------------------------------------|
| `superadmin`   | 4      | Pełny dostęp do wszystkich modułów; administracja kontami użytkowników; podgląd audit trail   |
| `hr_manager`   | 3      | Pełny dostęp do danych pracowniczych i wszystkich modułów; brak zarządzania kontami systemu  |
| `trainer`      | 2      | Dostęp do modułu szkoleń wewnętrznych; CRUD tylko dla szkoleń, w których jest trenerem       |
| `viewer`       | 1      | Odczyt danych szkoleń wewnętrznych (bez danych osobowych pracowników)                        |

### 4.2 Macierz uprawnień

| Moduł                              | `superadmin` | `hr_manager` | `trainer`          | `viewer` |
|------------------------------------|:------------:|:------------:|:------------------:|:--------:|
| Dashboard / alerty                 | ✅            | ✅            | ✅ (własne)         | ❌        |
| Pracownicy – pełny CRUD            | ✅            | ✅            | ❌                  | ❌        |
| Pracownicy – odczyt                | ✅            | ✅            | ❌                  | ❌        |
| Stanowiska – pełny CRUD            | ✅            | ✅            | ❌                  | ❌        |
| Badania lekarskie – pełny CRUD     | ✅            | ✅            | ❌                  | ❌        |
| Szkolenia BHP – pełny CRUD         | ✅            | ✅            | ❌                  | ❌        |
| Umiejętności – pełny CRUD          | ✅            | ✅            | ❌                  | ❌        |
| Oceny pracownicze – pełny CRUD     | ✅            | ✅            | ❌                  | ❌        |
| Szkolenia wewn. – pełny CRUD       | ✅            | ✅            | ❌                  | ❌        |
| Szkolenia wewn. – własne (CRUD)    | ✅            | ✅            | ✅ (tylko swoje)    | ❌        |
| Szkolenia wewn. – odczyt           | ✅            | ✅            | ✅                  | ✅        |
| Audit trail – podgląd              | ✅            | ✅            | ❌                  | ❌        |
| Zarządzanie użytkownikami systemu  | ✅            | ❌            | ❌                  | ❌        |
| Ustawienia systemu                 | ✅            | ❌            | ❌                  | ❌        |

> **RODO:** Rola `trainer` nie ma dostępu do danych osobowych pracowników (tabele: `workers`, `birth_data`, `foreigner_data`, `worker_nationality`). Rola `viewer` widzi wyłącznie zagregowane dane szkoleń bez identyfikacji personalnej.

---

## 5. Wymagania funkcjonalne

### 5.1 Moduł autentykacji (AUTH)

| ID     | Wymaganie                                                                                    | Priorytet |
|--------|----------------------------------------------------------------------------------------------|-----------|
| AUTH_1 | Logowanie przez formularz login/hasło                                                        | Krytyczny |
| AUTH_2 | Hasła przechowywane jako hash bcrypt, nigdy w plaintext                                      | Krytyczny |
| AUTH_3 | Sesja zarządzana przez Flask-Login z bezpiecznym cookie (HttpOnly, SameSite)                 | Krytyczny |
| AUTH_4 | Automatyczne wylogowanie po 30 minutach bezczynności (konfigurowalne)                        | Wysoki    |
| AUTH_5 | Blokada konta po 5 nieudanych próbach logowania (konfigurowalne, odblokowanie przez admina)  | Wysoki    |
| AUTH_6 | Strona profilu z możliwością zmiany hasła przez zalogowanego użytkownika                     | Średni    |
| AUTH_7 | Logi wszystkich prób logowania (udane/nieudane) w audit trail                                | Wysoki    |

### 5.2 Moduł pracowników (WORKERS)

| ID    | Wymaganie                                                                                          | Priorytet |
|-------|----------------------------------------------------------------------------------------------------|-----------|
| WRK_1 | Lista pracowników z wyszukiwaniem (nazwisko, imię, stanowisko), sortowaniem i paginacją           | Krytyczny |
| WRK_2 | Profil pracownika: dane podstawowe (id, imię, nazwisko, stanowisko, przełożony, płeć, daty zatrudnienia) | Krytyczny |
| WRK_3 | Sekcja danych urodzenia (data, miejsce) w profilu pracownika                                       | Krytyczny |
| WRK_4 | Sekcja obywatelstwa / narodowości pracownika (obsługa wielu narodowości)                           | Krytyczny |
| WRK_5 | Sekcja danych cudzoziemca: rodzaj dokumentu, data ważności dokumentu, podstawa zatrudnienia, data ważności podstawy | Krytyczny |
| WRK_6 | Dodanie nowego pracownika (formularz z walidacją wszystkich pól)                                   | Krytyczny |
| WRK_7 | Edycja danych pracownika z zapisem zmiany w audit trail                                            | Krytyczny |
| WRK_8 | Dezaktywacja pracownika przez ustawienie `fire_date` (soft-delete, dane pozostają w bazie)         | Krytyczny |
| WRK_9 | Widok hierarchii podwładnych: lista pracowników przypisanych do danego przełożonego (`boss_id`)    | Wysoki    |
| WRK_10| Alert / oznaczenie pracowników, których dokumenty cudzoziemca wygasają w ciągu 30/60 dni          | Wysoki    |
| WRK_11| Filtrowanie listy: aktywni / nieaktywni / wszyscy                                                  | Wysoki    |

### 5.3 Moduł stanowisk (JOBS)

| ID    | Wymaganie                                                                                          | Priorytet |
|-------|----------------------------------------------------------------------------------------------------|-----------|
| JOB_1 | Lista stanowisk z wyszukiwaniem i paginacją                                                        | Krytyczny |
| JOB_2 | Szczegóły stanowiska: id, opis, lista wymaganych umiejętności z minimalną oceną (`required_rating`) | Krytyczny |
| JOB_3 | Dodawanie / edycja stanowiska                                                                      | Wysoki    |
| JOB_4 | Zarządzanie wymaganymi umiejętnościami dla stanowiska (CRUD na `job_skills`)                       | Wysoki    |
| JOB_5 | Lista pracowników przypisanych do danego stanowiska                                                | Średni    |
| JOB_6 | Porównanie posiadanych umiejętności pracownika z wymaganiami stanowiska (gap analysis)             | Wysoki    |

### 5.4 Moduł badań lekarskich (MEDICAL)

| ID    | Wymaganie                                                                                           | Priorytet |
|-------|-----------------------------------------------------------------------------------------------------|-----------|
| MED_1 | Lista badań lekarskich danego pracownika: rodzaj, data wykonania, data ważności, opis               | Krytyczny |
| MED_2 | Typy badań: `Preliminary` (wstępne), `Periodic` (okresowe)                                         | Krytyczny |
| MED_3 | Dodanie / edycja badania dla pracownika                                                             | Krytyczny |
| MED_4 | Alert na dashboardzie i liście pracowników dla badań wygasających w ciągu 30/60/90 dni             | Wysoki    |
| MED_5 | Filtrowanie / sortowanie po dacie ważności (od najbliższej)                                        | Wysoki    |
| MED_6 | Globalny widok (raport): wszyscy pracownicy z wygasającymi lub wygasłymi badaniami                 | Wysoki    |

### 5.5 Moduł szkoleń BHP (BHP)

| ID    | Wymaganie                                                                                           | Priorytet |
|-------|-----------------------------------------------------------------------------------------------------|-----------|
| BHP_1 | Lista szkoleń BHP danego pracownika: rodzaj, data szkolenia, data ważności                          | Krytyczny |
| BHP_2 | Typy szkoleń BHP: `Initial` (wstępne), `Periodic` (okresowe), `Control` (kontrolne)                | Krytyczny |
| BHP_3 | Dodanie / edycja szkolenia BHP dla pracownika                                                       | Krytyczny |
| BHP_4 | Alert na dashboardzie dla szkoleń BHP wygasających w ciągu 30/60/90 dni                            | Wysoki    |
| BHP_5 | Globalny widok (raport): pracownicy z wygasającymi lub wygasłymi szkoleniami BHP                   | Wysoki    |

### 5.6 Moduł umiejętności i kompetencji (SKILLS)

| ID     | Wymaganie                                                                                          | Priorytet |
|--------|----------------------------------------------------------------------------------------------------|-----------|
| SKL_1  | Słownik umiejętności: lista, dodawanie, edycja (tabela `skills`, 179 pozycji)                     | Krytyczny |
| SKL_2  | Ocena umiejętności pracownika: przypisanie umiejętności z oceną (`current_rating`) i datą aktualizacji | Krytyczny |
| SKL_3  | Uwagi do oceny umiejętności pracownika (`worker_skill_remarks`)                                    | Wysoki    |
| SKL_4  | Macierz kompetencji pracownika: zestawienie posiadanych umiejętności vs. wymagań stanowiska        | Wysoki    |
| SKL_5  | Historia zmian oceny umiejętności (poprzez audit trail)                                            | Wysoki    |
| SKL_6  | Filtrowanie pracowników po poziomie umiejętności / lukach kompetencyjnych                          | Średni    |

### 5.7 Moduł szkoleń wewnętrznych (TRAININGS)

| ID     | Wymaganie                                                                                           | Priorytet |
|--------|-----------------------------------------------------------------------------------------------------|-----------|
| TRN_1  | Katalog szkoleń z wyszukiwaniem (nazwa, data, powiązana umiejętność), sortowaniem i paginacją       | Krytyczny |
| TRN_2  | Szczegóły szkolenia: opis, uwagi, data, status ukończenia, dokumenty referencyjne, szczegóły        | Krytyczny |
| TRN_3  | Powiązanie szkolenia ze stanowiskami (`training_job`): dla jakich stanowisk szkolenie jest przeznaczone | Wysoki |
| TRN_4  | Powiązanie szkolenia z umiejętnościami (`training_skills`): jakie umiejętności szkolenie obejmuje   | Wysoki    |
| TRN_5  | Lista uczestników szkolenia z datami start/koniec, trenerem, uwagami, datą skuteczności            | Krytyczny |
| TRN_6  | Dodanie szkolenia (dostęp: `superadmin`, `hr_manager`)                                             | Krytyczny |
| TRN_7  | Edycja szkolenia – rola `trainer` może edytować wyłącznie szkolenia, w których figuruje jako trener | Krytyczny |
| TRN_8  | Rejestracja uczestnika w szkoleniu i wprowadzenie wyników (start_date, finish_date, remarks)        | Krytyczny |
| TRN_9  | Rejestracja daty skuteczności szkolenia (`effectiveness_date`) dla uczestnika                       | Wysoki    |
| TRN_10 | Historia szkoleń pracownika w jego profilu                                                          | Wysoki    |
| TRN_11 | Eksport listy uczestników szkolenia do CSV                                                          | Średni    |

### 5.8 Dashboard i alerty

| ID    | Wymaganie                                                                                           | Priorytet |
|-------|-----------------------------------------------------------------------------------------------------|-----------|
| DSH_1 | Pulpit z podsumowaniem: liczba aktywnych pracowników, szkoleń w bieżącym miesiącu                  | Wysoki    |
| DSH_2 | Panel alertów: wygasające badania lekarskie (30/60/90 dni)                                         | Wysoki    |
| DSH_3 | Panel alertów: wygasające szkolenia BHP (30/60/90 dni)                                             | Wysoki    |
| DSH_4 | Panel alertów: wygasające dokumenty cudzoziemców (30/60 dni)                                       | Wysoki    |
| DSH_5 | Progi alertów konfigurowalne przez `superadmin`                                                     | Średni    |

### 5.9 Audit Trail

| ID    | Wymaganie                                                                                              | Priorytet |
|-------|--------------------------------------------------------------------------------------------------------|-----------|
| AUD_1 | Każda operacja zapisu (INSERT/UPDATE) rejestruje: timestamp, user_id, typ operacji, tabela, stary i nowy stan rekordu | Krytyczny |
| AUD_2 | Logi są niemutowalne — brak możliwości edycji lub usunięcia przez interfejs                           | Krytyczny |
| AUD_3 | Podgląd audit trail dostępny dla `superadmin` i `hr_manager`                                          | Wysoki    |
| AUD_4 | Filtrowanie logu po: użytkowniku, przedziale dat, typie operacji, module / tabeli                     | Wysoki    |
| AUD_5 | Logi zdarzeń autentykacji: logowanie (udane/nieudane), wylogowanie                                    | Wysoki    |

### 5.10 Obsługa błędów

| ID    | Wymaganie                                                                                           | Priorytet |
|-------|-----------------------------------------------------------------------------------------------------|-----------|
| ERR_1 | Każda operacja zapisu opakowana w transakcję SQLite z automatycznym rollback przy błędzie           | Krytyczny |
| ERR_2 | Błędy bazodanowe prezentowane użytkownikowi jako czytelny komunikat bez ujawniania stack trace      | Krytyczny |
| ERR_3 | Błędy logowane do pliku logów serwera z pełnym stack trace                                          | Wysoki    |
| ERR_4 | Strona 404 i 500 z przyjaznym komunikatem i przyciskiem powrotu do dashboardu                       | Wysoki    |

---

## 6. Wymagania niefunkcjonalne

### 6.1 Wydajność

| ID   | Wymaganie                                                                                         |
|------|---------------------------------------------------------------------------------------------------|
| NF_1 | Czas odpowiedzi na zapytania listujące (≤ 500 rekordów) nie przekracza 2 sekund                  |
| NF_2 | Aplikacja obsługuje jednoczesny dostęp maksymalnie 10 użytkowników (środowisko lokalne)           |
| NF_3 | Zapytania na tabelach `training_participants` (6612 wierszy) i `trainings` (4652 wiersze) zoptymalizowane przez indeksy SQLite |

### 6.2 Dostępność i niezawodność

| ID   | Wymaganie                                                                                         |
|------|---------------------------------------------------------------------------------------------------|
| NF_4 | Dostęp wyłącznie z sieci lokalnej Staamp Poland                                                  |
| NF_5 | Automatyczny backup bazy danych SQLite — codzienny, przechowywany na udziale wirtualnym          |
| NF_6 | Aplikacja uruchamiana jako usługa systemowa Windows Server (Docker + Gunicorn + Nginx)           |

### 6.3 Utrzymywalność

| ID   | Wymaganie                                                                                         |
|------|---------------------------------------------------------------------------------------------------|
| NF_7 | Migracje schematu bazy danych zarządzane przez Alembic                                           |
| NF_8 | Konfiguracja środowiskowa w pliku `.env` (poza repozytorium)                                     |
| NF_9 | Kod podzielony na warstwy: routes → services → repositories → database                           |

---

## 7. Architektura techniczna

### 7.1 Stos technologiczny

| Warstwa            | Technologia                                     | Wersja       |
|--------------------|-------------------------------------------------|--------------|
| **Backend**        | Python / Flask                                  | Flask 3.0.x  |
| **Autentykacja**   | Flask-Login + bcrypt                            | 0.6.x / 4.x |
| **ORM / DB**       | SQLAlchemy + SQLite                             | najnowsza    |
| **Migracje**       | Alembic                                         | 1.13.x       |
| **Frontend**       | Jinja2 + Tailwind CSS + Vanilla JavaScript      | Tailwind 3.x |
| **Serwer WSGI**    | Gunicorn                                        | najnowsza    |
| **Reverse proxy**  | Nginx                                           | najnowsza    |
| **Konteneryzacja** | Docker + Docker Compose                         | najnowsza    |

### 7.2 Wzorzec architektoniczny

```
Przeglądarka (HTML / Tailwind CSS / Vanilla JS)
        │
  Flask Routes / Blueprints         ← walidacja wejścia, RBAC dekoratory
        │
  Services (Business Logic)         ← logika biznesowa, reguły dostępu, alerty
        │
  Repositories (Data Access)        ← CRUD, transakcje, rollback, audit trail
        │
  SQLite via SQLAlchemy              ← persystencja danych
```

### 7.3 Blueprinty Flask

| Blueprint    | Prefix URL       | Opis                                     |
|--------------|------------------|------------------------------------------|
| `auth`       | `/auth`          | Logowanie, wylogowanie, profil           |
| `workers`    | `/workers`       | Zarządzanie pracownikami                 |
| `jobs`       | `/jobs`          | Stanowiska i macierz kompetencji         |
| `medical`    | `/medical`       | Badania lekarskie                        |
| `bhp`        | `/bhp`           | Szkolenia BHP                            |
| `skills`     | `/skills`        | Słownik umiejętności i oceny             |
| `trainings`  | `/trainings`     | Szkolenia wewnętrzne                     |
| `dashboard`  | `/`              | Pulpit i alerty                          |
| `audit`      | `/audit`         | Podgląd audit trail                      |
| `admin`      | `/admin`         | Zarządzanie użytkownikami systemu        |
| `api`        | `/api`           | Endpointy REST dla requestów AJAX        |

---

## 8. Model danych

Baza danych SQLite zawiera 15 tabel dziedziczonych z poprzedniej aplikacji, uzupełnionych o tabele systemowe (`users`, `audit_log`).

### 8.1 Diagram relacji (ERD — uproszczony)

```
workers ──────────────────────────────────────────────────┐
  │                                                        │ (boss_id self-ref)
  ├── birth_data          (1:1)                            │
  ├── worker_nationality  (1:N)                            │
  ├── foreigner_data      (1:1)                            │
  ├── medical_exams       (1:N)                            │
  ├── bhp_trainings       (1:N)                            │
  ├── worker_skills       (N:M via skill_id) ──→ skills    │
  │     └── worker_skill_remarks (1:N)                     │
  └── training_participants (N:M via training_id) ──→ trainings
                                                    │
jobs ──────────────────────────────────────────────┤
  └── job_skills (N:M via skill_id) ──→ skills     │
  └── training_job (N:M via training_id) ───────────┤
                                                    │
training_skills (N:M) ──→ skills                   │
                                                    ┘
users            ← konta systemu HR (poza oryginalnym schematem)
audit_log        ← log operacji (poza oryginalnym schematem)
```

### 8.2 Tabele dziedziczone z bazy danych

#### `workers` — Pracownicy

| Kolumna     | Typ      | Opis                                                         |
|-------------|----------|--------------------------------------------------------------|
| `id`        | TEXT PK  | Identyfikator pracownika (np. `9001`)                        |
| `firstname` | TEXT     | Imię                                                         |
| `surname`   | TEXT     | Nazwisko                                                     |
| `job_id`    | TEXT FK  | Stanowisko → `jobs.id`                                       |
| `boss_id`   | TEXT FK  | Przełożony → `workers.id` (samoreferencja, nullable)        |
| `gender`    | TEXT     | Płeć: `Male` / `Female` / `UNKNOWN`                         |
| `hire_date` | DATETIME | Data zatrudnienia                                            |
| `fire_date` | DATETIME | Data zwolnienia (NULL = aktywny)                             |

#### `jobs` — Stanowiska

| Kolumna       | Typ      | Opis                                       |
|---------------|----------|--------------------------------------------|
| `id`          | TEXT PK  | Identyfikator stanowiska (np. `BRYGADZISTA`) |
| `description` | TEXT     | Opis stanowiska (nullable)                 |

#### `skills` — Słownik umiejętności

| Kolumna       | Typ      | Opis                                          |
|---------------|----------|-----------------------------------------------|
| `id`          | TEXT PK  | Identyfikator umiejętności (np. `0002`)       |
| `description` | TEXT     | Opis umiejętności (np. `AUDYTOR WEWNĘTRZNY`)  |

#### `birth_data` — Dane urodzenia pracownika

| Kolumna       | Typ      | Opis                                 |
|---------------|----------|--------------------------------------|
| `id`          | INTEGER PK | Klucz główny                       |
| `worker_id`   | INTEGER FK | → `workers.id` (CASCADE)          |
| `birth_date`  | DATETIME | Data urodzenia                       |
| `birth_place` | TEXT     | Miejsce urodzenia                    |

#### `worker_nationality` — Obywatelstwo pracownika

| Kolumna       | Typ      | Opis                                       |
|---------------|----------|--------------------------------------------|
| `id`          | INTEGER PK | Klucz główny                             |
| `worker_id`   | INTEGER FK | → `workers.id` (CASCADE)               |
| `nationality` | TEXT     | Narodowość (np. `Local`, `Włochy`, `Ukraina`) |

#### `foreigner_data` — Dane dokumentów cudzoziemca

| Kolumna                      | Typ      | Opis                                              |
|------------------------------|----------|---------------------------------------------------|
| `id`                         | INTEGER PK | Klucz główny                                    |
| `worker_id`                  | INTEGER FK | → `workers.id` (CASCADE)                       |
| `document_kind`              | TEXT     | Rodzaj dokumentu (np. `Stay Card`, `Passport`)    |
| `document_validity`          | DATETIME | Data ważności dokumentu                           |
| `employment_basis`           | TEXT     | Podstawa prawna zatrudnienia                      |
| `employment_basis_validity`  | DATETIME | Data ważności podstawy zatrudnienia               |

#### `medical_exams` — Badania lekarskie

| Kolumna        | Typ      | Opis                                                   |
|----------------|----------|--------------------------------------------------------|
| `id`           | INTEGER PK | Klucz główny                                         |
| `description`  | TEXT     | Opis (nullable)                                        |
| `performed_on` | DATETIME | Data wykonania badania                                 |
| `valid_until`  | DATETIME | Data ważności orzeczenia                               |
| `kind`         | TEXT     | Rodzaj: `Preliminary` (wstępne) / `Periodic` (okresowe) |
| `worker_id`    | TEXT FK  | → `workers.id` (CASCADE)                              |

#### `bhp_trainings` — Szkolenia BHP pracownika

| Kolumna         | Typ      | Opis                                                             |
|-----------------|----------|------------------------------------------------------------------|
| `id`            | INTEGER PK | Klucz główny                                                   |
| `training_date` | DATETIME | Data szkolenia                                                   |
| `valid_until`   | DATETIME | Data ważności szkolenia                                          |
| `kind`          | TEXT     | Rodzaj: `Initial` / `Periodic` (okresowe) / `Control` (kontrolne) |
| `worker_id`     | TEXT FK  | → `workers.id` (CASCADE)                                        |

#### `trainings` — Katalog szkoleń wewnętrznych

| Kolumna           | Typ      | Opis                                              |
|-------------------|----------|---------------------------------------------------|
| `id`              | INTEGER PK | Klucz główny (AUTOINCREMENT)                    |
| `description`     | TEXT     | Nazwa / opis szkolenia                            |
| `remarks`         | TEXT     | Uwagi ogólne                                      |
| `training_date`   | NUMERIC  | Data szkolenia                                    |
| `completion`      | INTEGER  | Status ukończenia (nullable)                      |
| `related_docs`    | TEXT     | Dokumenty powiązane / referencyjne               |
| `training_details`| TEXT     | Szczegóły szkolenia                               |

#### `training_participants` — Uczestnicy szkoleń

| Kolumna              | Typ      | Opis                                                    |
|----------------------|----------|---------------------------------------------------------|
| `id`                 | INTEGER PK | Klucz główny                                          |
| `training_id`        | INTEGER FK | → `trainings.id` (CASCADE)                           |
| `worker_id`          | TEXT FK  | → `workers.id` (CASCADE)                               |
| `start_date`         | DATETIME | Data rozpoczęcia uczestnictwa                          |
| `finish_date`        | DATETIME | Data zakończenia uczestnictwa                          |
| `remarks`            | TEXT     | Uwagi indywidualne uczestnika                          |
| `trainer_id`         | INTEGER  | ID trenera (referencja do `workers.id`)                |
| `effectiveness_date` | DATETIME | Data weryfikacji skuteczności szkolenia                |

#### `training_job` — Powiązanie szkolenie ↔ stanowisko

| Kolumna        | Typ      | Opis                                 |
|----------------|----------|--------------------------------------|
| `id`           | INTEGER PK | Klucz główny                       |
| `training_id`  | INTEGER FK | → `trainings.id`                  |
| `job_id`       | TEXT FK  | → `jobs.id`                          |

#### `training_skills` — Powiązanie szkolenie ↔ umiejętność

| Kolumna        | Typ      | Opis                                 |
|----------------|----------|--------------------------------------|
| `id`           | INTEGER PK | Klucz główny                       |
| `training_id`  | INTEGER FK | → `trainings.id`                  |
| `skill_id`     | TEXT FK  | → `skills.id` (CASCADE)              |

#### `worker_skills` — Oceny umiejętności pracownika

| Kolumna          | Typ      | Opis                                        |
|------------------|----------|---------------------------------------------|
| `id`             | INTEGER PK | Klucz główny                              |
| `skill_id`       | TEXT FK  | → `skills.id`                               |
| `worker_id`      | TEXT FK  | → `workers.id` (CASCADE)                    |
| `current_rating` | INTEGER  | Aktualna ocena (1–3)                        |
| `last_update`    | DATETIME | Data ostatniej aktualizacji oceny           |

#### `worker_skill_remarks` — Uwagi do oceny umiejętności

| Kolumna           | Typ      | Opis                                          |
|-------------------|----------|-----------------------------------------------|
| `id`              | INTEGER PK | Klucz główny                                |
| `worker_skill_id` | INTEGER FK | → `worker_skills.id` (CASCADE)             |
| `remarks`         | TEXT     | Treść uwagi                                   |

#### `job_skills` — Wymagania kompetencyjne stanowiska

| Kolumna           | Typ      | Opis                                             |
|-------------------|----------|--------------------------------------------------|
| `id`              | INTEGER PK | Klucz główny                                   |
| `skill_id`        | TEXT FK  | → `skills.id` (CASCADE)                          |
| `job_id`          | TEXT FK  | → `jobs.id` (CASCADE)                            |
| `required_rating` | INTEGER  | Wymagany minimalny poziom oceny (1–3)            |

### 8.3 Tabele systemowe (nowe — poza oryginalną bazą)

#### `users` — Konta użytkowników systemu HR

| Kolumna           | Typ          | Opis                                                               |
|-------------------|--------------|--------------------------------------------------------------------|
| `id`              | INTEGER PK   | Klucz główny                                                       |
| `username`        | TEXT UNIQUE  | Login użytkownika                                                  |
| `email`           | TEXT UNIQUE  | Adres e-mail                                                       |
| `password_hash`   | TEXT         | Hash bcrypt                                                        |
| `role`            | TEXT         | `superadmin` / `hr_manager` / `trainer` / `viewer`                |
| `worker_id`       | TEXT FK      | Powiązanie z rekordem pracownika (nullable) → `workers.id`        |
| `is_active`       | BOOLEAN      | Czy konto aktywne                                                  |
| `failed_logins`   | INTEGER      | Licznik nieudanych prób logowania                                  |
| `locked_until`    | DATETIME     | Blokada konta do danego czasu (nullable)                           |
| `created_at`      | DATETIME     | Data utworzenia konta                                              |
| `last_login_at`   | DATETIME     | Ostatnie logowanie                                                 |

#### `audit_log` — Log operacji

| Kolumna       | Typ        | Opis                                                            |
|---------------|------------|-----------------------------------------------------------------|
| `id`          | INTEGER PK | Klucz główny                                                    |
| `timestamp`   | DATETIME   | Dokładny czas operacji                                          |
| `user_id`     | INTEGER FK | Kto wykonał operację → `users.id`                              |
| `action`      | TEXT       | `INSERT` / `UPDATE` / `DELETE` / `LOGIN` / `LOGOUT` / `FAILED_LOGIN` |
| `table_name`  | TEXT       | Której tabeli dotyczy operacja                                  |
| `record_id`   | TEXT       | ID zmienianego rekordu                                          |
| `old_values`  | JSON       | Stan przed zmianą (NULL dla INSERT)                             |
| `new_values`  | JSON       | Stan po zmianie (NULL dla DELETE)                               |
| `ip_address`  | TEXT       | Adres IP klienta                                                |

---

## 9. Bezpieczeństwo i zgodność z RODO

### 9.1 Mechanizmy bezpieczeństwa

| ID    | Mechanizm                                                                                         | Status    |
|-------|---------------------------------------------------------------------------------------------------|-----------|
| SEC_1 | Escape HTML we wszystkich danych wyjściowych — Jinja2 autoescaping (ochrona XSS)                 | Wymagane  |
| SEC_2 | CSRF protection (Flask-WTF lub ręczne tokeny CSRF w formularzach)                                | Wymagane  |
| SEC_3 | Wyłącznie parametryzowane zapytania SQL (SQLAlchemy ORM — brak raw SQL z interpolacją)           | Wymagane  |
| SEC_4 | `SECRET_KEY` i `DATABASE_PATH` w zmiennych środowiskowych `.env`, poza kodem źródłowym          | Wymagane  |
| SEC_5 | Plik bazy SQLite na udziale wirtualnym z dostępem ograniczonym do administratora infrastruktury  | Wymagane  |
| SEC_6 | Dostęp do aplikacji wyłącznie z sieci lokalnej (firewall / Nginx — brak ekspozycji na internet) | Wymagane  |
| SEC_7 | Brak ujawniania stack trace użytkownikowi końcowemu                                               | Wymagane  |
| SEC_8 | Cookie sesji: `HttpOnly=True`, `SameSite=Lax`                                                    | Wymagane  |

### 9.2 Zgodność z RODO

| ID      | Wymaganie                                                                                           |
|---------|-----------------------------------------------------------------------------------------------------|
| RODO_1  | Dane osobowe pracowników dostępne wyłącznie dla `superadmin` i `hr_manager`                        |
| RODO_2  | Rola `trainer` nie ma dostępu do `workers`, `birth_data`, `foreigner_data`, `worker_nationality`   |
| RODO_3  | Każda operacja na danych osobowych odnotowana w `audit_log`                                         |
| RODO_4  | Dezaktywacja pracownika przez soft-delete (`fire_date`) — dane nie są fizycznie usuwane            |
| RODO_5  | Dostęp fizyczny do pliku `.db` ograniczony do administratora infrastruktury Staamp Poland          |
| RODO_6  | Logi aplikacji nie zawierają danych osobowych w plaintext                                           |

---

## 10. Deployment i infrastruktura

### 10.1 Architektura wdrożenia

```
[Sieć lokalna Staamp Poland]
         │
[Windows Server – Udział wirtualny]
         │
    [Docker Container]
    ┌────────────────────┐
    │  Nginx : 8091      │  ← http://10.52.10.101:8091/
    │  Gunicorn (WSGI)   │
    │  Flask app         │
    └────────────────────┘
         │               │
    [SQLite .db]     [Backup dir]
    (udział wirtualny, dostęp ograniczony)
```

### 10.2 Szkic `docker-compose.yml`

```yaml
services:
  app:
    build: .
    ports:
      - "8091:8091"
    volumes:
      - ${DB_HOST_PATH}:/app/data
      - ${BACKUP_HOST_PATH}:/app/backups
    environment:
      - SECRET_KEY=${SECRET_KEY}
      - DATABASE_PATH=/app/data/database.db
      - BACKUP_PATH=/app/backups
    restart: unless-stopped
```

### 10.3 Backup bazy danych

- Codzienny automatyczny backup pliku `database.db` przez skrypt uruchamiany przez Windows Task Scheduler
- Lokalizacja: udział wirtualny (dostęp ograniczony do administratora infrastruktury)
- Retencja: 30 kopii (konfigurowalne)
- Format pliku: `database_YYYY-MM-DD.db`

---

## 11. Struktura folderów projektu

```
hr_app_staamp/
├── app.py                              # Fabryka aplikacji Flask (create_app)
├── requirements.txt                    # Zależności Python
├── alembic.ini                         # Konfiguracja Alembic
├── tailwind.config.js                  # Konfiguracja Tailwind CSS
├── .env                                # Zmienne środowiskowe (NIE w repo)
├── Dockerfile
├── docker-compose.yml
│
├── config/
│   ├── settings.py                     # APP_NAME, VERSION, ścieżki
│   ├── database.py                     # Połączenie SQLite, inicjalizacja
│   └── auth_config.py                  # Role RBAC, dekoratory uprawnień
│
├── database/
│   ├── models.py                       # Modele SQLAlchemy (wszystkie 15 + 2 tabel)
│   └── schema.sql                      # Inicjalny DDL (opcjonalnie)
│
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/                       # Migracje schematu
│
├── repositories/
│   ├── base_repository.py              # Transakcje, rollback, audit trail
│   ├── audit_repository.py             # Zapis do audit_log
│   ├── users/
│   │   └── user_repository.py
│   ├── workers/
│   │   └── worker_repository.py        # workers + birth_data + nationality + foreigner
│   ├── jobs/
│   │   └── job_repository.py           # jobs + job_skills
│   ├── medical/
│   │   └── medical_repository.py
│   ├── bhp/
│   │   └── bhp_repository.py
│   ├── skills/
│   │   └── skill_repository.py         # skills + worker_skills + remarks
│   └── trainings/
│       └── training_repository.py      # trainings + participants + job + skills
│
├── services/
│   ├── auth/
│   │   └── auth_service.py             # Logika autentykacji, bcrypt
│   ├── worker_service.py
│   ├── job_service.py
│   ├── medical_service.py              # Logika alertów badań lekarskich
│   ├── bhp_service.py                  # Logika alertów BHP
│   ├── skill_service.py                # Gap analysis, macierz kompetencji
│   ├── training_service.py             # Logika szkoleń, filtr trenera
│   └── dashboard_service.py            # Agregacja alertów dla dashboardu
│
├── routes/
│   ├── auth/routes.py
│   ├── workers/routes.py
│   ├── jobs/routes.py
│   ├── medical/routes.py
│   ├── bhp/routes.py
│   ├── skills/routes.py
│   ├── trainings/routes.py
│   ├── dashboard/routes.py
│   ├── audit/routes.py
│   ├── admin/routes.py
│   └── api/routes.py                   # Endpointy AJAX (JSON)
│
├── templates/
│   ├── base.html                       # Główny layout (nav, sidebar, flash)
│   ├── auth/                           # login.html, profile.html
│   ├── workers/                        # list.html, detail.html, form.html
│   ├── jobs/                           # list.html, detail.html, form.html
│   ├── medical/                        # list.html, form.html
│   ├── bhp/                            # list.html, form.html
│   ├── skills/                         # list.html, worker_matrix.html
│   ├── trainings/                      # list.html, detail.html, form.html
│   ├── dashboard/                      # index.html
│   ├── audit/                          # log.html
│   ├── admin/                          # users.html
│   ├── components/                     # sidebar, flash, modals, tables
│   └── errors/                         # 404.html, 500.html
│
├── static/
│   ├── css/
│   │   ├── input.css                   # Tailwind source
│   │   └── output.css                  # Skompilowany CSS
│   └── js/
│       ├── api.js, ui.js, utils.js
│       ├── table-utils.js
│       ├── modals.js
│       ├── keyboard-shortcuts.js
│       └── notifications.js
│
├── scripts/
│   └── seed_users.py                   # Inicjalizacja kont użytkowników HR
│
└── utils/
    └── __init__.py                     # Formatowanie dat, helpers
```

---

## 12. Otwarte kwestie

| ID   | Kwestia                                                                               | Priorytet |
|------|---------------------------------------------------------------------------------------|-----------|
| OQ_1 | Progi alertów (30/60/90 dni) — potwierdzenie wartości domyślnych przez HR            | Wysoki    |
| OQ_2 | Skala oceny umiejętności (`current_rating` 1–3) — czy opisy poziomów są wymagane?    | Średni    |
| OQ_3 | Zakres danych widocznych dla roli `viewer` (czy imiona pracowników, czy anonimowo?)   | Wysoki    |
| OQ_4 | Format eksportu CSV szkoleń — zakres kolumn i kodowanie (UTF_8 BOM dla Excel?)       | Niski     |
| OQ_5 | Polityka retencji backupów (30 dni — potwierdzenie)                                  | Średni    |
| OQ_6 | Powiązanie konta `users` z rekordem `workers` — czy każdy użytkownik musi być pracownikiem? | Średni |
| OQ_7 | Lokalizacja i ścieżka udziału wirtualnego Windows Server dla bazy i backupów         | Krytyczny |

---

*Dokument PRD wersja 1.0. Oparty na analizie bazy danych `database.db` (236 pracowników, 15 tabel, ostatnia modyfikacja 23/01/2026).*

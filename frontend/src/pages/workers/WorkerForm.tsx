import { useMemo, useState, type FormEvent } from 'react';
import { FormActions, FormCard, FormFieldset, TextField, SelectField } from '@/components/ui/form';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { jobsApi } from '@/lib/api/jobs';
import { workersApi, type WorkerPayload, type WorkerProfile } from '@/lib/api/workers';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

const GENDER_OPTIONS = [
  { value: 'UNKNOWN', label: 'Nie podano' },
  { value: 'Female', label: 'Kobieta' },
  { value: 'Male', label: 'Mężczyzna' },
];

interface WorkerFormProps {
  mode: 'create' | 'edit';
  initial?: WorkerProfile;
  onSaved: (workerId: string) => void;
  onCancel: () => void;
}

export function WorkerForm({ mode, initial, onSaved, onCancel }: WorkerFormProps) {
  const toast = useToast();
  useEscapeAction(onCancel);

  const { data: jobsData } = useApiData(() => jobsApi.list());
  // Boss candidates: every active worker except the one being edited (a
  // worker can't be their own boss — the backend re-validates this too).
  const { data: bossData } = useApiData(() => workersApi.list({ status: 'active', page_size: 500 }));

  const jobOptions = useMemo(() => (jobsData?.jobs ?? []).map((j) => ({ value: j.id, label: `${j.id} — ${j.description ?? ''}`.trim() })), [jobsData]);
  const bossOptions = useMemo(
    () =>
      (bossData?.workers ?? [])
        .filter((w) => w.id !== initial?.id)
        .map((w) => ({ value: w.id, label: `${w.full_name}${w.job_description ? ` (${w.job_description})` : ''}` })),
    [bossData, initial],
  );

  const [firstname, setFirstname] = useState(initial?.firstname ?? '');
  const [surname, setSurname] = useState(initial?.surname ?? '');
  const [jobId, setJobId] = useState(initial?.job_id ?? '');
  const [bossId, setBossId] = useState(initial?.boss_id ?? '');
  const [gender, setGender] = useState<string>(initial?.gender ?? 'UNKNOWN');
  const [hireDate, setHireDate] = useState(initial?.hire_date ?? '');

  const [birthDate, setBirthDate] = useState(initial?.birth.birth_date ?? '');
  const [birthPlace, setBirthPlace] = useState(initial?.birth.birth_place ?? '');

  const [nationalities, setNationalities] = useState<string[]>(initial?.nationalities?.length ? initial.nationalities : ['']);

  const [hasForeignerData, setHasForeignerData] = useState(Boolean(initial?.foreigner));
  const [documentKind, setDocumentKind] = useState(initial?.foreigner?.document_kind ?? '');
  const [documentValidity, setDocumentValidity] = useState(initial?.foreigner?.document_validity ?? '');
  const [employmentBasis, setEmploymentBasis] = useState(initial?.foreigner?.employment_basis ?? '');
  const [employmentBasisValidity, setEmploymentBasisValidity] = useState(initial?.foreigner?.employment_basis_validity ?? '');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateNationality(index: number, value: string) {
    setNationalities((cur) => cur.map((n, i) => (i === index ? value : n)));
  }
  function addNationality() {
    setNationalities((cur) => [...cur, '']);
  }
  function removeNationality(index: number) {
    setNationalities((cur) => (cur.length > 1 ? cur.filter((_, i) => i !== index) : ['']));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: WorkerPayload = {
      firstname: firstname.trim(),
      surname: surname.trim(),
      job_id: jobId || null,
      boss_id: bossId || null,
      gender,
      hire_date: hireDate || null,
      birth_date: birthDate || null,
      birth_place: birthPlace.trim() || null,
      nationalities: nationalities.map((n) => n.trim()).filter(Boolean),
      foreigner: hasForeignerData
        ? {
            document_kind: documentKind.trim() || null,
            document_validity: documentValidity || null,
            employment_basis: employmentBasis.trim() || null,
            employment_basis_validity: employmentBasisValidity || null,
          }
        : null,
    };

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const result = await workersApi.create(payload);
        toast.success('Pracownik utworzony.');
        onSaved(result.id);
      } else if (initial) {
        await workersApi.update(initial.id, payload);
        toast.success('Zmiany zapisane.');
        onSaved(initial.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udało się zapisać.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-shell space-y-3">
      {error && <div className="flash-message flash-error">{error}</div>}

      <FormCard>
        <FormFieldset title="Dane podstawowe">
          <TextField label="Imię" name="firstname" value={firstname} onChange={(e) => setFirstname(e.target.value)} required />
          <TextField label="Nazwisko" name="surname" value={surname} onChange={(e) => setSurname(e.target.value)} required />
          <SelectField label="Stanowisko" name="job_id" value={jobId} onChange={(e) => setJobId(e.target.value)} options={jobOptions} placeholder="Brak" />
          <SelectField label="Przełożony" name="boss_id" value={bossId} onChange={(e) => setBossId(e.target.value)} options={bossOptions} placeholder="Brak" />
          <SelectField label="Płeć" name="gender" value={gender} onChange={(e) => setGender(e.target.value)} options={GENDER_OPTIONS} required />
          <TextField label="Data zatrudnienia" name="hire_date" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
        </FormFieldset>

        <FormFieldset title="Dane urodzenia">
          <TextField label="Data urodzenia" name="birth_date" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          <TextField label="Miejsce urodzenia" name="birth_place" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} />
        </FormFieldset>

        <fieldset className="form-fieldset">
          <legend className="form-legend">Obywatelstwo</legend>
          <div className="form-field-full space-y-2">
            {nationalities.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  className="form-input flex-1"
                  placeholder="np. Polska, Ukraina…"
                  value={value}
                  onChange={(e) => updateNationality(i, e.target.value)}
                  aria-label={`Narodowość ${i + 1}`}
                />
                <Button type="button" variant="ghost" small onClick={() => removeNationality(i)} aria-label="Usuń narodowość">
                  <Icon name="remove" size={16} />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" small onClick={addNationality}>
              <Icon name="add" size={14} />
              Dodaj narodowość
            </Button>
          </div>
        </fieldset>

        <fieldset className="form-fieldset">
          <legend className="form-legend">Dane cudzoziemca</legend>
          <div className="form-field-full mb-3">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-ink)' }}>
              <input
                type="checkbox"
                checked={hasForeignerData}
                onChange={(e) => setHasForeignerData(e.target.checked)}
                style={{ accentColor: 'var(--color-accent)' }}
              />
              Pracownik jest cudzoziemcem
            </label>
          </div>
          {hasForeignerData && (
            <div className="form-grid form-field-full">
              <TextField label="Rodzaj dokumentu" name="document_kind" value={documentKind} onChange={(e) => setDocumentKind(e.target.value)} placeholder="np. Karta pobytu" />
              <TextField label="Data ważności dokumentu" name="document_validity" type="date" value={documentValidity} onChange={(e) => setDocumentValidity(e.target.value)} />
              <TextField label="Podstawa zatrudnienia" name="employment_basis" value={employmentBasis} onChange={(e) => setEmploymentBasis(e.target.value)} placeholder="np. Zezwolenie na pracę" />
              <TextField label="Data ważności podstawy" name="employment_basis_validity" type="date" value={employmentBasisValidity} onChange={(e) => setEmploymentBasisValidity(e.target.value)} />
            </div>
          )}
        </fieldset>
      </FormCard>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz pracownika' : 'Zapisz zmiany'} onCancel={onCancel} isLoading={submitting} />
    </form>
  );
}

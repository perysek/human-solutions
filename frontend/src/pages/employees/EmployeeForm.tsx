import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormActions, FormSection, TextField, SelectField, TextareaField } from '@/components/ui/form';
import { employeesApi, type EmployeeListItem, type EmployeePayload } from '@/lib/api/employees';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Zatrudniony' },
  { value: 'on_leave', label: 'Na urlopie' },
  { value: 'terminated', label: 'Zwolniony' },
];

interface EmployeeFormProps {
  mode: 'create' | 'edit';
  initial?: EmployeeListItem;
  onSaved: (employeeId: number) => void;
}

export function EmployeeForm({ mode, initial, onSaved }: EmployeeFormProps) {
  const navigate = useNavigate();
  const toast = useToast();

  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [position, setPosition] = useState(initial?.position ?? '');
  const [status, setStatus] = useState(initial?.employment_status ?? 'active');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [hireDate, setHireDate] = useState(initial?.hire_date ?? '');
  const [terminationDate, setTerminationDate] = useState(initial?.termination_date ?? '');
  const [baseSalary, setBaseSalary] = useState(initial?.base_salary != null ? String(initial.base_salary) : '');
  const [commissionRate, setCommissionRate] = useState(initial?.commission_rate != null ? String(initial.commission_rate) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: EmployeePayload = {
      first_name: firstName,
      last_name: lastName,
      position: position || null,
      employment_status: status,
      phone: phone || null,
      email: email || null,
      hire_date: hireDate || null,
      termination_date: terminationDate || null,
      base_salary: baseSalary ? Number(baseSalary) : null,
      commission_rate: commissionRate ? Number(commissionRate) : null,
      notes: notes || null,
      // is_active is the soft-delete flag, set FALSE only by the row delete
      // action — never derived from employment_status. A "terminated"
      // employee is a real, visible status, not a deleted record.
      is_active: true,
    };

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const result = await employeesApi.create(payload);
        toast.success('Pracownik utworzony.');
        onSaved(result.employee_id);
      } else if (initial) {
        await employeesApi.update(initial.id, payload);
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
    <form onSubmit={handleSubmit} className="space-y-6" style={{ maxWidth: '48rem' }}>
      {error && <div className="flash-message flash-error">{error}</div>}

      <FormSection title="Dane podstawowe">
        <TextField label="Imię" name="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <TextField label="Nazwisko" name="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        <TextField label="Stanowisko" name="position" value={position} onChange={(e) => setPosition(e.target.value)} />
        <SelectField label="Status zatrudnienia" name="employment_status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} required />
      </FormSection>

      <FormSection title="Kontakt">
        <TextField label="Telefon" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextField label="Email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormSection>

      <FormSection title="Zatrudnienie i wynagrodzenie">
        <TextField label="Data zatrudnienia" name="hire_date" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
        <TextField label="Data zwolnienia" name="termination_date" type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
        <TextField label="Wynagrodzenie podstawowe (zł)" name="base_salary" type="number" step="0.01" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
        <TextField label="Prowizja (%)" name="commission_rate" type="number" step="0.01" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
        <TextareaField label="Notatki" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth />
      </FormSection>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz pracownika' : 'Zapisz zmiany'} onCancel={() => navigate('/employees')} isLoading={submitting} />
    </form>
  );
}

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { SelectWrap } from './SelectWrap';

/**
 * Form field primitives — the React equivalent of templates/components/
 * form_fields.html's macro library. Same token classes (form-label,
 * form-input, form-select, form-textarea, form-card), same conventions
 * (required indicator, helper/error text below the field, full-width spans
 * both grid columns). Not every macro parameter is reproduced 1:1 (with_paste
 * OCR workflow has no source to paste from in this boilerplate) but the
 * visual/behavioural contract matches.
 */

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  helper?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

function FieldWrapper({ label, htmlFor, required, error, helper, fullWidth, children }: FieldWrapperProps) {
  return (
    <div className={fullWidth ? 'form-field-full' : undefined}>
      <label htmlFor={htmlFor} className="form-label">
        {label}
        {required && (
          <span style={{ color: 'var(--color-error)' }} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs flex items-center gap-1" style={{ color: 'var(--color-error)' }}>
          {error}
        </p>
      )}
      {!error && helper && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-subtle)' }}>
          {helper}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<FieldWrapperProps, 'htmlFor' | 'children'> &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { name: string };

export function TextField({ label, name, required, error, helper, fullWidth, ...rest }: TextFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={name} required={required} error={error} helper={helper} fullWidth={fullWidth}>
      <input id={name} name={name} required={required} className="form-input" {...rest} />
    </FieldWrapper>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

type SelectFieldProps = Omit<FieldWrapperProps, 'htmlFor' | 'children'> &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & { name: string; options: SelectOption[]; placeholder?: string };

export function SelectField({
  label,
  name,
  required,
  error,
  helper,
  fullWidth,
  options,
  placeholder,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={name} required={required} error={error} helper={helper} fullWidth={fullWidth}>
      <SelectWrap>
        <select id={name} name={name} required={required} className="form-select" {...rest}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </SelectWrap>
    </FieldWrapper>
  );
}

type TextareaFieldProps = Omit<FieldWrapperProps, 'htmlFor' | 'children'> &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { name: string };

export function TextareaField({ label, name, required, error, helper, fullWidth, rows = 3, ...rest }: TextareaFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={name} required={required} error={error} helper={helper} fullWidth={fullWidth}>
      <textarea id={name} name={name} required={required} rows={rows} className="form-textarea" {...rest} />
    </FieldWrapper>
  );
}

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  name: string;
  label: string;
  description?: string;
}

export function CheckboxField({ name, label, description, ...rest }: CheckboxFieldProps) {
  return (
    <div className="flex items-start gap-2">
      <input id={name} name={name} type="checkbox" className="mt-0.5" style={{ accentColor: 'var(--color-accent)' }} {...rest} />
      <label htmlFor={name} className="text-sm" style={{ color: 'var(--color-ink)' }}>
        {label}
        {description && (
          <span className="block text-xs" style={{ color: 'var(--color-ink-subtle)' }}>
            {description}
          </span>
        )}
      </label>
    </div>
  );
}

/** Card shell for one or more FormFieldset groups. Kept separate from
 * FormFieldset so multi-topic forms (see EmployeeForm) can put several
 * fieldsets — each a lighter divider, not a full card — inside a single
 * card instead of paying full card padding/border/shadow per topic. */
export function FormCard({ children }: { children: ReactNode }) {
  return <div className="form-card animate-fade-up">{children}</div>;
}

/** One labeled group of fields, laid out in the auto-fill .form-grid.
 * A real <fieldset>/<legend> pair — screen readers announce the group
 * name before each field inside it, which a styled <h2> wouldn't do. */
export function FormFieldset({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="form-fieldset">
      <legend className="form-legend">{title}</legend>
      {description && <p className="form-fieldset-description">{description}</p>}
      <div className="form-grid">{children}</div>
    </fieldset>
  );
}

/** Single-topic convenience wrapper (RoleForm, UserForm): one card holding
 * one fieldset. Forms with several topics compose FormCard + FormFieldset
 * directly instead (see EmployeeForm) to share one card across topics. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <FormCard>
      <FormFieldset title={title} description={description}>
        {children}
      </FormFieldset>
    </FormCard>
  );
}

export function FormActions({
  submitLabel = 'Zapisz',
  onCancel,
  isLoading,
}: {
  submitLabel?: string;
  onCancel?: () => void;
  isLoading?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button type="submit" className="form-btn-primary" disabled={isLoading}>
        {isLoading ? 'Zapisywanie…' : submitLabel}
      </button>
      {onCancel && (
        <button type="button" className="form-btn-secondary" onClick={onCancel}>
          Anuluj
        </button>
      )}
    </div>
  );
}

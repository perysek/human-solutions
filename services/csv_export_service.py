"""
services/csv_export_service.py — IMPLEMENTATION_PLAN.md §10, TRN_11.

First CSV export in this app. `utf-8-sig` (BOM) is OQ_4's confirmed
resolution — Excel on Windows (this app's actual audience) mis-decodes a
plain UTF-8 CSV without it, garbling any diacritic (ł, ż, ę, …) in a
worker's name. Semicolon delimiter for the same Excel-compatibility reason:
pl-PL Excel treats the comma as the decimal separator, so a comma-delimited
CSV opens as one column instead of several.
"""
import csv
import io

from exceptions import NotFoundError
from repositories.trainings.training_participant_repository import TrainingParticipantRepository
from repositories.trainings.training_repository import TrainingRepository

_HEADER = [
    'Pracownik', 'Stanowisko', 'Data rozpoczęcia', 'Data zakończenia',
    'Uwagi', 'Trener', 'Data oceny skuteczności',
    # MOBILE_PRESENCE_CONFIRMATION_PLAN.md — this pair *is* the artifact that
    # replaces the scanned, wet-signed paper sheet for an audit/inspection.
    'Obecność potwierdzona', 'Podpis (potwierdzenie mobilne)',
]


def export_training_participants_csv(training_id: int) -> bytes:
    """TRN_11 — lista uczestników szkolenia jako CSV. Kolumny = wszystkie
    pola `training_participants` połączone z nazwiskiem pracownika i jego
    stanowiskiem (OQ_4's confirmed column set)."""
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')

    rows = TrainingParticipantRepository().get_export_rows(training_id)

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=';')
    writer.writerow(_HEADER)
    for r in rows:
        writer.writerow([
            f"{r['worker_firstname']} {r['worker_surname']}",
            r['job_description'] or '',
            r['start_date'].isoformat() if r['start_date'] else '',
            r['finish_date'].isoformat() if r['finish_date'] else '',
            r['remarks'] or '',
            r['trainer_names'] or '',
            r['effectiveness_date'].isoformat() if r['effectiveness_date'] else '',
            r['confirmed_at'].isoformat() if r['confirmed_at'] else '',
            r['signature_name'] or '',
        ])

    return buf.getvalue().encode('utf-8-sig')

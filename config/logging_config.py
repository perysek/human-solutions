"""Structured JSON logging, configured once at app boot.

Every log record gets a request_id (from Flask g, blank outside a request
context — e.g. scripts/, migrations) so log lines from the same request can
be correlated across handlers/repositories without threading an argument
through every function signature.
"""
import logging
import sys

from flask import g
from pythonjsonlogger.json import JsonFormatter


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.request_id = getattr(g, 'request_id', '-')
        except RuntimeError:
            record.request_id = '-'  # no app/request context (scripts, migrations)
        return True


def configure_logging(level: str = 'INFO') -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(
        '%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s'
    ))
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

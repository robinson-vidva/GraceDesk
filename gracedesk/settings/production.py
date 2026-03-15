"""
Django production settings for gracedesk project.
"""

import os

import dj_database_url
from decouple import config

from .base import *  # noqa: F401, F403

DEBUG = False

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("ALLOWED_HOSTS", "").replace('"', '').split(",")
    if h.strip()
]

# Database — PostgreSQL via DATABASE_URL
DATABASES = {
    "default": dj_database_url.config(
        default=config("DATABASE_URL", default=""),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# Security settings
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Anymail — Brevo
ANYMAIL = {
    "BREVO_API_KEY": config("BREVO_API_KEY", default=""),
}
EMAIL_BACKEND = "anymail.backends.brevo.EmailBackend"
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="noreply@gracedesk.org")

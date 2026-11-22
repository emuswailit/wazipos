"""
Django settings for wazi project.
"""

from pathlib import Path
from datetime import timedelta
from decouple import Csv, config
import os
import base64
from cryptography.fernet import Fernet

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve(strict=True).parent.parent

# Parsed as a boolean: the string "False" from .env used to switch debug ON.
DEBUG = config("DEBUG", default=False, cast=bool)
CELERY_IMPORT = ['properties.tasks', 'employees.tasks', 'distributors.tasks', 'hospitals.tasks', 'drugs.tasks', 'loyalty.tasks', 'logistics.tasks', 'messaging.tasks', 'manufacturers.tasks', 'payments.tasks', 'products.tasks', 'parking.tasks', 'retailers.tasks', 'services.tasks', 'saccos.tasks', 'expenses.tasks', 'transport.tasks', 'restaurants.tasks', 'wholesalers.tasks', 'wifi.tasks', 'subscriptions.tasks', 'chats.tasks', 'stats.tasks', 'ussd.tasks']

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config("SECRET_KEY")
FIELD_ENCRYPTION_KEY  = config("FIELD_ENCRYPTION_KEY")
ENCRYPT_KEY=config("ENCRYPT_KEY")

# Hosts this API answers to. Our domains are always included; ALLOWED_HOSTS in .env
# adds others (e.g. the server IP). A "*" there allows every host — don't use it in production.
def _host_list(raw):
    """Hosts from .env in any form: commas or spaces, with or without quotes / [brackets]."""
    import re as _re

    return [h for h in (p.strip().strip("'\"") for p in _re.split(r"[,\s\[\]]+", str(raw or ""))) if h]


# Our own domains are always served; .env ALLOWED_HOSTS adds any others (IPs, extra domains).
ALLOWED_HOSTS = list(dict.fromkeys(
    ["api.wazipos.co.ke", "wazipos.co.ke", "www.wazipos.co.ke", "localhost", "127.0.0.1"]
    + _host_list(config("ALLOWED_HOSTS", default=""))
))

DATA_UPLOAD_MAX_NUMBER_FIELDS = 10000
FILE_UPLOAD_MAX_MEMORY_SIZE = 5242880

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    'rest_framework.authtoken',
    'dj_rest_auth',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
    'dj_rest_auth.registration',
    "rest_framework_api_key",
    "channels",
    "django_celery_beat",
    "django_celery_results",
    "encrypted_model_fields",
    "authentication",
    "django.contrib.sites",
    "corsheaders",
    "drf_yasg",
    "django.contrib.gis",
    "rest_framework_gis", 
    "django_advance_thumbnail",
    "cities_light",
    "subscriptions",
    "hospitals",
    "hotspots",
    "distributors",
    "drugs",
    "entitylocations",
    "employees",
    "loyalty",
    "logistics",
    "messaging",
    "manufacturers",
    "payments",
    "products",
    "parking",
    "retailers",
    "services",
    "saccos",
    "expenses",
    "properties",
    "transport",
    "restaurants",
    "wholesalers",
    "wifi",
    "chats",
    "stats",
    "ussd",
    "analytics",
    # Stock taking as a service to vendors (stocktakes/models.py)
    "stocktakes",
    # Owner-away protection: shifts, blind cash counts, commissions, alerts (shopguard/models.py)
    "shopguard",
    # Email / SMS / push on orders, pay-ins and payouts (notifications/signals.py)
    "notifications",
]

AUTHENTICATION_BACKENDS = (
    "django.contrib.auth.backends.ModelBackend",
    "authentication.backends.UserNamePhoneAuthBackend",
)

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "core.middleware.CurrentRequestMiddleware",
    # Logs every API request (IP, signed-in user, action): core/access_log.py
    "core.access_log.AccessLogMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django_browser_reload.middleware.BrowserReloadMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    'whitenoise.middleware.WhiteNoiseMiddleware',
]

ROOT_URLCONF = "wazi.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [os.path.join(BASE_DIR, "templates")],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "wazi.wsgi.application"

# Configuration for django channels
ASGI_APPLICATION = "wazi.asgi.application"
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [("127.0.0.1", 6379)]},
    }
}

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": config("DB_NAME"),
        "USER": config("DB_USER"),
        "PASSWORD": config("DB_PASS"),
        "HOST": config("DB_HOST"),
        "PORT": config("PG_PORT"),
        "CONN_MAX_AGE": None,
    },
     'radius': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'radius_db',                  
        'USER': 'radius_admin',               
        'PASSWORD': config("DB_PASS"), 
        'HOST': config("DB_HOST"),                 
        'PORT': '5432',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Nairobi"
USE_I18N = True
USE_L10N = True
USE_TZ = True

DATABASE_ROUTERS = ['wazi.settings.routers.RadiusRouter']

STATIC_URL = "/static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")

MEDIA_ROOT = os.path.join(BASE_DIR, config("MEDIA_ROOT"))
MEDIA_URL = config("MEDIA_URL")

SITE_ID = 3
AUTH_USER_MODEL = "authentication.Users"

FIXTURES_DIRS = (os.path.join(BASE_DIR, "fixtures"),)

LOCATION_FIELD = {
    "map.provider": "google",
    "map.zoom": 13,
    "search.provider": "google",
    "search.suffix": "",
    "provider.google.api": "//maps.google.com/maps/api/js",
    "provider.google.api_key": "",
    "provider.google.map_type": "ROADMAP",
    "provider.mapbox.access_token": "",
    "provider.mapbox.max_zoom": 18,
    "provider.mapbox.id": "mapbox.streets",
    "provider.openstreetmap.max_zoom": 18,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "SIGNING_KEY": config("SECRET_KEY"),
    "VERIFYING_KEY": config("SECRET_KEY"),
}

REST_AUTH = {
    "USE_JWT": True,
    "JWT_AUTH_HTTPONLY": False,  
}

REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "EXCEPTION_HANDLER": "utils.exceptionhandler.custom_exception_handler",
    "PAGE_SIZE": 10000,
    "NON_FIELD_ERRORS_KEY": "error",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DATETIME_FORMAT": "%Y-%m-%d %H:%M:%S",
    "DEFAULT_FILTER_BACKENDS": (
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "SEARCH_PARAM": "q",
    "ORDERING_PARAM": "ordering",
    'DEFAULT_PARSER_CLASSES': (
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser'
     )
}

EMAIL_HOST = config("EMAIL_HOST")
EMAIL_USE_TLS = True
EMAIL_PORT = 587
EMAIL_HOST_USER = config("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD")

ACCOUNT_EMAIL_VERIFICATION = "none" 
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_AUTHENTICATION_METHOD = "email"

# Facebook sign-in (placeholder): leave empty until the app is registered with Meta.
FACEBOOK_APP_ID = config("FACEBOOK_APP_ID", default="")
FACEBOOK_APP_SECRET = config("FACEBOOK_APP_SECRET", default="")

GOOGLE_OAUTH_CLIENT_ID = config("GOOGLE_OAUTH_CLIENT_ID")
GOOGLE_OAUTH_CLIENT_SECRET = config("GOOGLE_OAUTH_CLIENT_SECRET")
GOOGLE_OAUTH_CALLBACK_URL = config("GOOGLE_OAUTH_CALLBACK_URL")
# Client IDs whose Google ID tokens the mobile/web app may send to /authentication/google/.
# The app requests tokens for the Web client ID on every platform, so that is the default.
GOOGLE_OAUTH_ALLOWED_CLIENT_IDS = [
    client_id.strip()
    for client_id in config("GOOGLE_OAUTH_ALLOWED_CLIENT_IDS", default=GOOGLE_OAUTH_CLIENT_ID).split(",")
    if client_id.strip()
]

SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APPS": [
            {
                "client_id": GOOGLE_OAUTH_CLIENT_ID,
                "secret": GOOGLE_OAUTH_CLIENT_SECRET,
                "key": "",
            },
        ],
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {
            "access_type": "online",
        },
    }
}

# Browsers may call the API only from these sites (the phone apps send no Origin and
# are unaffected). Override with CORS_ALLOWED_ORIGINS=https://a.com,... in .env;
# CORS_ALLOW_ALL=True only for local debugging.
CORS_ORIGIN_ALLOW_ALL = config("CORS_ALLOW_ALL", default=False, cast=bool)
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="https://wazipos.co.ke,https://www.wazipos.co.ke,https://app.wazipos.co.ke,http://localhost:8081,http://localhost:19006",
    cast=Csv(),
)
CSRF_TRUSTED_ORIGINS = [
    "https://wazipos.co.ke",
    "https://api.wazipos.co.ke",
    "http://127.0.0.1:8000",
    "https://api.jambopay.com",
    "http://localhost:5173",
    "http://localhost:8081",
]

CORS_ORIGIN_WHITELIST = ("http://localhost:3000",)

# Our apps say where a request came from (core/access_log.py). Without these,
# browsers would refuse every request at the CORS preflight.
from corsheaders.defaults import default_headers  # noqa: E402

CORS_ALLOW_HEADERS = (*default_headers, "x-client-source", "x-client-route")

CORS_ALLOWED_ORIGINS = [
    "https://wazipos.co.ke",
    "http://localhost:5173",
    "http://localhost:8081",
]

CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = "django-db"
CELERY_ENABLE_UTC = False
CELERY_ACCEPT_CONTENT = ["application/json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Africa/Nairobi"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "entity_admin"

SECURE_REDIRECT_EXEMPT = ["transport"]

INTERNAL_IPS = [
    "127.0.0.1",
]

import logging
import logging.config
from django.utils.log import DEFAULT_LOGGING

logger = logging.getLogger(__name__)

LOG_LEVEL = "INFO"

# --- LOGGING FIX ---
# Define the log directory inside the project folder and create it if it doesn't exist
LOG_DIR = os.path.join(BASE_DIR, "logs")
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "console": {
            "format": "%(asctime)s %(name)-12s %(levelname)-8s %(message)s"
        },
        "file": {
            "format": "%(asctime)s %(name)-12s %(levelname)-8s %(message)s"
        },
        "django.server": DEFAULT_LOGGING["formatters"]["django.server"],
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "console"
        },
        "file": {
            "level": "INFO",
            "class": "logging.FileHandler",
            "formatter": "file",
            "filename": os.path.join(LOG_DIR, "wazi.log")
        },
        "django.server": DEFAULT_LOGGING["handlers"]["django.server"],
    },
    "loggers": {
        "": {
            "level": "INFO", 
            "handlers": ["console", "file"], 
            "propagate": False
        },
        # 🌟 FIXED: Added the specific logger your create_log function uses
        "wazi log": {
            "level": "INFO",
            "handlers": ["console", "file"],
            "propagate": False,
        },
        "apps": {
            "level": "INFO", 
            "handlers": ["console", "file"], 
            "propagate": False
        },
        "django.server": DEFAULT_LOGGING["loggers"]["django.server"],
        # 🌟 FIXED: Added file handler to Daphne so crashes are logged
        "daphne": {
            "handlers": ["console", "file"],
            "level": "INFO"
        }
    }
})

# ---------------------------------------------------------------- email (every environment)
# Used by core/utils.send_email and core/notify.py (order / payment / payout emails).
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_USE_TLS = True
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="") or EMAIL_HOST_USER
DOMAIN = config("DOMAIN", default="api.wazipos.co.ke")
SITE_NAME = "Wazipos"

"""
Pure helpers for the inventory prediction pipeline.

No DB access, no async, no Channels. Everything here is a
function of its arguments, which makes it easy to test and
easy to reuse outside the consumer.
"""

import datetime
import decimal
import json
import uuid
from datetime import timedelta
from decimal import Decimal

import numpy as np
import pandas as pd
from django.db import transaction
from django.db.models import Min, Sum
from django.utils import timezone
from sklearn.linear_model import LinearRegression


# =========================================================
# JSON encoder
# =========================================================

class UUIDEncoder(json.JSONEncoder):
    """Encoder for UUID / date / datetime / Decimal."""

    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return str(obj)
        return super().default(obj)


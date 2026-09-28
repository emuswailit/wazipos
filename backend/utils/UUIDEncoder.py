# utils/UUIDEncoder.py

import datetime
import decimal
import json
import uuid


class UUIDEncoder(json.JSONEncoder):
    """
    JSON encoder that handles the value types Django serializers
    commonly emit but stdlib `json` does not natively support:
      - UUID
      - Decimal
      - date
      - datetime
      - time
      - timedelta
      - set

    Anything else falls through to the default encoder, which
    raises TypeError — the caller sees the same failure mode they
    would without this class.
    """

    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)

        if isinstance(obj, decimal.Decimal):
            # String preserves precision; if the consumer of this
            # payload expects a number, swap for float(obj).
            return str(obj)

        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()

        if isinstance(obj, datetime.time):
            return obj.isoformat()

        if isinstance(obj, datetime.timedelta):
            return obj.total_seconds()

        if isinstance(obj, (set, frozenset)):
            return list(obj)

        return super().default(obj)
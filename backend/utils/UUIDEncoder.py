import json
import uuid

class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            # If the object is a UUID, convert it to a string
            return str(obj)
        # Otherwise, use the default JSONEncoder behavior
        return json.JSONEncoder.default(self, obj)
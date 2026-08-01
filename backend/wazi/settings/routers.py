# routers.py

class RadiusRouter:
    """
    A router to control all database operations for the 
    isolated FreeRADIUS authentication server.
    """
    def db_for_read(self, model, **hints):
        if model._meta.app_label == 'radius':
            return 'radius'
        return 'default'

    def db_for_write(self, model, **hints):
        if model._meta.app_label == 'radius':
            return 'radius'
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        if obj1._meta.app_label == 'radius' or obj2._meta.app_label == 'radius':
            return True
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label == 'radius':
            return db == 'radius'
        return db == 'default'

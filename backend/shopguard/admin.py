from django.contrib import admin

from shopguard import models

for m in (models.GuardSettings, models.StaffShifts, models.CommissionPlans, models.EmployeeCommissions, models.CommissionPayouts, models.UnknownScans, models.GuardAlerts):
    admin.site.register(m)

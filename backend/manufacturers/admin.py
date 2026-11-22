from django.contrib import admin

# Register your models here.


# The manufacturer <-> distributor trade (manufacturers/services/).
from manufacturers import models as _m  # noqa: E402

for _model in (_m.ManufacturerBatches, _m.ManufacturerPriceDiscounts, _m.ManufacturerQuantityDiscounts,
               _m.DistributorPurchaseOrders, _m.ManufacturerOrderPayments):
    admin.site.register(_model)

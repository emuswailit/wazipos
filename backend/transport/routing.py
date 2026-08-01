from django.urls import re_path,path

from . import consumers

transport_websocket_urlpatterns = [

    path("ws/transport/agents/sacco-personnel/",consumers.AgentSaccoPersonnelConsumer.as_asgi()),
    path("ws/transport/agents/vehicles/",consumers.AgentVehiclesConsumer.as_asgi()),
    path("ws/transport/bodaboda/trips/create/",consumers.BodabodaTripsConsumer.as_asgi()),
    path("ws/transport/bodaboda/trips/scheduled/",consumers.SaccoPersonnelTripsConsumer.as_asgi()),

]